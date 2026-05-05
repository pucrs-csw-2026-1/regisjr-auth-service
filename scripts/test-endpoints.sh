#!/usr/bin/env bash
# =============================================================================
# test-endpoints.sh — testa todos os endpoints da API
#
# Uso:
#   KEYCLOAK_USERNAME=user KEYCLOAK_PASSWORD=pass bash scripts/test-endpoints.sh
#
# Variáveis opcionais:
#   KEYCLOAK_URL      (default: http://localhost:8080)
#   KEYCLOAK_REALM    (default: event-system)
#   KEYCLOAK_CLIENT_ID (default: nest-api)
#   API_URL           (default: http://localhost:3000)
# =============================================================================
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-event-system}"
KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-nest-api}"
API_URL="${API_URL:-http://localhost:3000}"
KEYCLOAK_USERNAME="${KEYCLOAK_USERNAME:-}"
KEYCLOAK_PASSWORD="${KEYCLOAK_PASSWORD:-}"

# ── cores ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0

# ── helpers ──────────────────────────────────────────────────────────────────
ok()   { echo -e "${GREEN}✅  $*${NC}"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}❌  $*${NC}"; FAIL=$((FAIL + 1)); }
info() { echo -e "${BLUE}ℹ   $*${NC}"; }
section() { echo -e "\n${YELLOW}━━━  $*  ━━━${NC}"; }

json_field() {
  node -e "const v=JSON.parse(process.argv[1])[process.argv[2]]; \
           if(v==null)process.exit(1); process.stdout.write(String(v));" \
    "$1" "$2" 2>/dev/null || true
}

# Faz a requisição e separa status do body (duas linhas de saída)
request() {
  local method="$1" url="$2"
  shift 2
  curl -sS -X "$method" "$url" "$@" -w $'\n%{http_code}' 2>/dev/null
}

# Extrai a última linha (status code) e o resto (body)
split_response() {
  local raw="$1"
  _STATUS=$(echo "$raw" | tail -n1)
  _BODY=$(echo "$raw" | sed '$d')
}

assert_status() {
  local got="$1" want="$2" label="$3"
  if [[ "$got" == "$want" ]]; then
    ok "$label → HTTP $got"
  else
    fail "$label → esperado HTTP $want, recebeu HTTP $got | body: $_BODY"
  fi
}

# ── pré-requisitos ────────────────────────────────────────────────────────────
if [[ -z "$KEYCLOAK_USERNAME" || -z "$KEYCLOAK_PASSWORD" ]]; then
  echo "Defina KEYCLOAK_USERNAME e KEYCLOAK_PASSWORD antes de executar."
  echo "Exemplo: KEYCLOAK_USERNAME=admin KEYCLOAK_PASSWORD=admin bash scripts/test-endpoints.sh"
  exit 1
fi

for cmd in curl node; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "$cmd não encontrado."; exit 1; }
done

# ── 1. Autenticação no Keycloak ───────────────────────────────────────────────
section "1. Autenticação no Keycloak"

TOKEN_RESPONSE=$(request POST \
  "${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=${KEYCLOAK_CLIENT_ID}" \
  -d "grant_type=password" \
  -d "username=${KEYCLOAK_USERNAME}" \
  -d "password=${KEYCLOAK_PASSWORD}")

split_response "$TOKEN_RESPONSE"

if [[ "$_STATUS" != "200" ]]; then
  fail "Obter token do Keycloak → HTTP $_STATUS | $_BODY"
  exit 1
fi

ACCESS_TOKEN=$(json_field "$_BODY" "access_token")
if [[ -z "$ACCESS_TOKEN" ]]; then
  fail "access_token não encontrado na resposta do Keycloak"
  exit 1
fi
ok "Token obtido do Keycloak"

AUTH="-H \"Authorization: Bearer ${ACCESS_TOKEN}\""

# ── 2. GET /me ────────────────────────────────────────────────────────────────
section "2. GET /me"

