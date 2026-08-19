#!/bin/bash
# PROD boot: keep wifi + Drive token. Home WiFi if configured, else SoftAP.

set -euo pipefail

PI_HOME="/home/koushik"
# shellcheck source=/home/koushik/pi-setup-lib.sh
source "$PI_HOME/pi-setup-lib.sh"

log "=== Pi PROD setup ==="
write_pi_mode "prod"
stop_hub
wait_for_nm

if join_home_wifi; then
    exit 0
fi

log "No usable home WiFi — SoftAP"
start_softap
