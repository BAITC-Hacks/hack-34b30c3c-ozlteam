#!/bin/sh
# Always select the repository's local environment, even when called from elsewhere.
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$PROJECT_DIR"

if [ ! -f .env.local ]; then
    # Without a JWT secret authentication refuses to start, so generate one here.
    secret=$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')
    (umask 077
     awk -v s="$secret" \
         '/^SECURITY_JWT_SECRET=$/ { print "SECURITY_JWT_SECRET=" s; next } { print }' \
         .env.local.example > .env.local)
    printf '%s\n' 'Created .env.local from .env.local.example (JWT secret generated)'
fi

exec docker compose --project-directory "$PROJECT_DIR" \
    --env-file "$PROJECT_DIR/.env.local" -f "$PROJECT_DIR/compose.yaml" "$@"