split_response "$(request GET "${API_URL}/me")"
assert_status "$_STATUS" "401" "GET /me sem token"

split_response "$(request GET "${API_URL}/me" -H "Authorization: Bearer ${ACCESS_TOKEN}")"
assert_status "$_STATUS" "200" "GET /me com token válido"

KC_USER_ID=$(json_field "$_BODY" "keycloakUserId")
[[ -n "$KC_USER_ID" ]] && ok "keycloakUserId presente: ${KC_USER_ID}" \
                        || fail "keycloakUserId ausente na resposta de /me"

split_response "$(request GET "${API_URL}/me" -H "Authorization: Bearer token_invalido")"
assert_status "$_STATUS" "401" "GET /me com token inválido"

# ── 3. POST /users ────────────────────────────────────────────────────────────
section "3. POST /users"

SUFFIX="$(date +%s)-$$"
CREATE_PAYLOAD="{
  \"keycloakUserId\": \"test-kc-${SUFFIX}\",
  \"name\": \"Test User ${SUFFIX}\",
  \"email\": \"test-${SUFFIX}@example.com\",
  \"status\": \"ACTIVE\"
}"

split_response "$(request POST "${API_URL}/users" \
  -H "Content-Type: application/json" \
  -d "$CREATE_PAYLOAD")"
assert_status "$_STATUS" "401" "POST /users sem token"

split_response "$(request POST "${API_URL}/users" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$CREATE_PAYLOAD")"
assert_status "$_STATUS" "201" "POST /users com token válido"

USER_ID=$(json_field "$_BODY" "userId")
[[ -n "$USER_ID" ]] && ok "userId retornado: ${USER_ID}" \
                     || { fail "userId ausente — abortando"; exit 1; }

# Duplicata deve retornar 409
split_response "$(request POST "${API_URL}/users" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$CREATE_PAYLOAD")"
assert_status "$_STATUS" "409" "POST /users com keycloakUserId duplicado"

# Body inválido deve retornar 400
split_response "$(request POST "${API_URL}/users" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"sem email e keycloakUserId"}')"
assert_status "$_STATUS" "400" "POST /users com body inválido"

# ── 4. GET /users/:id ─────────────────────────────────────────────────────────
section "4. GET /users/:id"

split_response "$(request GET "${API_URL}/users/${USER_ID}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
assert_status "$_STATUS" "200" "GET /users/:id existente"

FETCHED_ID=$(json_field "$_BODY" "userId")
[[ "$FETCHED_ID" == "$USER_ID" ]] && ok "userId confere" \
                                   || fail "userId não confere: esperado $USER_ID, recebeu $FETCHED_ID"

split_response "$(request GET "${API_URL}/users/id-inexistente-abc123" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
assert_status "$_STATUS" "404" "GET /users/:id inexistente"

# ── 5. GET /users/by-keycloak/:keycloakId ────────────────────────────────────
section "5. GET /users/by-keycloak/:keycloakId"

split_response "$(request GET "${API_URL}/users/by-keycloak/test-kc-${SUFFIX}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
assert_status "$_STATUS" "200" "GET /users/by-keycloak/:keycloakId existente"

FETCHED_KC=$(json_field "$_BODY" "keycloakUserId")
[[ "$FETCHED_KC" == "test-kc-${SUFFIX}" ]] && ok "keycloakUserId confere" \
                                             || fail "keycloakUserId não confere"

split_response "$(request GET "${API_URL}/users/by-keycloak/kc-inexistente-xyz" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
assert_status "$_STATUS" "404" "GET /users/by-keycloak/:keycloakId inexistente"

# ── 6. PATCH /users/:id ───────────────────────────────────────────────────────
section "6. PATCH /users/:id"

split_response "$(request PATCH "${API_URL}/users/${USER_ID}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"Nome Atualizado","status":"INACTIVE"}')"
assert_status "$_STATUS" "200" "PATCH /users/:id válido"

