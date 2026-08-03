#!/bin/bash
# Quick Setup — Copy files to Pi and install

set -e

PI_IP="192.168.0.236"
PI_USER="koushik"

echo "=== Copying files to Pi at $PI_IP ==="

scp pi-setup-api.py pi-setup-boot.sh pi-setup.service install-pi-setup.sh \
    ${PI_USER}@${PI_IP}:/tmp/

echo ""
echo "=== Running installer on Pi ==="
ssh ${PI_USER}@${PI_IP} << 'REMOTE'
cd /tmp
chmod +x install-pi-setup.sh
sudo ./install-pi-setup.sh
REMOTE

echo ""
echo "✓ Installation complete!"
echo ""
echo "Reboot the Pi to test:"
echo "  ssh koushik@192.168.0.236 'sudo reboot'"
echo ""
echo "After reboot, Pi will be in SoftAP mode."
echo "Join 'HomeSecurity-Setup' from your phone and open the mobile app."
