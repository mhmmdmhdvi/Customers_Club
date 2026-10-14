#!/bin/sh
set -eu
# Password is a separately mounted secret, never bootstrap credentials.
password=$(cat /run/secrets/app_db_password)
case "$password" in ''|*[!a-f0-9]*) echo 'Invalid application database secret' >&2; exit 1;; esac
[ "${#password}" -eq 64 ] || { echo 'Invalid application database secret' >&2; exit 1; }
export DATABASE_URL="postgresql://customer_club_user:${password}@db:5432/customer_club_db?sslmode=disable"
unset password
exec /usr/local/bin/api
