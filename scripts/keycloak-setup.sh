#!/usr/bin/env bash
# =============================================================================
# keycloak-setup.sh — cria realm, client e usuário de teste no Keycloak
#
# Uso:
#   bash scripts/keycloak-setup.sh
#
# Variáveis opcionais:
#   KEYCLOAK_URL        (default: http://localhost:8080)
#   KEYCLOAK_REALM      (default: event-system)
#   KEYCLOAK_CLIENT_ID  (default: nest-api)
#   TEST_USERNAME       (default: testuser)
#   TEST_PASSWORD       (default: testpass)
# =============================================================================
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-event-system}"
KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-nest-api}"
SA_CLIENT_ID="${KEYCLOAK_SA_CLIENT_ID:-nest-api-sa}"
SA_CLIENT_SECRET="${KEYCLOAK_SA_CLIENT_SECRET:-nest-api-sa-secret}"
TEST_USERNAME="${TEST_USERNAME:-testuser}"
TEST_PASSWORD="${TEST_PASSWORD:-testpass}"
ADMIN_USER="admin"
ADMIN_PASS="admin"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()      { echo -e "${GREEN}✅  $*${NC}"; }
info()    { echo -e "${YELLOW}ℹ   $*${NC}"; }
fail_exit() { echo -e "${RED}❌  $*${NC}"; exit 1; }

# ── aguarda Keycloak estar pronto ─────────────────────────────────────────────
info "Aguardando Keycloak em ${KEYCLOAK_URL} ..."
for i in $(seq 1 30); do
  if curl -sf "${KEYCLOAK_URL}/realms/master" >/dev/null 2>&1; then
    ok "Keycloak está pronto"
    break
  fi
  [[ "$i" -eq 30 ]] && fail_exit "Keycloak não respondeu após 60s. Está rodando?"
  sleep 2
done

# ── obtém token de admin (realm master) ───────────────────────────────────────
info "Obtendo token de administrador..."
TOKEN_RESPONSE_FILE="/tmp/kc_token_response.json"
HTTP_STATUS=$(curl -sS -o "${TOKEN_RESPONSE_FILE}" -w "%{http_code}" -X POST \
  "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-cli" \
  -d "grant_type=password" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}") || fail_exit "Falha de conexão ao obter token de admin"

if [[ "${HTTP_STATUS}" != "200" ]]; then
  RESPONSE_BODY=$(cat "${TOKEN_RESPONSE_FILE}" 2>/dev/null || true)
  fail_exit "Não foi possível obter token de admin (HTTP ${HTTP_STATUS}). Resposta: ${RESPONSE_BODY:-<vazia>}"
fi

ADMIN_TOKEN=$(node -e "const fs=require('fs'); const p=process.argv[1]; const raw=fs.existsSync(p)?fs.readFileSync(p,'utf8').trim():''; if(!raw){process.exit(0)}; try{const j=JSON.parse(raw); process.stdout.write(j.access_token||'')}catch{process.exit(0)}" "${TOKEN_RESPONSE_FILE}")
[[ -z "$ADMIN_TOKEN" ]] && fail_exit "Não foi possível extrair access_token da resposta em ${TOKEN_RESPONSE_FILE}"
ok "Token de admin obtido"

kc() { curl -sf -H "Authorization: Bearer ${ADMIN_TOKEN}" -H "Content-Type: application/json" "$@"; }

# ── cria realm event-system ───────────────────────────────────────────────────
info "Verificando realm '${KEYCLOAK_REALM}'..."
if kc "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}" >/dev/null 2>&1; then
  info "Realm '${KEYCLOAK_REALM}' já existe — pulando criação"
else
  kc -X POST "${KEYCLOAK_URL}/admin/realms" \
    -d "{\"realm\":\"${KEYCLOAK_REALM}\",\"enabled\":true}" >/dev/null
  ok "Realm '${KEYCLOAK_REALM}' criado"
fi

# ── cria client nest-api ──────────────────────────────────────────────────────
info "Verificando client '${KEYCLOAK_CLIENT_ID}'..."
EXISTING_CLIENT=$(kc "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients?clientId=${KEYCLOAK_CLIENT_ID}" \
  | node -e "const c=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(c[0]?.id||'')")

CLIENT_PAYLOAD="{
  \"clientId\": \"${KEYCLOAK_CLIENT_ID}\",
  \"enabled\": true,
  \"publicClient\": true,
  \"directAccessGrantsEnabled\": true,
  \"standardFlowEnabled\": false
}"

if [[ -n "$EXISTING_CLIENT" ]]; then
  CLIENT_ID_VAL="$EXISTING_CLIENT"
  kc -X PUT "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients/${CLIENT_ID_VAL}" \
    -d "$CLIENT_PAYLOAD" >/dev/null
  ok "Client '${KEYCLOAK_CLIENT_ID}' atualizado (directAccessGrants habilitado)"
else
  kc -X POST "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients" \
    -d "$CLIENT_PAYLOAD" >/dev/null
  CLIENT_ID_VAL=$(kc "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients?clientId=${KEYCLOAK_CLIENT_ID}" \
    | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))[0].id)")
  ok "Client '${KEYCLOAK_CLIENT_ID}' criado"
