#!/bin/bash
# Install Pi SoftAP Setup System
# Run this on the Pi: ./install-pi-setup.sh

set -e

echo "=== Installing Pi SoftAP Setup System ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root: sudo ./install-pi-setup.sh"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
apt-get update
apt-get install -y python3 python3-pip python3-flask jq

# Copy files
echo "Copying files..."
cp pi-setup-api.py /home/koushik/
cp pi-setup-boot.sh /home/koushik/
chmod +x /home/koushik/pi-setup-boot.sh
chown koushik:koushik /home/koushik/pi-setup-api.py
chown koushik:koushik /home/koushik/pi-setup-boot.sh

# Install systemd service
echo "Installing systemd service..."
cp pi-setup.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable pi-setup.service

# Ensure dnsmasq doesn't conflict
echo "Disabling standalone dnsmasq..."
systemctl is-active dnsmasq.service && systemctl stop dnsmasq.service || true
systemctl is-enabled dnsmasq.service && systemctl disable dnsmasq.service || true

# Create log file
touch /var/log/pi-setup.log
chmod 644 /var/log/pi-setup.log

# Ensure SoftAP NM profile exists (shows as HomeSecurity-Setup in WiFi menu).
# Boot script activates it automatically — no manual click required.
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

# Apply static home IP to an already-provisioned SSID (if credentials exist).
STATIC_IP="192.168.0.236"
STATIC_CIDR="${STATIC_IP}/24"
STATIC_GATEWAY="192.168.0.1"
STATIC_DNS="192.168.0.1,8.8.8.8"
CREDENTIALS_FILE="/home/koushik/wifi-credentials.json"

echo "Ensuring home WiFi uses static IP ${STATIC_CIDR}..."
HOME_SSID=""
if [ -f "$CREDENTIALS_FILE" ]; then
    HOME_SSID=$(jq -r '.ssid // empty' "$CREDENTIALS_FILE" 2>/dev/null || true)
fi
# Fall back to currently active wlan0 connection (e.g. Koushik)
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
    # Refresh address if this profile is already active
    if nmcli -t -f NAME connection show --active 2>/dev/null | grep -Fxq "$HOME_SSID"; then
        nmcli connection up "$HOME_SSID" || true
    fi
else
    echo "No home SSID found yet — static IP will be applied on first SoftAP provisioning / boot."
fi

echo ""
echo "✓ Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Reboot the Pi: sudo reboot"
echo "  2. If unconfigured: Pi auto-starts SoftAP (HomeSecurity-Setup) — no WiFi-menu click needed"
echo "  3. Connect phone and POST credentials to http://10.42.0.1:4000/wifi"
echo "  4. Pi switches to home WiFi at static ${STATIC_CIDR}"
echo ""
echo "To reset/reconfigure:"
echo "  sudo rm /home/koushik/wifi-credentials.json"
echo "  sudo systemctl restart pi-setup.service"
echo ""
echo "View logs:"
echo "  tail -f /var/log/pi-setup.log"
