#!/usr/bin/env python3
"""
Pi SoftAP Setup API
Runs on 10.42.0.1:4000 during hotspot mode.
WiFi provisioning + Drive sign-in portal. In DEV mode, home WiFi is joined
only after a Drive token is stored.
"""

from flask import Flask, request, jsonify
import json
import os
import subprocess
import sys

PI_HOME = "/home/koushik"
if PI_HOME not in sys.path:
    sys.path.insert(0, PI_HOME)

app = Flask(
    __name__,
    template_folder=os.path.join(PI_HOME, "pi_hub", "templates"),
)

CREDENTIALS_FILE = "/home/koushik/wifi-credentials.json"
PI_MODE_FILE = "/home/koushik/homesecurity/pi-mode"
JOIN_HELPER = "/home/koushik/pi-setup-lib.sh"

STATIC_IP = "192.168.0.236"
STATIC_PREFIX = "24"
STATIC_GATEWAY = "192.168.0.1"
STATIC_DNS = "192.168.0.1,8.8.8.8"
STATIC_CIDR = f"{STATIC_IP}/{STATIC_PREFIX}"


def pi_mode() -> str:
    try:
        with open(PI_MODE_FILE) as f:
            return f.read().strip() or "prod"
    except OSError:
        return "prod"


def wifi_configured() -> bool:
    if not os.path.isfile(CREDENTIALS_FILE):
        return False
    try:
        with open(CREDENTIALS_FILE) as f:
            data = json.load(f)
        return bool(data.get("configured") and data.get("ssid"))
    except (json.JSONDecodeError, OSError):
        return False


def schedule_join_home() -> None:
    """Leave SoftAP, join saved home WiFi, start hub, stop this setup service."""
    subprocess.Popen(
        [
            "bash",
            "-c",
            (
                "sleep 3; "
                f"source {JOIN_HELPER}; "
                "join_home_wifi; "
                "systemctl stop pi-setup.service"
            ),
        ]
    )


def maybe_join_home() -> None:
    """DEV waits for Drive token + wifi creds. PROD joins as soon as wifi creds exist."""
    if not wifi_configured():
        return
    if pi_mode() == "dev":
        try:
            from pi_hub import drive

            if not drive.has_token():
                return
        except Exception:
            return
    schedule_join_home()


def apply_static_ip(ssid: str) -> None:
    subprocess.run(
        [
            "nmcli", "connection", "modify", ssid,
            "ipv4.method", "manual",
            "ipv4.addresses", STATIC_CIDR,
            "ipv4.gateway", STATIC_GATEWAY,
            "ipv4.dns", STATIC_DNS,
            "ipv4.ignore-auto-dns", "yes",
        ],
        check=True,
    )


try:
    from pi_hub.dev_routes import register_dev_routes

    register_dev_routes(app, on_linked=maybe_join_home)
except Exception as e:
    print(f"WARNING: Drive portal not attached ({e})", file=sys.stderr)


@app.route("/status", methods=["GET"])
@app.route("/health", methods=["GET"])
def status():
    linked = False
    try:
        from pi_hub import drive

        linked = drive.has_token()
    except Exception:
        pass
    return jsonify(
        {
            "status": "ok",
            "mode": "setup",
            "pi_mode": pi_mode(),
            "device": "raspberry-pi-home-security",
            "static_ip": STATIC_IP,
            "wifi_configured": wifi_configured(),
            "drive_token": linked,
            "publishing": False,
            "streaming": False,
            "message": (
                "SoftAP setup API. Camera/live/clips start after the Pi joins home Wi‑Fi."
            ),
        }
    )


def _hub_only():
    return (
        jsonify(
            {
                "ok": False,
                "error": (
                    "Pi is in SoftAP setup mode (not hub). "
                    "Finish Wi‑Fi + Drive, wait for it to join home LAN, then retry."
                ),
                "mode": "setup",
            }
        ),
        503,
    )


@app.route("/start", methods=["POST"])
@app.route("/stop", methods=["POST"])
@app.route("/motion", methods=["POST"])
@app.route("/clips/cache", methods=["GET"])
@app.route("/detect/start", methods=["POST"])
@app.route("/detect/stop", methods=["POST"])
@app.route("/detect/status", methods=["GET"])
def hub_endpoints_while_setup():
    return _hub_only()


