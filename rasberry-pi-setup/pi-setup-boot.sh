#!/bin/bash
# Pi SoftAP Boot Script
# If unconfigured, activates HomeSecurity-Setup SoftAP automatically
# (no tray/menu click required).

set -euo pipefail

CREDENTIALS_FILE="/home/koushik/wifi-credentials.json"
LOG_FILE="/var/log/pi-setup.log"
SETUP_CON="HomeSecurity-Setup"
SETUP_SSID="HomeSecurity-Setup"
SETUP_PSK="setup1234"
WLAN_IF="wlan0"
API_SCRIPT="/home/koushik/pi-setup-api.py"

# Fixed home-LAN address (ESP / app / deploy scripts assume this)
STATIC_IP="192.168.0.236"
STATIC_PREFIX="24"
STATIC_GATEWAY="192.168.0.1"
STATIC_DNS="192.168.0.1,8.8.8.8"
STATIC_CIDR="${STATIC_IP}/${STATIC_PREFIX}"

log() {
    # Write once to the log file. Do not also tee to stderr when systemd
    # StandardError=append points at the same file (that duplicated every line).
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg" >>"$LOG_FILE"
    echo "$msg" >&2
}

nm_log() {
    # Run nmcli; append all output to log file only (keep stdout clean)
    nmcli "$@" >>"$LOG_FILE" 2>&1
}

apply_home_static_ip() {
    local ssid="$1"
    log "Applying static IP ${STATIC_CIDR} (gw ${STATIC_GATEWAY}) on connection [$ssid]"
    nm_log connection modify "$ssid" \
        ipv4.method manual \
        ipv4.addresses "$STATIC_CIDR" \
        ipv4.gateway "$STATIC_GATEWAY" \
        ipv4.dns "$STATIC_DNS" \
        ipv4.ignore-auto-dns yes
}

find_ap_connection() {
    if nmcli -t -f NAME connection show 2>/dev/null | grep -Fxq "$SETUP_CON"; then
        printf '%s\n' "$SETUP_CON"
        return 0
    fi

    local name mode
    while IFS= read -r name; do
        [ -z "$name" ] && continue
        mode=$(nmcli -g 802-11-wireless.mode connection show "$name" 2>/dev/null || true)
        if [ "$mode" = "ap" ]; then
            printf '%s\n' "$name"
            return 0
        fi
    done < <(nmcli -t -f NAME connection show 2>/dev/null)

    if nmcli -t -f NAME connection show 2>/dev/null | grep -Fxq "Hotspot"; then
        printf '%s\n' "Hotspot"
        return 0
    fi

    return 1
}

disable_sta_autoconnect() {
    # Stop home WiFi profiles from reclaiming wlan0 after we drop them for SoftAP.
    local name mode
    while IFS= read -r name; do
        [ -z "$name" ] && continue
        [ "$name" = "$SETUP_CON" ] && continue
        mode=$(nmcli -g 802-11-wireless.mode connection show "$name" 2>/dev/null || true)
        if [ "$mode" = "infrastructure" ]; then
            nm_log connection modify "$name" connection.autoconnect no || true
        fi
    done < <(nmcli -t -f NAME,TYPE connection show 2>/dev/null | awk -F: '$2 ~ /wireless/ {print $1}')
}

ensure_softap_connection() {
    local con=""

    if con=$(find_ap_connection); then
        log "Found existing AP connection: $con"
        nm_log connection modify "$con" \
            connection.autoconnect no \
            802-11-wireless.ssid "$SETUP_SSID" \
            802-11-wireless.mode ap \
            ipv4.method shared \
            802-11-wireless-security.key-mgmt wpa-psk \
            802-11-wireless-security.psk "$SETUP_PSK" || true

        if [ "$con" != "$SETUP_CON" ]; then
            nm_log connection modify "$con" connection.id "$SETUP_CON" || true
            con="$SETUP_CON"
        fi
        printf '%s\n' "$con"
        return 0
    fi

    log "Creating SoftAP connection $SETUP_CON"
    nm_log connection add \
        type wifi \
        ifname "$WLAN_IF" \
        con-name "$SETUP_CON" \
        autoconnect no \
        ssid "$SETUP_SSID"

    nm_log connection modify "$SETUP_CON" \
        802-11-wireless.mode ap \
        802-11-wireless.band a \
        802-11-wireless.channel 36 \
        ipv4.method shared \
        wifi-sec.key-mgmt wpa-psk \
        wifi-sec.psk "$SETUP_PSK"

    printf '%s\n' "$SETUP_CON"
}

