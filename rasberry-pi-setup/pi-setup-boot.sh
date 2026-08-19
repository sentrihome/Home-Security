#!/bin/bash
# Pi boot dispatcher: pull the testing branch, then run dev or prod setup.
# systemd: ExecStart=/home/koushik/pi-setup-boot.sh

set -euo pipefail

PI_HOME="/home/koushik"
LOG_FILE="/var/log/pi-setup.log"
LIB="$PI_HOME/pi-setup-lib.sh"
TRACK_BRANCH="${PI_TRACK_BRANCH:-pie-dev-testing}"
if [ -z "${REPO_DIR:-}" ] && [ -f "$PI_HOME/homesecurity/repo-dir" ]; then
    REPO_DIR="$(tr -d '[:space:]' < "$PI_HOME/homesecurity/repo-dir")"
fi
REPO_DIR="${REPO_DIR:-$PI_HOME/apps/Home-Security}"

mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg" >>"$LOG_FILE"
    echo "$msg" >&2
}

if [ ! -d "$REPO_DIR/.git" ] && [ -d "$PI_HOME/Home-Security/.git" ]; then
    log "WARNING: $REPO_DIR has no git clone — falling back to $PI_HOME/Home-Security"
    REPO_DIR="$PI_HOME/Home-Security"
fi

log "=== Pi Setup Boot ==="

# Refresh scripts from git while we may still have leftover home WiFi from last run.
if [ -d "$REPO_DIR/.git" ]; then
    log "Git pull $TRACK_BRANCH in $REPO_DIR"
    if sudo -u koushik git -C "$REPO_DIR" fetch --prune origin >>"$LOG_FILE" 2>&1; then
        sudo -u koushik git -C "$REPO_DIR" checkout -B "$TRACK_BRANCH" "origin/$TRACK_BRANCH" >>"$LOG_FILE" 2>&1 \
            || sudo -u koushik git -C "$REPO_DIR" checkout "$TRACK_BRANCH" >>"$LOG_FILE" 2>&1 \
            || log "WARNING: checkout $TRACK_BRANCH failed"
        sudo -u koushik git -C "$REPO_DIR" pull --ff-only origin "$TRACK_BRANCH" >>"$LOG_FILE" 2>&1 \
            || log "WARNING: git pull failed (offline?) — continuing with local tree"
        HEAD=$(sudo -u koushik git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo "?")
        log "HEAD=$HEAD"
        SETUP_DIR="$REPO_DIR/rasberry-pi-setup"
        if [ -f "$SETUP_DIR/install-pi-setup.sh" ]; then
            log "Reinstalling from repo (SKIP_APT=1)"
            SKIP_APT=1 "$SETUP_DIR/install-pi-setup.sh" >>"$LOG_FILE" 2>&1 \
                || log "WARNING: install-pi-setup.sh failed"
        fi
    else
        log "WARNING: git fetch failed — no network yet, skipping pull"
    fi
else
    log "WARNING: no git clone at $REPO_DIR — skip pull"
fi

# Re-source lib from /home after install copy.
if [ ! -f "$LIB" ]; then
    log "ERROR: missing $LIB"
    exit 1
fi
# shellcheck source=/home/koushik/pi-setup-lib.sh
source "$LIB"

BRANCH=$(sudo -u koushik git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
log "Active git branch: ${BRANCH:-unknown}"

wait_for_nm

if [ "$BRANCH" = "$TRACK_BRANCH" ] || [ "$BRANCH" = "pie-dev-testing" ]; then
    log "Using DEV setup script"
    exec "$PI_HOME/pi-setup-dev.sh"
fi

log "Using PROD setup script"
exec "$PI_HOME/pi-setup-prod.sh"
