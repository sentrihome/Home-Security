#!/bin/bash
# Shared helpers for Pi SoftAP / home-WiFi boot (sourced, not executed).

PI_HOME="${PI_HOME:-/home/koushik}"
CREDENTIALS_FILE="${CREDENTIALS_FILE:-$PI_HOME/wifi-credentials.json}"
LOG_FILE="${LOG_FILE:-/var/log/pi-setup.log}"
SETUP_CON="HomeSecurity-Setup"
SETUP_SSID="HomeSecurity-Setup"
SETUP_PSK="setup1234"
WLAN_IF="wlan0"
API_SCRIPT="$PI_HOME/pi-setup-api.py"
HUB_SERVICE="pi-hub.service"
HUB_READY_FLAG="$PI_HOME/homesecurity/.hub-ready"
PI_MODE_FILE="$PI_HOME/homesecurity/pi-mode"
DATA_DIR="$PI_HOME/homesecurity"

STATIC_IP="192.168.0.236"
STATIC_PREFIX="24"
STATIC_GATEWAY="192.168.0.1"
STATIC_DNS="192.168.0.1,8.8.8.8"
STATIC_CIDR="${STATIC_IP}/${STATIC_PREFIX}"

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg" >>"$LOG_FILE"
    echo "$msg" >&2
}

nm_log() {
    nmcli "$@" >>"$LOG_FILE" 2>&1
}

pi_mode() {
    if [ -f "$PI_MODE_FILE" ]; then
        tr -d '[:space:]' <"$PI_MODE_FILE"
    else
        echo "prod"
    fi
}

write_pi_mode() {
    mkdir -p "$(dirname "$PI_MODE_FILE")"
    printf '%s\n' "$1" >"$PI_MODE_FILE"
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
        type wifi ifname "$WLAN_IF" con-name "$SETUP_CON" \
        autoconnect no ssid "$SETUP_SSID"
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

stop_hub() {
    if systemctl is-active "$HUB_SERVICE" >/dev/null 2>&1; then
        log "Stopping $HUB_SERVICE"
        systemctl stop "$HUB_SERVICE" || true
    fi
    rm -f "$HUB_READY_FLAG"
}

wait_for_nm() {
    local _
    for _ in $(seq 1 15); do
        if nmcli general status >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
}

start_softap() {
    log "Starting SoftAP ($SETUP_SSID)"
    stop_hub

    if systemctl is-active dnsmasq.service >/dev/null 2>&1; then
        systemctl stop dnsmasq.service
    fi
    if systemctl is-enabled dnsmasq.service >/dev/null 2>&1; then
        systemctl disable dnsmasq.service >/dev/null 2>&1 || true
    fi

    local con
    con=$(ensure_softap_connection)
    con=$(printf '%s' "$con" | tr -d '\r' | awk 'NF{print; exit}')
    if [ -z "$con" ]; then
        log "ERROR: could not resolve SoftAP connection name"
        exit 1
    fi

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

    nm_log device disconnect "$WLAN_IF" || true
    sleep 1

    log "Activating SoftAP connection: $con"
    if ! nm_log connection up "$con"; then
        log "ERROR: Failed to start SoftAP ($con)"
        exit 1
    fi
    sleep 2
    if ! softap_is_active "$con"; then
        log "ERROR: SoftAP connection $con is not active after nmcli up"
        exit 1
    fi

    local ip
    ip=$(ip -4 -o addr show "$WLAN_IF" 2>/dev/null | awk '{print $4}' | head -1)
    log "SoftAP active — SSID=$SETUP_SSID iface_addr=${ip:-unknown} password=$SETUP_PSK"

    if [ ! -f "$API_SCRIPT" ]; then
        log "ERROR: Missing $API_SCRIPT"
        exit 1
    fi

    log "Starting Setup API on 0.0.0.0:4000 (includes /dev Drive portal)"
    exec python3 "$API_SCRIPT"
}

join_home_wifi() {
    local SSID CONFIGURED
    if [ ! -f "$CREDENTIALS_FILE" ]; then
        log "join_home_wifi: no $CREDENTIALS_FILE"
        return 1
    fi
    CONFIGURED=$(jq -r '.configured // false' "$CREDENTIALS_FILE" 2>/dev/null || echo "false")
    SSID=$(jq -r '.ssid // ""' "$CREDENTIALS_FILE" 2>/dev/null || echo "")
    if [ "$CONFIGURED" != "true" ] || [ -z "$SSID" ]; then
        log "join_home_wifi: credentials not configured"
        return 1
    fi

    log "Joining home WiFi SSID=$SSID"
    nm_log device set "$WLAN_IF" autoconnect yes || true
    nm_log connection modify "$SSID" connection.autoconnect yes || true
    apply_home_static_ip "$SSID" || log "WARNING: Failed to apply static IP to $SSID"

    if ap=$(find_ap_connection 2>/dev/null); then
        if softap_is_active "$ap"; then
            log "Stopping SoftAP ($ap) before joining home WiFi"
            nm_log connection down "$ap" || true
        fi
    fi

    if ! nm_log connection up "$SSID"; then
        log "WARNING: Failed to connect to $SSID"
        return 1
    fi
    log "Connected to home WiFi at ${STATIC_CIDR}"
    mkdir -p "$(dirname "$HUB_READY_FLAG")"
    touch "$HUB_READY_FLAG"
    log "Starting $HUB_SERVICE"
    systemctl start "$HUB_SERVICE" || log "WARNING: failed to start $HUB_SERVICE"
    return 0
}

wipe_dev_state() {
    log "DEV wipe: wifi creds, Drive token, clip cache, hub-ready"
    rm -f "$CREDENTIALS_FILE"
    rm -f "$HUB_READY_FLAG"
    rm -f "$DATA_DIR/drive_token.json.enc"
    rm -f "$DATA_DIR/.drive_key"
    # Keep drive_oauth_client.json so the Web client id/secret survive a reset.
    rm -rf "$DATA_DIR/clips" "$DATA_DIR/hls"
    mkdir -p "$DATA_DIR/clips" "$DATA_DIR/hls" "$DATA_DIR/logs" "$DATA_DIR/models"
    chown -R koushik:koushik "$DATA_DIR" 2>/dev/null || true
    stop_hub
}
