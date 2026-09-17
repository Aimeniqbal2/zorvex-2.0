#!/bin/bash
set -e

# Usage: ./backup_db.sh [BACKUP_DIR]

BACKUP_DIR=${1:-"./backups"}
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="erp_db_backup_${TIMESTAMP}.sql.gz"

echo "Creating backup directory at ${BACKUP_DIR} if it doesn't exist..."
mkdir -p "${BACKUP_DIR}"

echo "Starting database backup from 'db' container..."

# We source the env file to get the database credentials
export $(grep -v '^#' .env | xargs)

if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
    echo "ERROR: DB_USER and DB_NAME must be set in .env"
    exit 1
fi

docker compose -f docker-compose.prod.yml exec -T db pg_dump -U "${DB_USER}" -d "${DB_NAME}" | gzip > "${BACKUP_DIR}/${FILENAME}"

chmod 600 "${BACKUP_DIR}/${FILENAME}"

echo "Database backup completed successfully: ${BACKUP_DIR}/${FILENAME}"
