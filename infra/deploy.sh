#!/usr/bin/env bash
# Deploy the latest Shootris image on the server (run from anywhere).
# Pulls the image GitHub Actions built for the newest commit on main and
# restarts the container. Takes seconds; nothing is compiled here.
#   bash ~/shootris/infra/deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
git -C .. pull --ff-only
sudo docker compose -f docker-compose.cohost.yml pull
sudo docker compose -f docker-compose.cohost.yml up -d
sudo docker image prune -f >/dev/null
echo "Running: $(sudo docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' shootris 2>/dev/null || echo unknown)"
echo "Repo at: $(git -C .. rev-parse HEAD)"
