#!/bin/bash
# Pull a git ref on the Pi and reinstall SoftAP + pi_hub (used by GitHub Actions).
# Run on the Pi:  ./scripts/ci-pull-deploy.sh [git-ref]
#
# Env:
#   REPO_DIR   — clone path (default: /home/koushik/apps/Home-Security)
#   SKIP_APT   — set to 1 to skip apt-get (default for CI)
#   SKIP_HEALTH — set to 1 to skip curl /health check

set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/koushik/apps/Home-Security}"
TRACK_BRANCH="${TRACK_BRANCH:-pie-dev-testing}"
REF="${1:-$TRACK_BRANCH}"
SKIP_APT="${SKIP_APT:-1}"
HUB_READY="/home/koushik/homesecurity/.hub-ready"
SETUP_DIR="$REPO_DIR/rasberry-pi-setup"

log() { echo "[ci-pull-deploy] $*"; }

if [ ! -d "$REPO_DIR/.git" ]; then
    log "ERROR: no git repo at $REPO_DIR"
    log "Bootstrap once:"
    log "  git clone <your-repo-url> $REPO_DIR"
    exit 1
fi

cd "$REPO_DIR"

log "Fetching..."
git fetch --prune origin

if [ -n "$REF" ]; then
    log "Checking out $REF"
    if git show-ref --verify --quiet "refs/remotes/origin/$REF" 2>/dev/null; then
        git checkout -B "$REF" "origin/$REF"
        git pull --ff-only origin "$REF" || true
    else
        git checkout --force --detach "$REF"
    fi
fi

log "HEAD=$(git rev-parse --short HEAD) $(git log -1 --oneline)"

if [ ! -f "$SETUP_DIR/install-pi-setup.sh" ]; then
    log "ERROR: missing $SETUP_DIR/install-pi-setup.sh"
    exit 1
fi

chmod +x "$SETUP_DIR/install-pi-setup.sh" \
    "$SETUP_DIR/pi-setup-boot.sh" \
    "$SETUP_DIR/scripts/ci-pull-deploy.sh" 2>/dev/null || true

log "Running installer (SKIP_APT=$SKIP_APT)..."
sudo SKIP_APT="$SKIP_APT" "$SETUP_DIR/install-pi-setup.sh"

# Hot-reload hub when already on home Wi‑Fi (no reboot required for code pushes).
if [ -f "$HUB_READY" ]; then
    log "Restarting pi-hub..."
    sudo systemctl restart pi-hub.service || sudo systemctl start pi-hub.service
    sleep 2
else
    log "No $HUB_READY — SoftAP/unconfigured; hub not started (expected until Wi‑Fi is up)"
fi

if [ "${SKIP_HEALTH:-0}" = "1" ]; then
    log "SKIP_HEALTH=1 — done"
    exit 0
fi

if [ -f "$HUB_READY" ]; then
    log "Health check..."
    for i in 1 2 3 4 5; do
        if curl -sf http://127.0.0.1:4000/health | grep -q '"mode"[[:space:]]*:[[:space:]]*"hub"'; then
            log "OK — hub healthy"
            curl -s http://127.0.0.1:4000/health
            echo
            exit 0
        fi
        sleep 1
    done
    log "ERROR: hub health check failed"
    systemctl --no-pager -l status pi-hub.service || true
    journalctl -u pi-hub -n 40 --no-pager || true
    exit 1
fi

log "Done (setup mode — skipped hub health)"
