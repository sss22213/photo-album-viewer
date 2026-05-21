#!/bin/bash
# Photo Album - Start script
# Usage: ./start.sh [port]
# Or set IMAGE_DIR=/path/to/photos as environment variable

cd "$(dirname "$0")"

# Load .env if exists
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Build frontend
echo "Building frontend..."
npm run build 2>&1

# Start server
echo "Starting photo album on port ${PORT:-3001}..."
echo "Image directory: ${IMAGE_DIR:-$(pwd)/photos}"
exec node server/index.js
