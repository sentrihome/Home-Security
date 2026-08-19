#!/bin/bash
# DEV boot: wipe session state, force SoftAP, wait for Drive token + WiFi, then join home.
# Invoked by pi-setup-boot.sh when the git branch is pie-dev-testing.

set -euo pipefail

PI_HOME="/home/koushik"
# shellcheck source=/home/koushik/pi-setup-lib.sh
source "$PI_HOME/pi-setup-lib.sh"

log "=== Pi DEV setup ==="
write_pi_mode "dev"
wipe_dev_state
start_softap
