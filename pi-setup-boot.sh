#!/bin/bash
# Pi SoftAP Boot Script
# Checks if WiFi is configured, starts SoftAP+API if not

set -e

CREDENTIALS_FILE="/home/koushik/wifi-credentials.json"
LOG_FILE="/var/log/pi-setup.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=== Pi Setup Boot Check ==="

# Check if WiFi credentials exist and are configured
if [ -f "$CREDENTIALS_FILE" ]; then
    CONFIGURED=$(jq -r '.configured // false' "$CREDENTIALS_FILE" 2>/dev/null || echo "false")
    SSID=$(jq -r '.ssid // ""' "$CREDENTIALS_FILE" 2>/dev/null || echo "")
    
    if [ "$CONFIGURED" = "true" ] && [ -n "$SSID" ]; then
        log "WiFi configured for SSID: $SSID"
        
        # Try to connect to home WiFi
        if nmcli connection up "$SSID" 2>&1 | tee -a "$LOG_FILE"; then
            log "Connected to home WiFi successfully"
            exit 0
        else
            log "WARNING: Failed to connect to $SSID, entering setup mode"
        fi
    fi
fi

log "No WiFi configured or connection failed - starting SoftAP"

# Ensure dnsmasq won't conflict
systemctl is-active dnsmasq.service >/dev/null 2>&1 && systemctl stop dnsmasq.service
systemctl is-enabled dnsmasq.service >/dev/null 2>&1 && systemctl disable dnsmasq.service

# Start SoftAP
log "Starting Hotspot..."
if nmcli connection up Hotspot 2>&1 | tee -a "$LOG_FILE"; then
    log "Hotspot started successfully"
    
    # Wait for network to be ready
    sleep 3
    
    # Start setup API
    log "Starting Setup API on 0.0.0.0:4000..."
    cd /home/koushik
    sudo -u root python3 /home/koushik/pi-setup-api.py 2>&1 | tee -a "$LOG_FILE" &
    
    log "Setup mode active - join HomeSecurity-Setup to configure"
else
    log "ERROR: Failed to start Hotspot"
    exit 1
fi
