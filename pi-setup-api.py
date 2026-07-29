#!/usr/bin/env python3
"""
Pi SoftAP Setup API
Runs on 10.42.0.1:4000 during hotspot mode
Receives home WiFi credentials from mobile app
"""

from flask import Flask, request, jsonify
import subprocess
import json
import os
import sys

app = Flask(__name__)

CREDENTIALS_FILE = "/home/koushik/wifi-credentials.json"


@app.route('/status', methods=['GET'])
def status():
    """Health check endpoint"""
    return jsonify({
        "status": "ready",
        "mode": "setup",
        "device": "raspberry-pi-home-security"
    })


@app.route('/wifi', methods=['POST'])
def set_wifi():
    """
    Receive WiFi credentials from mobile app
    Expected JSON: {"ssid": "HomeNetwork", "password": "pass123"}
    """
    try:
        data = request.get_json()
        
        if not data or 'ssid' not in data or 'password' not in data:
            return jsonify({"error": "Missing ssid or password"}), 400
        
        ssid = data['ssid']
        password = data['password']
        
        # Save credentials
        credentials = {
            "ssid": ssid,
            "password": password,
            "configured": True
        }
        
        with open(CREDENTIALS_FILE, 'w') as f:
            json.dump(credentials, f, indent=2)
        
        # Configure NetworkManager with new credentials
        try:
            # Check if connection already exists
            result = subprocess.run(
                ['nmcli', 'connection', 'show', ssid],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                # Update existing connection
                subprocess.run([
                    'nmcli', 'connection', 'modify', ssid,
                    '802-11-wireless-security.psk', password
                ], check=True)
            else:
                # Create new connection
                subprocess.run([
                    'nmcli', 'device', 'wifi', 'connect', ssid,
                    'password', password,
                    'ifname', 'wlan0'
                ], check=True)
            
            # Schedule switch to home WiFi (give client time to get response).
            # SoftAP connection may be named HomeSecurity-Setup or legacy Hotspot.
            # Re-enable STA autoconnect that setup mode disabled.
            safe_ssid = ssid.replace('"', '\\"')
            subprocess.Popen([
                'bash', '-c',
                (
                    'sleep 3; '
                    'nmcli device set wlan0 autoconnect yes; '
                    'nmcli connection modify "{ssid}" connection.autoconnect yes; '
                    'nmcli connection down HomeSecurity-Setup 2>/dev/null || '
                    'nmcli connection down Hotspot 2>/dev/null || true; '
                    'nmcli connection up "{ssid}"'
                ).format(ssid=safe_ssid)
            ])
            
            return jsonify({
                "success": True,
                "message": "WiFi credentials saved, switching to home network..."
            })
            
        except subprocess.CalledProcessError as e:
            return jsonify({
                "error": "Failed to configure WiFi",
                "details": str(e)
            }), 500
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/scan', methods=['GET'])
def scan_networks():
    """List available WiFi networks"""
    try:
        result = subprocess.run(
            ['nmcli', '-t', '-f', 'SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list'],
            capture_output=True,
            text=True,
            check=True
        )
        
        networks = []
        for line in result.stdout.strip().split('\n'):
            if line:
                parts = line.split(':')
                if len(parts) >= 3 and parts[0]:  # Skip empty SSIDs
                    networks.append({
                        "ssid": parts[0],
                        "signal": int(parts[1]) if parts[1] else 0,
                        "security": parts[2] if parts[2] else "open"
                    })
        
        # Remove duplicates, keep strongest signal
        unique = {}
        for net in networks:
            ssid = net['ssid']
            if ssid not in unique or net['signal'] > unique[ssid]['signal']:
                unique[ssid] = net
        
        return jsonify({"networks": list(unique.values())})
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    # Must run as root to use nmcli
    if os.geteuid() != 0:
        print("ERROR: Must run as root (sudo)", file=sys.stderr)
        sys.exit(1)
    
    print("Pi Setup API starting on 0.0.0.0:4000...")
    print("Endpoints:")
    print("  GET  /status  - Health check")
    print("  GET  /scan    - List WiFi networks")
    print("  POST /wifi    - Set WiFi credentials")
    
    app.run(host='0.0.0.0', port=4000, debug=False)