UPDATED_NAME=$(json_field "$_BODY" "name")
[[ "$UPDATED_NAME" == "Nome Atualizado" ]] && ok "name atualizado corretamente" \
                                           || fail "name não foi atualizado: '$UPDATED_NAME'"

UPDATED_STATUS=$(json_field "$_BODY" "status")
[[ "$UPDATED_STATUS" == "INACTIVE" ]] && ok "status atualizado para INACTIVE" \
                                       || fail "status não foi atualizado: '$UPDATED_STATUS'"

split_response "$(request PATCH "${API_URL}/users/id-inexistente-abc123" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"X"}')"
assert_status "$_STATUS" "404" "PATCH /users/:id inexistente"

split_response "$(request PATCH "${API_URL}/users/${USER_ID}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"status":"INVALIDO"}')"
assert_status "$_STATUS" "400" "PATCH /users/:id com status inválido"

# ── 7. POST /users/:id/roles ──────────────────────────────────────────────────
section "7. POST /users/:id/roles"

split_response "$(request POST "${API_URL}/users/${USER_ID}/roles" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"roleName":"organizador"}')"
assert_status "$_STATUS" "201" "POST /users/:id/roles — atribuir organizador"

split_response "$(request POST "${API_URL}/users/${USER_ID}/roles" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"roleName":"participante"}')"
assert_status "$_STATUS" "201" "POST /users/:id/roles — atribuir participante"

split_response "$(request POST "${API_URL}/users/${USER_ID}/roles" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"roleName":"organizador"}')"
assert_status "$_STATUS" "409" "POST /users/:id/roles — role duplicada"

split_response "$(request POST "${API_URL}/users/id-inexistente/roles" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"roleName":"organizador"}')"
assert_status "$_STATUS" "404" "POST /users/:id/roles — usuário inexistente"

# ── 8. GET /users/:id/roles ───────────────────────────────────────────────────
section "8. GET /users/:id/roles"

split_response "$(request GET "${API_URL}/users/${USER_ID}/roles" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
assert_status "$_STATUS" "200" "GET /users/:id/roles"

ROLE_COUNT=$(node -e "const r=JSON.parse(process.argv[1]); process.stdout.write(String(r.length));" "$_BODY" 2>/dev/null || echo "0")
[[ "$ROLE_COUNT" == "2" ]] && ok "2 roles retornadas" \
                            || fail "esperado 2 roles, recebeu $ROLE_COUNT"

split_response "$(request GET "${API_URL}/users/id-inexistente/roles" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
assert_status "$_STATUS" "404" "GET /users/:id/roles — usuário inexistente"

# ── 9. DELETE /users/:id/roles/:roleName ─────────────────────────────────────
section "9. DELETE /users/:id/roles/:roleName"

split_response "$(request DELETE "${API_URL}/users/${USER_ID}/roles/participante" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
assert_status "$_STATUS" "204" "DELETE /users/:id/roles/:roleName — role existente"

split_response "$(request DELETE "${API_URL}/users/${USER_ID}/roles/participante" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
assert_status "$_STATUS" "404" "DELETE /users/:id/roles/:roleName — role inexistente"

split_response "$(request DELETE "${API_URL}/users/id-inexistente/roles/organizador" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
assert_status "$_STATUS" "404" "DELETE /users/:id/roles/:roleName — usuário inexistente"

# ── 10. DELETE /users/:id ─────────────────────────────────────────────────────
section "10. DELETE /users/:id"

split_response "$(request DELETE "${API_URL}/users/${USER_ID}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
assert_status "$_STATUS" "204" "DELETE /users/:id existente"

split_response "$(request DELETE "${API_URL}/users/${USER_ID}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
assert_status "$_STATUS" "404" "DELETE /users/:id já deletado"

split_response "$(request DELETE "${API_URL}/users/id-inexistente-abc123" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
assert_status "$_STATUS" "404" "DELETE /users/:id inexistente"

# ── resultado final ───────────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL))
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Resultado: ${GREEN}${PASS} passou${NC} / ${RED}${FAIL} falhou${NC} / ${TOTAL} total"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
