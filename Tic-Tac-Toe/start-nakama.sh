#!/bin/sh

echo "DATABASE_URL is: $DATABASE_URL"

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set!"
  exit 1
fi

echo "Running Nakama migrations..."

/nakama/nakama migrate up --database.address "$DATABASE_URL"

echo "Starting Nakama server..."

exec /nakama/nakama \
  --name nakama1 \
  --database.address "$DATABASE_URL" \
  --logger.level DEBUG \
  --session.token_expiry_sec 7200 \
  --metrics.prometheus_port 9100