@app.route("/wifi", methods=["POST"])
def set_wifi():
    """
    Receive WiFi credentials from mobile app
    Expected JSON: {"ssid": "HomeNetwork", "password": "pass123"}
    """
    try:
        data = request.get_json()

        if not data or "ssid" not in data or "password" not in data:
            return jsonify({"error": "Missing ssid or password"}), 400

        ssid = data["ssid"]
        password = data["password"]

        # Save credentials (include static addressing for boot/install)
        credentials = {
            "ssid": ssid,
            "password": password,
            "configured": True,
            "static_ip": STATIC_IP,
            "gateway": STATIC_GATEWAY,
            "dns": STATIC_DNS,
        }

        with open(CREDENTIALS_FILE, "w") as f:
            json.dump(credentials, f, indent=2)

        # Configure NetworkManager with new credentials
        try:
            # Check if connection already exists
            result = subprocess.run(
                ["nmcli", "connection", "show", ssid],
                capture_output=True,
                text=True,
            )

            if result.returncode == 0:
                # Update existing connection
                subprocess.run(
                    [
                        "nmcli",
                        "connection",
                        "modify",
                        ssid,
                        "802-11-wireless-security.psk",
                        password,
                    ],
                    check=True,
                )
            else:
                # Create new connection
                subprocess.run(
                    [
                        "nmcli",
                        "device",
                        "wifi",
                        "connect",
                        ssid,
                        "password",
                        password,
                        "ifname",
                        "wlan0",
                    ],
                    check=True,
                )

            apply_static_ip(ssid)
            maybe_join_home()

            waiting = pi_mode() == "dev"
            try:
                from pi_hub import drive as _drive

                waiting = waiting and not _drive.has_token()
            except Exception:
                pass

            return jsonify(
                {
                    "success": True,
                    "message": (
                        "WiFi credentials saved. Waiting for Google Drive token, then joining home Wi‑Fi…"
                        if waiting
                        else "WiFi credentials saved, switching to home network…"
                    ),
                    "static_ip": STATIC_IP,
                    "waiting_for_drive": waiting,
                }
            )

        except subprocess.CalledProcessError as e:
            return jsonify(
                {"error": "Failed to configure WiFi", "details": str(e)}
            ), 500

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/scan", methods=["GET"])
def scan_networks():
    """List available WiFi networks"""
    try:
        result = subprocess.run(
            [
                "nmcli",
                "-t",
                "-f",
                "SSID,SIGNAL,SECURITY",
                "device",
                "wifi",
                "list",
            ],
            capture_output=True,
            text=True,
            check=True,
        )

        networks = []
        for line in result.stdout.strip().split("\n"):
            if line:
                parts = line.split(":")
                if len(parts) >= 3 and parts[0]:  # Skip empty SSIDs
                    networks.append(
                        {
                            "ssid": parts[0],
                            "signal": int(parts[1]) if parts[1] else 0,
                            "security": parts[2] if parts[2] else "open",
                        }
                    )

        # Remove duplicates, keep strongest signal
        unique = {}
        for net in networks:
            ssid = net["ssid"]
            if ssid not in unique or net["signal"] > unique[ssid]["signal"]:
                unique[ssid] = net

        return jsonify({"networks": list(unique.values())})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    # Must run as root to use nmcli
    if os.geteuid() != 0:
        print("ERROR: Must run as root (sudo)", file=sys.stderr)
        sys.exit(1)

    print("Pi Setup API starting on 0.0.0.0:4000...")
    print("Endpoints:")
    print("  GET  /status  /health - Setup health (mode: setup)")
    print("  GET  /scan    - List WiFi networks")
    print("  GET  /dev     - Drive sign-in portal")
    print("  POST /auth/drive - Phone Google token handoff")
    print(f"Home WiFi static IP: {STATIC_CIDR} gw {STATIC_GATEWAY}")
    print(f"pi_mode={pi_mode()}")

    app.run(host="0.0.0.0", port=4000, debug=False)
