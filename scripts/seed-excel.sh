#!/bin/sh
# Reproduce the committed Excel test dataset through the regular import pipeline.
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

exec "$PROJECT_DIR/scripts/dev.sh" run --rm --no-deps -T \
    --volume "$PROJECT_DIR/TrackLogic:/seed-input:ro" \
    api python -m app.seed.partner_workbooks --directory /seed-input "$@"
