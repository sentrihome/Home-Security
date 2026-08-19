#!/bin/bash
# Install Pi SoftAP + Hub (live / clips / Drive upload)
# Run this on the Pi: sudo ./install-pi-setup.sh
#
# Env:
#   SKIP_APT=1          skip apt-get
#   FORCE=1             continue even if preflight finds leftover-state problems
#   PI_BOOT_INSTALL=1   called from pi-setup-boot.sh (do not stop ourselves)
#   START_SETUP=1       after install, start pi-setup (may SoftAP / DEV-wipe)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_HOME="/home/koushik"
# Canonical git clone on the Pi (boot + CI pull from here).
PI_REPO_DIR="${PI_REPO_DIR:-$PI_HOME/apps/Home-Security}"

if [ "$EUID" -ne 0 ]; then
    echo "Please run as root: sudo ./install-pi-setup.sh"
    exit 1
fi

# shellcheck source=pi-preflight.sh
if [ -f "$SCRIPT_DIR/pi-preflight.sh" ]; then
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/pi-preflight.sh"
    preflight_collect
    preflight_print_bar
    if [ "${PI_BOOT_INSTALL:-0}" != "1" ]; then
        preflight_fail_if_blocking
        preflight_fix
        preflight_collect
        preflight_print_bar
    else
        echo "PI_BOOT_INSTALL=1 — skip service stop (boot script is the parent)"
    fi
fi

echo "=== Installing Pi SoftAP + Hub ==="
echo "Git clone: $PI_REPO_DIR"

echo "Installing dependencies..."
if [ "${SKIP_APT:-0}" != "1" ]; then
    apt-get update
    apt-get install -y python3 python3-pip python3-flask jq ffmpeg git whiptail
else
    echo "SKIP_APT=1 — not running apt-get"
fi

if [ -f "$SCRIPT_DIR/requirements.txt" ]; then
    pip3 install --break-system-packages -r "$SCRIPT_DIR/requirements.txt" 2>/dev/null \
        || pip3 install -r "$SCRIPT_DIR/requirements.txt" || true
fi

echo "Copying SoftAP files..."
cp "$SCRIPT_DIR/pi-setup-api.py" "$PI_HOME/"
cp "$SCRIPT_DIR/pi-setup-boot.sh" "$PI_HOME/"
cp "$SCRIPT_DIR/pi-setup-lib.sh" "$PI_HOME/"
cp "$SCRIPT_DIR/pi-setup-dev.sh" "$PI_HOME/"
cp "$SCRIPT_DIR/pi-setup-prod.sh" "$PI_HOME/"
chmod +x "$PI_HOME/pi-setup-boot.sh" "$PI_HOME/pi-setup-dev.sh" \
         "$PI_HOME/pi-setup-prod.sh" "$PI_HOME/pi-setup-lib.sh"
if [ -f "$SCRIPT_DIR/choose-version.sh" ]; then
    cp "$SCRIPT_DIR/choose-version.sh" "$PI_HOME/choose-version.sh"
    chmod +x "$PI_HOME/choose-version.sh"
    chown koushik:koushik "$PI_HOME/choose-version.sh"
fi
if [ -f "$SCRIPT_DIR/pi-preflight.sh" ]; then
    cp "$SCRIPT_DIR/pi-preflight.sh" "$PI_HOME/pi-preflight.sh"
    chmod +x "$PI_HOME/pi-preflight.sh"
    chown koushik:koushik "$PI_HOME/pi-preflight.sh"
fi
chown koushik:koushik "$PI_HOME/pi-setup-api.py" "$PI_HOME/pi-setup-boot.sh" \
    "$PI_HOME/pi-setup-lib.sh" "$PI_HOME/pi-setup-dev.sh" "$PI_HOME/pi-setup-prod.sh"

echo "Copying pi_hub package..."
rm -rf "$PI_HOME/pi_hub"
cp -a "$SCRIPT_DIR/pi_hub" "$PI_HOME/pi_hub"
chown -R koushik:koushik "$PI_HOME/pi_hub"
mkdir -p "$PI_HOME/homesecurity/hls" "$PI_HOME/homesecurity/clips" \
         "$PI_HOME/homesecurity/logs" "$PI_HOME/homesecurity/models"
echo "$PI_REPO_DIR" > "$PI_HOME/homesecurity/repo-dir"
chown -R koushik:koushik "$PI_HOME/homesecurity"

echo "Fetching object detection model (MobileNet-SSD)..."
if [ -x "$SCRIPT_DIR/scripts/fetch-detection-model.sh" ]; then
    "$SCRIPT_DIR/scripts/fetch-detection-model.sh" "$PI_HOME/homesecurity/models" \
        || echo "NOTE: model fetch failed (offline?) — detection stays off until you run
      scripts/fetch-detection-model.sh manually. The hub runs fine without it."
elif [ -f "$SCRIPT_DIR/scripts/fetch-detection-model.sh" ]; then
    bash "$SCRIPT_DIR/scripts/fetch-detection-model.sh" "$PI_HOME/homesecurity/models" \
        || echo "NOTE: model fetch failed — run it manually later."
fi

echo "Installing MediaMTX config + unit (shared camera fan-out)..."
mkdir -p /etc/mediamtx
if [ -f "$SCRIPT_DIR/mediamtx/mediamtx.yml" ]; then
    cp "$SCRIPT_DIR/mediamtx/mediamtx.yml" /etc/mediamtx/mediamtx.yml
