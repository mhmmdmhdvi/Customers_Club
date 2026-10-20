#!/usr/bin/env bash
# Isolated CI Compose project only; fake SMS settings, no request-code calls.
set -euo pipefail
export COMPOSE_PROJECT_NAME="club-ci-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
export CLUB_ORIGIN=https://localhost
umask 077
mkdir -p deployment/secrets deployment/tls
openssl rand -hex 32 > deployment/secrets/bootstrap-db-password
openssl rand -hex 32 > deployment/secrets/app-db-password
# Compose file-backed secrets retain host modes; nonroot API must read this file.
chmod 0444 deployment/secrets/app-db-password
{
  for key in ACCESS_TOKEN_SECRET OTP_HMAC_SECRET ADMIN_MFA_ENCRYPTION_KEY; do
    printf '%s=%s\n' "$key" "$(openssl rand -hex 32)"
  done
  printf 'JWT_ISSUER=ci-stack\nJWT_AUDIENCE=ci-browser\nFARAZSMS_API_KEY=fake\nFARAZSMS_LINE_NUMBER=fake\nFARAZSMS_PATTERN_CODE=fake\n'
} > deployment/api.env
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost -addext 'subjectAltName=DNS:localhost' -keyout deployment/tls/privkey.pem -out deployment/tls/fullchain.pem > /dev/null 2>&1
compose=(docker compose --env-file deployment/api.env -f compose.yml -f compose.production.yml)
trap '"${compose[@]}" down --volumes --remove-orphans' EXIT
"${compose[@]}" up --build --wait --wait-timeout 180 -d
# Database provisioning must create an ordinary owner, never the image superuser.
identity=$("${compose[@]}" exec -T db psql -U club_bootstrap -d customer_club_db -X -At -v ON_ERROR_STOP=1 -c "SELECT r.rolname,r.rolsuper,r.rolcreatedb,r.rolcreaterole,pg_get_userbyid(d.datdba) FROM pg_database d JOIN pg_roles r ON r.rolname='customer_club_user' WHERE d.datname='customer_club_db'")
[ "$identity" = 'customer_club_user|f|f|f|customer_club_user' ]
migrations=$("${compose[@]}" exec -T db psql -U club_bootstrap -d customer_club_db -X -At -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM public.go_migrations WHERE length(checksum)=64')
[ "$migrations" = 14 ]
"${compose[@]}" run --rm migrate
NODE_EXTRA_CA_CERTS="$PWD/deployment/tls/fullchain.pem" node frontend/scripts/smoke.cjs "$CLUB_ORIGIN"
echo 'Fresh production stack owner privileges, migration and HTTPS smoke verified.'