softap_is_active() {
    local con="$1"
    nmcli -t -f NAME connection show --active 2>/dev/null | grep -Fxq "$con"
}

start_softap() {
    log "No WiFi configured or home WiFi failed — starting SoftAP automatically"

    if systemctl is-active dnsmasq.service >/dev/null 2>&1; then
        systemctl stop dnsmasq.service
    fi
    if systemctl is-enabled dnsmasq.service >/dev/null 2>&1; then
        systemctl disable dnsmasq.service >/dev/null 2>&1 || true
    fi

    local con
    con=$(ensure_softap_connection)
    # Strip any accidental whitespace/newlines
    con=$(printf '%s' "$con" | tr -d '\r' | awk 'NF{print; exit}')

    if [ -z "$con" ]; then
        log "ERROR: could not resolve SoftAP connection name"
        exit 1
    fi

    log "Using SoftAP connection name: [$con]"

    # Prevent STA profiles (e.g. Koushik) from auto-reconnecting over SoftAP
    disable_sta_autoconnect
    nm_log device set "$WLAN_IF" autoconnect no || true

    local active
    active=$(nmcli -t -f NAME,DEVICE connection show --active 2>/dev/null \
        | awk -F: -v iface="$WLAN_IF" '$2==iface {print $1; exit}')
    if [ -n "${active:-}" ] && [ "$active" != "$con" ]; then
        log "Bringing down active connection on $WLAN_IF: $active"
        nm_log connection down "$active" || true
        sleep 1
    fi

    # Disconnect device first so AP can bind cleanly
    nm_log device disconnect "$WLAN_IF" || true
    sleep 1

    log "Activating SoftAP connection: $con"
    if ! nm_log connection up "$con"; then
        log "ERROR: Failed to start SoftAP ($con)"
        exit 1
    fi

    # Verify it actually came up (don't trust exit code alone)
    sleep 2
    if ! softap_is_active "$con"; then
        log "ERROR: SoftAP connection $con is not active after nmcli up"
        nmcli -t -f NAME,DEVICE connection show --active >>"$LOG_FILE" 2>&1 || true
        exit 1
    fi

    local ip
    ip=$(ip -4 -o addr show "$WLAN_IF" 2>/dev/null | awk '{print $4}' | head -1)
    log "SoftAP active — SSID=$SETUP_SSID iface_addr=${ip:-unknown} password=$SETUP_PSK"

    if [ ! -f "$API_SCRIPT" ]; then
        log "ERROR: Missing $API_SCRIPT"
        exit 1
    fi

    log "Starting Setup API on 0.0.0.0:4000 (foreground for systemd)"
    exec python3 "$API_SCRIPT"
}

log "=== Pi Setup Boot Check ==="

for _ in $(seq 1 15); do
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

        # Re-enable STA autoconnect for normal mode
        nm_log device set "$WLAN_IF" autoconnect yes || true
        nm_log connection modify "$SSID" connection.autoconnect yes || true

        # Always reassert static home IP (survives GUI/DHCP changes)
        if ! apply_home_static_ip "$SSID"; then
            log "WARNING: Failed to apply static IP to $SSID"
        fi

        if ap=$(find_ap_connection 2>/dev/null); then
            if softap_is_active "$ap"; then
                log "Stopping SoftAP ($ap) before joining home WiFi"
                nm_log connection down "$ap" || true
            fi
        fi

        if nm_log connection up "$SSID"; then
            log "Connected to home WiFi successfully at ${STATIC_CIDR}"
            exit 0
        fi
        log "WARNING: Failed to connect to $SSID — falling back to setup SoftAP"
    fi
fi

start_softap
