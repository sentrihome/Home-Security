#!/bin/bash
# Copy SoftAP + hub to the Pi and run the installer.
#
# Always preflights leftover state on the Pi (stale python, both services,
# extra clone, dirty git) and prints a bar. Refuses unless FORCE=1.
#
# Env:
#   PI_IP / PI_USER / PI_SSH_KEY
#   FORCE=1            continue despite preflight problems
#   START_SETUP=1      after install, start pi-setup (SoftAP / DEV wipe)
#   SKIP_REMOTE_TESTS=1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_IP="${PI_IP:-192.168.0.236}"
PI_USER="${PI_USER:-koushik}"
PI_SSH_KEY="${PI_SSH_KEY:-$HOME/.ssh/pi-homesecurity-deploy}"
FORCE="${FORCE:-0}"
START_SETUP="${START_SETUP:-0}"

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new)
if [ -f "$PI_SSH_KEY" ]; then
    SSH_OPTS+=(-i "$PI_SSH_KEY")
fi

ssh_pi() { ssh "${SSH_OPTS[@]}" "${PI_USER}@${PI_IP}" "$@"; }
scp_pi() { scp "${SSH_OPTS[@]}" "$@"; }

red=$'\033[1;31m'
cyn=$'\033[1;36m'
rst=$'\033[0m'

echo "${cyn}╔══════════════════════════════════════════════════════════════════════════════╗${rst}"
echo "${cyn}║ DEPLOY${rst}  ${PI_USER}@${PI_IP}  from ${SCRIPT_DIR}"
echo "${cyn}╚══════════════════════════════════════════════════════════════════════════════╝${rst}"

need=(
    pi-preflight.sh
    install-pi-setup.sh
    pi-setup-api.py
    pi-setup-boot.sh
    pi-setup-lib.sh
    pi-setup-dev.sh
    pi-setup-prod.sh
    choose-version.sh
    requirements.txt
)
missing=0
for f in "${need[@]}"; do
    if [ ! -f "$SCRIPT_DIR/$f" ]; then
        echo "${red}✖ missing $SCRIPT_DIR/$f${rst}"
        missing=1
    fi
done
[ -d "$SCRIPT_DIR/pi_hub" ] || { echo "${red}✖ missing pi_hub/${rst}"; missing=1; }
[ "$missing" -eq 0 ] || exit 1

echo "=== Reachability ==="
if ! ssh_pi "echo ok" >/dev/null; then
    echo "${red}Cannot SSH ${PI_USER}@${PI_IP}${rst}"
    echo "  Try: ssh ${SSH_OPTS[*]} ${PI_USER}@${PI_IP}"
    exit 1
fi

echo "=== Copying preflight helper ==="
ssh_pi "rm -rf /tmp/rasberry-pi-setup && mkdir -p /tmp/rasberry-pi-setup/systemd /tmp/rasberry-pi-setup/scripts"
scp_pi "$SCRIPT_DIR/pi-preflight.sh" "${PI_USER}@${PI_IP}:/tmp/rasberry-pi-setup/pi-preflight.sh"

echo "=== Remote preflight (leftover state from previous runs) ==="
set +e
ssh_pi "sudo bash -s" <<REMOTE
set -euo pipefail
export FORCE='$FORCE'
# shellcheck disable=SC1091
source /tmp/rasberry-pi-setup/pi-preflight.sh
preflight_collect
preflight_print_bar
preflight_fail_if_blocking
preflight_fix
preflight_collect
preflight_print_bar
REMOTE
pre_rc=$?
set -e
if [ "$pre_rc" -ne 0 ]; then
    echo "${red}Preflight refused. Fix the ✖ lines on the Pi, or re-run FORCE=1 $0${rst}"
    exit "$pre_rc"
fi

echo "=== Copying rasberry-pi-setup to Pi ==="
scp_pi "$SCRIPT_DIR/pi-setup-api.py" \
    "$SCRIPT_DIR/pi-setup-boot.sh" \
    "$SCRIPT_DIR/pi-setup-lib.sh" \
    "$SCRIPT_DIR/pi-setup-dev.sh" \
    "$SCRIPT_DIR/pi-setup-prod.sh" \
    "$SCRIPT_DIR/install-pi-setup.sh" \
    "$SCRIPT_DIR/choose-version.sh" \
    "$SCRIPT_DIR/pi-preflight.sh" \
    "$SCRIPT_DIR/requirements.txt" \
    "${PI_USER}@${PI_IP}:/tmp/rasberry-pi-setup/"

scp_pi -r "$SCRIPT_DIR/pi_hub" "${PI_USER}@${PI_IP}:/tmp/rasberry-pi-setup/"
if [ -d "$SCRIPT_DIR/tests" ]; then
    scp_pi -r "$SCRIPT_DIR/tests" "${PI_USER}@${PI_IP}:/tmp/rasberry-pi-setup/"
fi
scp_pi "$SCRIPT_DIR/systemd/"*.service "${PI_USER}@${PI_IP}:/tmp/rasberry-pi-setup/systemd/"
if [ -f "$SCRIPT_DIR/scripts/fetch-detection-model.sh" ]; then
    scp_pi "$SCRIPT_DIR/scripts/fetch-detection-model.sh" \
        "${PI_USER}@${PI_IP}:/tmp/rasberry-pi-setup/scripts/"
fi

echo ""
echo "=== Running installer on Pi ==="
ssh_pi "sudo bash -s" <<REMOTE
set -euo pipefail
export FORCE='$FORCE'
export START_SETUP='$START_SETUP'
export SKIP_APT='${SKIP_APT:-0}'
cd /tmp/rasberry-pi-setup
chmod +x install-pi-setup.sh pi-setup-boot.sh pi-setup-dev.sh pi-setup-prod.sh \
         pi-setup-lib.sh choose-version.sh pi-preflight.sh
if [ -f scripts/fetch-detection-model.sh ]; then
    chmod +x scripts/fetch-detection-model.sh
fi
if [ "${SKIP_REMOTE_TESTS:-0}" != "1" ] && [ -d tests ]; then
    python3 -m unittest discover -s tests -q || echo "WARNING: detection unit tests failed"
fi
FORCE='$FORCE' START_SETUP='$START_SETUP' SKIP_APT='${SKIP_APT:-0}' ./install-pi-setup.sh
REMOTE

echo ""
echo "✓ Deploy finished."
echo ""
echo "Do not reboot unless you want SoftAP / DEV wipe."
echo "  Health:          curl -s http://${PI_IP}:4000/health"
echo "  Switch branch:   ssh ${PI_USER}@${PI_IP} ./choose-version.sh"
echo "  Reboot (wipe?):  ssh ${PI_USER}@${PI_IP} 'sudo reboot'"
