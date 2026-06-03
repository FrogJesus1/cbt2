#!/bin/bash
# deploy-war.sh — Auto-deploy script for Combat Terminal (war.juzzie.xyz)
#
# Called by launchd every 60 seconds. Checks if the production branch on
# GitHub has new commits; if so, pulls and rebuilds the Docker container.
#
# Install:
#   cp ~/CombatTerminal/deploy/deploy-war.sh ~/JuzzieSite/deploy/deploy-war.sh
#   chmod +x ~/JuzzieSite/deploy/deploy-war.sh

set -euo pipefail

REPO_DIR="$HOME/CombatTerminal"
COMPOSE_DIR="$HOME/JuzzieSite/deploy"
SERVICE="warterminal"
BRANCH="production"
LOG="$COMPOSE_DIR/deploy-war.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# Ensure repo exists
if [ ! -d "$REPO_DIR/.git" ]; then
    log "ERROR: $REPO_DIR is not a git repo"
    exit 1
fi

cd "$REPO_DIR"

# Fetch latest from origin
git fetch origin "$BRANCH" --quiet 2>>"$LOG" || {
    log "ERROR: git fetch failed"
    exit 1
}

# Compare local HEAD with remote HEAD
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
    # No new commits — nothing to do
    exit 0
fi

log "New commits detected: $LOCAL -> $REMOTE"
log "Pulling $BRANCH..."

git reset --hard "origin/$BRANCH" >> "$LOG" 2>&1

log "Rebuilding $SERVICE container..."

cd "$COMPOSE_DIR"
docker compose up -d --build --no-deps "$SERVICE" >> "$LOG" 2>&1

# Wait for container to be healthy
sleep 10

# Verify
VERSION=$(curl -sf http://localhost:8001/api/version 2>/dev/null || echo "UNREACHABLE")
log "Deploy complete. Version endpoint: $VERSION"
