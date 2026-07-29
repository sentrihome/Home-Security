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

echo ""
echo "✓ Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Reboot the Pi: sudo reboot"
echo "  2. Pi will start in SoftAP mode (HomeSecurity-Setup)"
echo "  3. Connect phone and POST credentials to http://10.42.0.1:4000/wifi"
echo "  4. Pi will switch to home WiFi automatically"
echo ""
echo "To reset/reconfigure:"
echo "  sudo rm /home/koushik/wifi-credentials.json"
echo "  sudo systemctl restart pi-setup.service"
echo ""
echo "View logs:"
echo "  tail -f /var/log/pi-setup.log"
