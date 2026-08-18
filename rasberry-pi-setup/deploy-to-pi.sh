#!/bin/bash
# Copy SoftAP + hub to the Pi and run the installer.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_IP="${PI_IP:-192.168.0.236}"
PI_USER="${PI_USER:-koushik}"

echo "=== Copying rasberry-pi-setup to Pi at $PI_IP ==="

ssh "${PI_USER}@${PI_IP}" "mkdir -p /tmp/rasberry-pi-setup/systemd /tmp/rasberry-pi-setup/scripts"

scp "$SCRIPT_DIR/pi-setup-api.py" \
    "$SCRIPT_DIR/pi-setup-boot.sh" \
    "$SCRIPT_DIR/install-pi-setup.sh" \
    "$SCRIPT_DIR/requirements.txt" \
    "${PI_USER}@${PI_IP}:/tmp/rasberry-pi-setup/"

scp -r "$SCRIPT_DIR/pi_hub" "${PI_USER}@${PI_IP}:/tmp/rasberry-pi-setup/"
scp -r "$SCRIPT_DIR/tests" "${PI_USER}@${PI_IP}:/tmp/rasberry-pi-setup/"
scp "$SCRIPT_DIR/systemd/"*.service "${PI_USER}@${PI_IP}:/tmp/rasberry-pi-setup/systemd/"
scp "$SCRIPT_DIR/scripts/fetch-detection-model.sh" "${PI_USER}@${PI_IP}:/tmp/rasberry-pi-setup/scripts/"

echo ""
echo "=== Running installer on Pi ==="
ssh "${PI_USER}@${PI_IP}" << 'REMOTE'
cd /tmp/rasberry-pi-setup
chmod +x install-pi-setup.sh pi-setup-boot.sh scripts/fetch-detection-model.sh
python3 -m unittest discover -s tests -q || echo "WARNING: detection unit tests failed"
sudo ./install-pi-setup.sh
REMOTE

echo ""
echo "✓ Installation complete!"
echo ""
echo "Reboot the Pi to test SoftAP → hub handoff:"
echo "  ssh ${PI_USER}@${PI_IP} 'sudo reboot'"
echo ""
echo "After home Wi‑Fi is up:"
echo "  curl http://${PI_IP}:4000/health"
echo "  # expect mode: hub"
