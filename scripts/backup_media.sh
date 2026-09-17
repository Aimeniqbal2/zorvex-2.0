#!/bin/bash
set -e

# Usage: ./backup_media.sh [BACKUP_DIR]

BACKUP_DIR=${1:-"./backups"}
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="erp_media_backup_${TIMESTAMP}.tar.gz"

echo "Creating backup directory at ${BACKUP_DIR} if it doesn't exist..."
mkdir -p "${BACKUP_DIR}"

echo "Starting media volume backup..."

# Using a temporary alpine container bound to the media volume to create the archive
docker run --rm \
    -v erp_media_volume:/media_data:ro \
    -v $(pwd)/${BACKUP_DIR}:/backup_dir \
    alpine tar -czf /backup_dir/${FILENAME} -C /media_data .

chmod 600 "${BACKUP_DIR}/${FILENAME}"

echo "Media backup completed successfully: ${BACKUP_DIR}/${FILENAME}"