fi

# ── adiciona audience mapper (aud: nest-api no JWT) ───────────────────────────
info "Configurando audience mapper..."
MAPPER_EXISTS=$(kc "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients/${CLIENT_ID_VAL}/protocol-mappers/models" \
  | node -e "const m=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); \
             process.stdout.write(m.find(x=>x.name==='audience-mapper')?'yes':'no')")

if [[ "$MAPPER_EXISTS" == "yes" ]]; then
  info "Audience mapper já existe — pulando"
else
  kc -X POST \
    "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients/${CLIENT_ID_VAL}/protocol-mappers/models" \
    -d "{
      \"name\": \"audience-mapper\",
      \"protocol\": \"openid-connect\",
      \"protocolMapper\": \"oidc-audience-mapper\",
      \"config\": {
        \"included.client.audience\": \"${KEYCLOAK_CLIENT_ID}\",
        \"id.token.claim\": \"false\",
        \"access.token.claim\": \"true\"
      }
    }" >/dev/null
  ok "Audience mapper configurado (aud: ${KEYCLOAK_CLIENT_ID})"
fi

# ── cria service account (client_credentials p/ manage-users) ────────────────
info "Verificando service account client '${SA_CLIENT_ID}'..."
EXISTING_SA=$(kc "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients?clientId=${SA_CLIENT_ID}" \
  | node -e "const c=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(c[0]?.id||'')")

SA_PAYLOAD="{
  \"clientId\": \"${SA_CLIENT_ID}\",
  \"enabled\": true,
  \"publicClient\": false,
  \"serviceAccountsEnabled\": true,
  \"standardFlowEnabled\": false,
  \"directAccessGrantsEnabled\": false,
  \"secret\": \"${SA_CLIENT_SECRET}\"
}"

if [[ -n "$EXISTING_SA" ]]; then
  SA_ID_VAL="$EXISTING_SA"
  kc -X PUT "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients/${SA_ID_VAL}" \
    -d "$SA_PAYLOAD" >/dev/null
  ok "Service account client '${SA_CLIENT_ID}' atualizado"
else
  kc -X POST "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients" \
    -d "$SA_PAYLOAD" >/dev/null
  SA_ID_VAL=$(kc "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients?clientId=${SA_CLIENT_ID}" \
    | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))[0].id)")
  ok "Service account client '${SA_CLIENT_ID}' criado"
fi

# Obtém o usuário de serviço gerado pelo Keycloak para este client
SA_USER_ID=$(kc "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients/${SA_ID_VAL}/service-account-user" \
  | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).id||'')")

# Obtém o ID interno do client realm-management e o role manage-users
REALM_MGMT_ID=$(kc "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients?clientId=realm-management" \
  | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))[0].id||'')")

MANAGE_USERS_ROLE=$(kc "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients/${REALM_MGMT_ID}/roles/manage-users")

# Atribui o role manage-users ao service account
kc -X POST \
  "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users/${SA_USER_ID}/role-mappings/clients/${REALM_MGMT_ID}" \
  -d "[${MANAGE_USERS_ROLE}]" >/dev/null
ok "Role 'manage-users' atribuído ao service account '${SA_CLIENT_ID}'"

# ── cria usuário de teste ─────────────────────────────────────────────────────
info "Verificando usuário '${TEST_USERNAME}'..."
EXISTING_USER=$(kc "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users?username=${TEST_USERNAME}" \
  | node -e "const u=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(u[0]?.id||'')")

if [[ -n "$EXISTING_USER" ]]; then
  info "Usuário '${TEST_USERNAME}' já existe — pulando criação"
  USER_ID_VAL="$EXISTING_USER"
else
  kc -X POST "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users" \
    -d "{
      \"username\": \"${TEST_USERNAME}\",
      \"email\": \"${TEST_USERNAME}@example.com\",
      \"emailVerified\": true,
      \"firstName\": \"Test\",
      \"lastName\": \"User\",
      \"enabled\": true,
      \"credentials\": [{\"type\":\"password\",\"value\":\"${TEST_PASSWORD}\",\"temporary\":false}]
    }" >/dev/null
  ok "Usuário '${TEST_USERNAME}' criado com senha '${TEST_PASSWORD}'"

  USER_ID_VAL=$(kc "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/users?username=${TEST_USERNAME}" \
    | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))[0].id)")
fi

# ── resumo ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Keycloak configurado com sucesso!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Realm:         ${KEYCLOAK_REALM}"
echo "  Client:        ${KEYCLOAK_CLIENT_ID}"
echo "  Service Acct:  ${SA_CLIENT_ID} (secret: ${SA_CLIENT_SECRET})"
echo "  Usuário teste: ${TEST_USERNAME} / ${TEST_PASSWORD}"
echo ""
echo "  Para testar a API:"
echo "  KEYCLOAK_USERNAME=${TEST_USERNAME} KEYCLOAK_PASSWORD=${TEST_PASSWORD} \\"
echo "    bash scripts/test-endpoints.sh"
echo ""
