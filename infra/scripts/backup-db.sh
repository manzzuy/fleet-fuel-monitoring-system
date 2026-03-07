#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${1:-./backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DATABASE_URL_VALUE="${DATABASE_URL:-}"

if [[ -z "${DATABASE_URL_VALUE}" ]]; then
  echo "DATABASE_URL is required."
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
OUTPUT_PATH="${BACKUP_DIR}/fleet-fuel-${TIMESTAMP}.dump"

echo "Creating backup at ${OUTPUT_PATH}"
pg_dump --format=custom --no-owner --no-privileges --dbname="${DATABASE_URL_VALUE}" --file="${OUTPUT_PATH}"
echo "Backup completed."
