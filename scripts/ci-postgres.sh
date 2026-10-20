#!/usr/bin/env bash
# Native Linux CI only. Never selects a system database or uses .env.
set -euo pipefail
action=${1:-start}
bin=/usr/lib/postgresql/18/bin
root="${RUNNER_TEMP:?CI runner temporary directory required}/customers-club-postgres"
if [ "$action" = stop ]; then
  [ -f "$root/owned" ] && [ "$(cat "$root/owned")" = customers-club-ci ] || exit 1
  "$bin/pg_ctl" -D "$root/data" -m fast -w -t 30 stop
  exit
fi
[ "$action" = start ] && [ ! -e "$root" ] || exit 1
umask 077
mkdir "$root"
printf customers-club-ci > "$root/owned"
id=$(openssl rand -hex 8)
owner="mig_owner_$id"
bootstrap="mig_bootstrap_$id"
parent="mig_parent_$id"
password=$(openssl rand -hex 32)
bootstrap_password=$(openssl rand -hex 32)
printf '%s' "$bootstrap_password" > "$root/password"
"$bin/initdb" -D "$root/data" -U "$bootstrap" --pwfile="$root/password" --auth-local=scram-sha-256 --auth-host=scram-sha-256 --locale=C --encoding=UTF8 > "$root/initdb.log"
# Every harness connection uses explicit loopback TCP. Disable package-default
# Unix sockets, whose /var/run/postgresql directory belongs to the postgres user.
printf "listen_addresses='127.0.0.1'\nport=55439\nunix_socket_directories=''\ntimezone='UTC'\n" >> "$root/data/postgresql.conf"
"$bin/pg_ctl" -D "$root/data" -l "$root/postgres.log" -w -t 30 start
export PGPASSWORD="$bootstrap_password"
"$bin/psql" -h 127.0.0.1 -p 55439 -U "$bootstrap" -d postgres -X -q -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE $owner LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOREPLICATION PASSWORD '$password';
COMMENT ON ROLE $owner IS 'customers-club-migration:$id';
CREATE DATABASE $parent OWNER $owner TEMPLATE template0;
COMMENT ON DATABASE $parent IS 'customers-club-migration:$id';
SQL
unset PGPASSWORD
rm -- "$root/password"
url="postgresql://$owner:$password@127.0.0.1:55439/$parent?sslmode=disable"
printf '::add-mask::%s\n' "$password" "$bootstrap_password" "$url"
printf 'MIGRATION_TEST_DATABASE_URL=%s\nALLOW_MIGRATION_TEST_DATABASE=1\n' "$url" >> "${GITHUB_ENV:?}"
echo 'Marked non-superuser PostgreSQL18 test parent ready on loopback:55439.'
