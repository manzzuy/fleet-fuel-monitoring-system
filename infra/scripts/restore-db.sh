#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
DATABASE_URL_VALUE="${DATABASE_URL:-}"

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Usage: DATABASE_URL=<target> $0 <backup-file.dump>"
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

if [[ -z "${DATABASE_URL_VALUE}" ]]; then
  echo "DATABASE_URL is required."
  exit 1
fi

echo "Restoring ${BACKUP_FILE} into target database from DATABASE_URL..."
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="${DATABASE_URL_VALUE}" "${BACKUP_FILE}"
echo "Restore completed."
