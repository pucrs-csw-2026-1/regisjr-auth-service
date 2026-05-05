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
ADMIN_TOKEN=$(curl -sf -X POST \
  "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-cli" \
  -d "grant_type=password" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" \
  | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).access_token)")

[[ -z "$ADMIN_TOKEN" ]] && fail_exit "Não foi possível obter token de admin"
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

if [[ -n "$EXISTING_CLIENT" ]]; then
  info "Client '${KEYCLOAK_CLIENT_ID}' já existe — atualizando configuração"
  CLIENT_ID_VAL="$EXISTING_CLIENT"
else
  kc -X POST "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients" \
    -d "{
      \"clientId\": \"${KEYCLOAK_CLIENT_ID}\",
      \"enabled\": true,
      \"publicClient\": true,
      \"directAccessGrantsEnabled\": true,
      \"standardFlowEnabled\": false
    }" >/dev/null
  ok "Client '${KEYCLOAK_CLIENT_ID}' criado"

  CLIENT_ID_VAL=$(kc "${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients?clientId=${KEYCLOAK_CLIENT_ID}" \
    | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))[0].id)")
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
echo "  Realm:    ${KEYCLOAK_REALM}"
echo "  Client:   ${KEYCLOAK_CLIENT_ID}"
echo "  Usuário:  ${TEST_USERNAME} / ${TEST_PASSWORD}"
echo ""
echo "  Para testar a API:"
echo "  KEYCLOAK_USERNAME=${TEST_USERNAME} KEYCLOAK_PASSWORD=${TEST_PASSWORD} \\"
echo "    bash scripts/test-endpoints.sh"
echo ""
