#!/bin/sh
set -eu
APP_DATABASE_PASSWORD=$(cat /run/secrets/app_db_password)
export APP_DATABASE_PASSWORD
case "$APP_DATABASE_PASSWORD" in ''|*[!a-f0-9]*) echo 'Invalid application database secret' >&2; exit 1;; esac
[ "${#APP_DATABASE_PASSWORD}" -eq 64 ] || exit 1
# psql variables quote the secret; neither command arguments nor logs contain it.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -X -q -v ON_ERROR_STOP=1 <<'SQL'
\getenv app_password APP_DATABASE_PASSWORD
CREATE ROLE customer_club_user LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'app_password';
CREATE DATABASE customer_club_db OWNER customer_club_user TEMPLATE template0;
REVOKE CONNECT ON DATABASE customer_club_db FROM PUBLIC;
GRANT CONNECT ON DATABASE customer_club_db TO customer_club_user;
SQL
unset APP_DATABASE_PASSWORD
