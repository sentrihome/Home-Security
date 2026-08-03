#!/bin/bash
# Install Pi SoftAP + Hub (live / clips / Drive stubs)
# Run this on the Pi: sudo ./install-pi-setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_HOME="/home/koushik"

echo "=== Installing Pi SoftAP + Hub ==="

if [ "$EUID" -ne 0 ]; then
    echo "Please run as root: sudo ./install-pi-setup.sh"
    exit 1
fi

echo "Installing dependencies..."
if [ "${SKIP_APT:-0}" = "1" ]; then
    echo "SKIP_APT=1 — skipping apt-get (CI quick deploy)"
else
    apt-get update
    apt-get install -y python3 python3-pip python3-flask jq ffmpeg
fi

if [ -f "$SCRIPT_DIR/requirements.txt" ]; then
    pip3 install --break-system-packages -r "$SCRIPT_DIR/requirements.txt" 2>/dev/null \
        || pip3 install -r "$SCRIPT_DIR/requirements.txt" || true
fi

echo "Copying SoftAP files..."
cp "$SCRIPT_DIR/pi-setup-api.py" "$PI_HOME/"
cp "$SCRIPT_DIR/pi-setup-boot.sh" "$PI_HOME/"
chmod +x "$PI_HOME/pi-setup-boot.sh"
chown koushik:koushik "$PI_HOME/pi-setup-api.py" "$PI_HOME/pi-setup-boot.sh"

echo "Copying pi_hub package..."
rm -rf "$PI_HOME/pi_hub"
cp -a "$SCRIPT_DIR/pi_hub" "$PI_HOME/pi_hub"
chown -R koushik:koushik "$PI_HOME/pi_hub"
mkdir -p "$PI_HOME/homesecurity/hls" "$PI_HOME/homesecurity/clips"
chown -R koushik:koushik "$PI_HOME/homesecurity"

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
echo "Layout on Pi:"
echo "  SoftAP gate:  $PI_HOME/pi-setup-boot.sh + pi-setup-api.py"
echo "  Hub package:  $PI_HOME/pi_hub/  (live + clips + Drive)"
echo "  Data:         $PI_HOME/homesecurity/"
echo ""
echo "Boot rule:"
echo "  unconfigured → SoftAP + setup API :4000"
echo "  home Wi‑Fi   → pi-hub :4000 (GET /health, /start, /stop, /motion, /auth/drive)"
echo ""
echo "Next steps:"
echo "  1. Reboot: sudo reboot"
echo "  2. SoftAP if needed → configure Wi‑Fi → reboot or wait for next boot hub start"
echo "  3. Health: curl http://${STATIC_IP}:4000/health"
echo ""
echo "Logs:"
echo "  SoftAP:  tail -f /var/log/pi-setup.log"
echo "  Hub:     journalctl -u pi-hub -f"
