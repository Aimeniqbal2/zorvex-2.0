#!/bin/bash
set -e

echo "Starting Deployment and Migration..."

# Check if containers are running
if ! docker compose -f docker-compose.prod.yml ps | grep -q "web"; then
    echo "Containers are not running. Please start the environment first."
    exit 1
fi

echo "Applying migrations..."
docker compose -f docker-compose.prod.yml exec web python manage.py migrate

echo "Collecting static files..."
docker compose -f docker-compose.prod.yml exec web python manage.py collectstatic --noinput

echo "Running system checks..."
docker compose -f docker-compose.prod.yml exec web python manage.py check

echo "Deployment tasks completed successfully."
