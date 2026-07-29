#!/bin/bash
# Pi SoftAP Boot Script
# Checks if WiFi is configured; if not, brings SoftAP up automatically
# (no need to click HomeSecurity-Setup in the WiFi menu).

set -e

CREDENTIALS_FILE="/home/koushik/wifi-credentials.json"
LOG_FILE="/var/log/pi-setup.log"
SETUP_CON="HomeSecurity-Setup"
SETUP_SSID="HomeSecurity-Setup"
SETUP_PSK="setup1234"
WLAN_IF="wlan0"
API_SCRIPT="/home/koushik/pi-setup-api.py"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

find_ap_connection() {
    # Prefer exact name, then any wifi connection in AP mode, then legacy "Hotspot"
    if nmcli -t -f NAME connection show 2>/dev/null | grep -Fxq "$SETUP_CON"; then
        echo "$SETUP_CON"
        return 0
    fi

    local name
    while IFS= read -r name; do
        [ -z "$name" ] && continue
        mode=$(nmcli -g 802-11-wireless.mode connection show "$name" 2>/dev/null || true)
        if [ "$mode" = "ap" ]; then
            echo "$name"
            return 0
        fi
    done < <(nmcli -t -f NAME connection show 2>/dev/null)

    if nmcli -t -f NAME connection show 2>/dev/null | grep -Fxq "Hotspot"; then
        echo "Hotspot"
        return 0
    fi

    return 1
}

ensure_softap_connection() {
    local con
    if con=$(find_ap_connection); then
        log "Found existing AP connection: $con"
        # Keep profile present in the menu, but do not rely on manual click —
        # script will activate it. Autoconnect off so it does not fight home WiFi.
        nmcli connection modify "$con" \
            connection.autoconnect no \
            802-11-wireless.ssid "$SETUP_SSID" \
            802-11-wireless.mode ap \
            ipv4.method shared \
            802-11-wireless-security.key-mgmt wpa-psk \
            802-11-wireless-security.psk "$SETUP_PSK" \
            2>&1 | tee -a "$LOG_FILE" || true
        # Rename legacy "Hotspot" so the menu label matches the SSID
        if [ "$con" != "$SETUP_CON" ]; then
            nmcli connection modify "$con" connection.id "$SETUP_CON" 2>&1 | tee -a "$LOG_FILE" || true
            con="$SETUP_CON"
        fi
        echo "$con"
        return 0
    fi

    log "Creating SoftAP connection $SETUP_CON"
    nmcli connection add \
        type wifi \
        ifname "$WLAN_IF" \
        con-name "$SETUP_CON" \
        autoconnect no \
        ssid "$SETUP_SSID" \
        2>&1 | tee -a "$LOG_FILE"

    nmcli connection modify "$SETUP_CON" \
        802-11-wireless.mode ap \
        802-11-wireless.band a \
        802-11-wireless.channel 36 \
        ipv4.method shared \
        wifi-sec.key-mgmt wpa-psk \
        wifi-sec.psk "$SETUP_PSK" \
        2>&1 | tee -a "$LOG_FILE"

    echo "$SETUP_CON"
}

start_softap() {
    log "No WiFi configured or home WiFi failed — starting SoftAP automatically"

    # Ensure dnsmasq won't conflict with NM shared DHCP
    if systemctl is-active dnsmasq.service >/dev/null 2>&1; then
        systemctl stop dnsmasq.service
    fi
    if systemctl is-enabled dnsmasq.service >/dev/null 2>&1; then
        systemctl disable dnsmasq.service
    fi

    local con
    con=$(ensure_softap_connection)

    # Drop any active STA connection on wlan so AP can bind
    local active
    active=$(nmcli -t -f NAME,DEVICE connection show --active 2>/dev/null | awk -F: -v iface="$WLAN_IF" '$2==iface {print $1; exit}')
    if [ -n "$active" ] && [ "$active" != "$con" ]; then
        log "Bringing down active connection on $WLAN_IF: $active"
        nmcli connection down "$active" 2>&1 | tee -a "$LOG_FILE" || true
    fi

    log "Activating SoftAP connection: $con"
    if ! nmcli connection up "$con" 2>&1 | tee -a "$LOG_FILE"; then
        log "ERROR: Failed to start SoftAP ($con)"
        exit 1
    fi

    log "SoftAP up — SSID=$SETUP_SSID  IP=10.42.0.1  password=$SETUP_PSK"
    sleep 2

    if [ ! -f "$API_SCRIPT" ]; then
        log "ERROR: Missing $API_SCRIPT"
        exit 1
    fi

    log "Starting Setup API on 0.0.0.0:4000 (foreground for systemd)"
    exec python3 "$API_SCRIPT"
}

log "=== Pi Setup Boot Check ==="

# Wait briefly for NetworkManager
for _ in 1 2 3 4 5 6 7 8 9 10; do
    if nmcli general status >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

if [ -f "$CREDENTIALS_FILE" ]; then
    CONFIGURED=$(jq -r '.configured // false' "$CREDENTIALS_FILE" 2>/dev/null || echo "false")
    SSID=$(jq -r '.ssid // ""' "$CREDENTIALS_FILE" 2>/dev/null || echo "")

    if [ "$CONFIGURED" = "true" ] && [ -n "$SSID" ]; then
        log "WiFi configured for SSID: $SSID"

        # Make sure SoftAP is not holding the radio
        if ap=$(find_ap_connection 2>/dev/null); then
            if nmcli -t -f NAME connection show --active 2>/dev/null | grep -Fxq "$ap"; then
                log "Stopping SoftAP ($ap) before joining home WiFi"
                nmcli connection down "$ap" 2>&1 | tee -a "$LOG_FILE" || true
            fi
        fi

        if nmcli connection up "$SSID" 2>&1 | tee -a "$LOG_FILE"; then
            log "Connected to home WiFi successfully"
            exit 0
        fi
        log "WARNING: Failed to connect to $SSID — falling back to setup SoftAP"
    fi
fi

start_softap
