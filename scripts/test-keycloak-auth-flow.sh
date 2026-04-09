#!/usr/bin/env bash
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-event-system}"
KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-nest-api}"
API_URL="${API_URL:-http://localhost:3000}"

KEYCLOAK_USERNAME="${KEYCLOAK_USERNAME:-}"
KEYCLOAK_PASSWORD="${KEYCLOAK_PASSWORD:-}"

if [[ -z "$KEYCLOAK_USERNAME" || -z "$KEYCLOAK_PASSWORD" ]]; then
  echo "Missing credentials. Set KEYCLOAK_USERNAME and KEYCLOAK_PASSWORD."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required but was not found in PATH."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required but was not found in PATH."
  exit 1
fi

extract_json_field() {
  local json="$1"
  local field="$2"
  node -e '
const payload = JSON.parse(process.argv[1]);
const field = process.argv[2];
const value = payload[field];
if (value === undefined || value === null) process.exit(2);
if (typeof value === "object") {
  process.stdout.write(JSON.stringify(value));
} else {
  process.stdout.write(String(value));
}
' "$json" "$field"
}

request_token() {
  local response http_code body
  response="$(curl -sS -X POST "${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=${KEYCLOAK_CLIENT_ID}" \
    -d "grant_type=password" \
    -d "username=${KEYCLOAK_USERNAME}" \
    -d "password=${KEYCLOAK_PASSWORD}" \
    -w $'\n%{http_code}')"

  http_code="$(printf '%s\n' "$response" | tail -n 1)"
  body="$(printf '%s\n' "$response" | sed '$d')"

  if [[ "$http_code" != "200" ]]; then
    echo "Token request failed with HTTP ${http_code}: ${body}"
    return 1
  fi

  ACCESS_TOKEN="$(extract_json_field "$body" "access_token")"
  if [[ -z "${ACCESS_TOKEN}" ]]; then
    echo "Token response did not contain access_token."
    return 1
  fi
}

request_with_status() {
  local method="$1"
  local url="$2"
  local auth_header="${3:-}"
  local data="${4:-}"
  local response body status

  if [[ -n "$auth_header" && -n "$data" ]]; then
    response="$(curl -sS -X "$method" "$url" -H "$auth_header" -H "Content-Type: application/json" -d "$data" -w $'\n%{http_code}')"
  elif [[ -n "$auth_header" ]]; then
    response="$(curl -sS -X "$method" "$url" -H "$auth_header" -w $'\n%{http_code}')"
  else
    response="$(curl -sS -X "$method" "$url" -w $'\n%{http_code}')"
  fi

  status="$(printf '%s\n' "$response" | tail -n 1)"
  body="$(printf '%s\n' "$response" | sed '$d')"
  printf '%s\n%s' "$status" "$body"
}

assert_status() {
  local got="$1"
  local expected="$2"
  local context="$3"

  if [[ "$got" != "$expected" ]]; then
    echo "❌ ${context}: expected HTTP ${expected}, got ${got}."
    return 1
  fi

  echo "✅ ${context}: HTTP ${got}"
}

echo "Running auth flow checks against ${API_URL} using realm ${KEYCLOAK_REALM}..."
request_token
echo "✅ Access token retrieved from Keycloak"

read -r status_no_auth body_no_auth < <(request_with_status "GET" "${API_URL}/me")
assert_status "$status_no_auth" "401" "GET /me without token"

read -r status_me body_me < <(request_with_status "GET" "${API_URL}/me" "Authorization: Bearer ${ACCESS_TOKEN}")
assert_status "$status_me" "200" "GET /me with token"

me_keycloak_user_id="$(extract_json_field "$body_me" "keycloakUserId" || true)"
if [[ -z "$me_keycloak_user_id" ]]; then
  echo "❌ GET /me response did not include keycloakUserId."
  exit 1
fi
echo "✅ /me returned keycloakUserId=${me_keycloak_user_id}"

unique_suffix="$(date +%s)-$RANDOM"
payload="$(cat <<JSON
{"keycloakUserId":"test-${unique_suffix}","name":"Auth Flow Test","email":"auth-flow-${unique_suffix}@example.com","status":"ACTIVE"}
JSON
)"

read -r status_create body_create < <(request_with_status "POST" "${API_URL}/users" "Authorization: Bearer ${ACCESS_TOKEN}" "$payload")
assert_status "$status_create" "201" "POST /users with token"

created_user_id="$(extract_json_field "$body_create" "userId" || true)"
if [[ -z "$created_user_id" ]]; then
  echo "❌ POST /users response did not include userId."
  exit 1
fi
echo "✅ Created user profile userId=${created_user_id}"

read -r status_get body_get < <(request_with_status "GET" "${API_URL}/users/${created_user_id}" "Authorization: Bearer ${ACCESS_TOKEN}")
assert_status "$status_get" "200" "GET /users/:id with token"

fetched_user_id="$(extract_json_field "$body_get" "userId" || true)"
if [[ "$fetched_user_id" != "$created_user_id" ]]; then
  echo "❌ GET /users/:id returned unexpected userId (${fetched_user_id})."
  exit 1
fi
echo "✅ Retrieved created user profile"

echo "🎉 Keycloak authentication flow verified successfully."