fi
if [ -f "$SCRIPT_DIR/systemd/mediamtx.service" ]; then
    cp "$SCRIPT_DIR/systemd/mediamtx.service" /etc/systemd/system/
fi
if [ -x /usr/local/bin/mediamtx ]; then
    systemctl enable mediamtx.service 2>/dev/null || true
    systemctl restart mediamtx.service 2>/dev/null || systemctl start mediamtx.service 2>/dev/null || true
else
    echo "NOTE: /usr/local/bin/mediamtx not found — install MediaMTX (see docs/WEBRTC-LAB.md) then: systemctl enable --now mediamtx"
fi

echo "Installing systemd units..."
cp "$SCRIPT_DIR/systemd/pi-setup.service" /etc/systemd/system/
cp "$SCRIPT_DIR/systemd/pi-hub.service" /etc/systemd/system/
# Drop legacy unit path if someone still has the old flat copy
rm -f /etc/systemd/system/pi-setup.service.bak
systemctl daemon-reload
systemctl enable pi-setup.service
# Hub is started by boot after Wi‑Fi (no WantedBy) — unit file is enough.

echo "Disabling standalone dnsmasq..."
systemctl is-active dnsmasq.service && systemctl stop dnsmasq.service || true
systemctl is-enabled dnsmasq.service && systemctl disable dnsmasq.service || true

touch /var/log/pi-setup.log
chmod 644 /var/log/pi-setup.log

echo "Ensuring SoftAP NetworkManager profile..."
if ! nmcli -t -f NAME connection show | grep -Fxq "HomeSecurity-Setup"; then
    if nmcli -t -f NAME connection show | grep -Fxq "Hotspot"; then
        nmcli connection modify Hotspot connection.id HomeSecurity-Setup || true
    else
        nmcli connection add type wifi ifname wlan0 con-name HomeSecurity-Setup \
            autoconnect no ssid HomeSecurity-Setup || true
        nmcli connection modify HomeSecurity-Setup \
            802-11-wireless.mode ap \
            802-11-wireless.band a \
            802-11-wireless.channel 36 \
            ipv4.method shared \
            wifi-sec.key-mgmt wpa-psk \
            wifi-sec.psk setup1234 || true
    fi
fi
nmcli connection modify HomeSecurity-Setup connection.autoconnect no 2>/dev/null || true

STATIC_IP="192.168.0.236"
STATIC_CIDR="${STATIC_IP}/24"
STATIC_GATEWAY="192.168.0.1"
STATIC_DNS="192.168.0.1,8.8.8.8"
CREDENTIALS_FILE="$PI_HOME/wifi-credentials.json"

echo "Ensuring home WiFi uses static IP ${STATIC_CIDR}..."
HOME_SSID=""
if [ -f "$CREDENTIALS_FILE" ]; then
    HOME_SSID=$(jq -r '.ssid // empty' "$CREDENTIALS_FILE" 2>/dev/null || true)
fi
if [ -z "$HOME_SSID" ]; then
    HOME_SSID=$(nmcli -t -f NAME,DEVICE connection show --active 2>/dev/null \
        | awk -F: '$2=="wlan0"{print $1; exit}')
fi
if [ -n "$HOME_SSID" ] && [ "$HOME_SSID" != "HomeSecurity-Setup" ] && [ "$HOME_SSID" != "Hotspot" ]; then
    echo "Applying static IP to connection: $HOME_SSID"
    nmcli connection modify "$HOME_SSID" \
        ipv4.method manual \
        ipv4.addresses "$STATIC_CIDR" \
        ipv4.gateway "$STATIC_GATEWAY" \
        ipv4.dns "$STATIC_DNS" \
        ipv4.ignore-auto-dns yes || true
    if nmcli -t -f NAME connection show --active 2>/dev/null | grep -Fxq "$HOME_SSID"; then
        nmcli connection up "$HOME_SSID" || true
    fi
else
    echo "No home SSID found yet — static IP will be applied on first SoftAP provisioning / boot."
fi

echo ""
echo "✓ Installation complete!"
echo ""
if [ "${PI_BOOT_INSTALL:-0}" != "1" ]; then
    if [ "${START_SETUP:-0}" = "1" ]; then
        echo "START_SETUP=1 — starting pi-setup.service (SoftAP / DEV wipe possible)"
        systemctl start pi-setup.service
    else
        if type preflight_start_right_service >/dev/null 2>&1; then
            preflight_start_right_service
        fi
    fi
fi
echo ""
echo "Layout on Pi:"
echo "  SoftAP gate:  $PI_HOME/pi-setup-boot.sh + pi-setup-api.py"
echo "  Hub package:  $PI_HOME/pi_hub/  (live + clips + Drive)"
echo "  Data:         $PI_HOME/homesecurity/"
echo "  Branch UI:    $PI_HOME/choose-version.sh  (fetch + checkout + reinstall)"
echo ""
echo "Boot rule:"
echo "  git pull pie-dev-testing, then:"
echo "    DEV  (branch pie-dev-testing) → wipe creds/token/cache → SoftAP"
echo "         → Drive token + Wi‑Fi → join home LAN → pi-hub"
echo "    PROD → home Wi‑Fi if configured, else SoftAP"
echo ""
echo "Next steps:"
echo "  Switch branch: $PI_HOME/choose-version.sh"
echo "  Health:        curl http://${STATIC_IP}:4000/health"
echo "  Reboot only if you want SoftAP / DEV wipe: sudo reboot"
echo ""
echo "Logs:"
echo "  SoftAP:  tail -f /var/log/pi-setup.log"
echo "  Hub:     journalctl -u pi-hub -f"
