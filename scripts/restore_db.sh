#!/bin/bash
set -e

# Usage: ./restore_db.sh <backup_file.sql.gz>

if [ -z "$1" ]; then
    echo "ERROR: Backup file argument is required."
    echo "Usage: ./restore_db.sh <backup_file.sql.gz>"
    exit 1
fi

BACKUP_FILE=$1

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: File $BACKUP_FILE does not exist."
    exit 1
fi

echo "WARNING: This will overwrite the current database."
read -p "Are you sure you want to proceed? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Restore cancelled."
    exit 1
fi

export $(grep -v '^#' .env | xargs)

if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
    echo "ERROR: DB_USER and DB_NAME must be set in .env"
    exit 1
fi

echo "Restoring database from $BACKUP_FILE into $DB_NAME..."

# Drop and recreate database to ensure clean restore (requires terminating connections)
docker compose -f docker-compose.prod.yml exec -T db psql -U "${DB_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);"
docker compose -f docker-compose.prod.yml exec -T db psql -U "${DB_USER}" -d postgres -c "CREATE DATABASE ${DB_NAME};"

# Restore
gunzip -c "${BACKUP_FILE}" | docker compose -f docker-compose.prod.yml exec -T db psql -U "${DB_USER}" -d "${DB_NAME}"

echo "Database restore completed successfully."
