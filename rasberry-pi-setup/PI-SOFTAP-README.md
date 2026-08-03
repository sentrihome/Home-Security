# Pi SoftAP + Product Hub

Automatic WiFi setup (SoftAP) and the local-first product hub for the Raspberry Pi.

**Architecture decision (README D20):** SoftAP stays Python; live HLS + clips + Drive run as **one** `pi_hub` process after home Wi‑Fi. Do not revive the old Node `rasberry_pi_app` / cloud backend as the product path. Full product story: repo root [`README.md`](../README.md) §13.

## How It Works

1. **Unconfigured Pi boots** → SoftAP `HomeSecurity-Setup` + setup API on `10.42.0.1:4000`
2. **Phone joins hotspot** → app discovers Pi at `10.42.0.1`
3. **App sends credentials** → `POST /wifi` with home WiFi SSID/password
4. **Pi switches to home WiFi** → static IP `192.168.0.236`
5. **Future boots** → join home WiFi → start **`pi_hub`** on `:4000` (not the SoftAP API)

```
Boot → pi-setup.service → pi-setup-boot.sh
         │
         ├─ no / bad Wi‑Fi  → SoftAP + pi-setup-api.py :4000
         │                     (GET /status, /scan, POST /wifi)
         │                     hub stopped; .hub-ready removed
         │
         └─ Wi‑Fi OK        → touch ~/homesecurity/.hub-ready
                              → systemctl start pi-hub
                              → one Flask app :4000 (live + clips + Drive)
```

SoftAP and hub **never** both bind `:4000`. Live and clips share one process so they do not fight over `/dev/video0`.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Pi Boot Sequence                      │
├─────────────────────────────────────────────────────────┤
│  1. systemd starts pi-setup.service                      │
│  2. pi-setup-boot.sh checks wifi-credentials.json        │
│                                                           │
│  IF configured → connect to home WiFi ────────────────┐  │
│  IF NOT → start SoftAP + setup API                    │  │
│                                                        │  │
│  ┌──────────────────────────────────┐                │  │
│  │  SoftAP Mode (First Boot)        │                │  │
│  ├──────────────────────────────────┤                │  │
│  │  • SSID: HomeSecurity-Setup      │                │  │
│  │  • Password: setup1234           │                │  │
│  │  • Pi IP: 10.42.0.1              │                │  │
│  │  • API: :4000 (setup only)       │                │  │
│  └──────────────────────────────────┘                │  │
│                                                        │  │
│  ┌──────────────────────────────────┐                │  │
│  │  Hub Mode (After Setup)          │◄───────────────┘  │
│  ├──────────────────────────────────┤                   │
│  │  • Home WiFi @ 192.168.0.236     │                   │
│  │  • pi_hub on :4000               │                   │
│  │  • live / clips / Drive modules  │                   │
│  └──────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

## Repo layout

```
rasberry-pi-setup/
├── pi-setup-boot.sh          # ONLY entry: SoftAP vs start hub
├── pi-setup-api.py           # SoftAP-only HTTP
├── pi_hub/                   # runs ONLY after home Wi‑Fi
│   ├── app.py                # one Flask process :4000
│   ├── live.py               # ffmpeg HLS start/stop
│   ├── clips.py              # record to local cache
│   ├── drive.py              # token store + Drive upload
│   └── config.py
├── systemd/
│   ├── pi-setup.service      # always on boot (network gate)
│   └── pi-hub.service        # started by boot after Wi‑Fi
├── install-pi-setup.sh       # run on the Pi
├── deploy-to-pi.sh           # copy + install from your laptop
└── requirements.txt
```

On the Pi after install: scripts and `pi_hub/` live under `/home/koushik/`; data under `/home/koushik/homesecurity/`.

## SoftAP API (setup mode only)

### `GET /status`
```json
{
  "status": "ready",
  "mode": "setup",
  "device": "raspberry-pi-home-security"
}
```

### `GET /scan`
Lists nearby WiFi networks (`ssid`, `signal`, `security`).

### `POST /wifi`
```json
{ "ssid": "HomeNetwork", "password": "mypassword" }
```

## Hub API (after home Wi‑Fi)

| Method | Path | Module | Notes |
|--------|------|--------|--------|
| GET | `/health` | hub | `mode: "hub"` |
| POST | `/start` `/stop` | `live` | On-demand HLS (ffmpeg stub until camera wired) |
| POST | `/motion` | `clips` → `drive` | Cache clip, then upload |
| POST | `/auth/drive` | `drive` | `{ "refresh_token", "email" }` from app |
| GET | `/hls/<file>` | hub | Playlist/segments |
| GET | `/clips/cache` | clips | Debug local cache (app lists Drive, not this) |

## Deploying changes to the Pi

### CI deploy (GitHub Actions → pull on Pi)

On every push that touches `rasberry-pi-setup/**` (or the workflow file), [`.github/workflows/pi-deploy.yml`](../.github/workflows/pi-deploy.yml):

1. Optionally joins your **Tailscale** tailnet (`TS_AUTHKEY`)
2. **SSH** to the Pi
3. `git fetch` + checkout that commit in the on-Pi clone
4. Runs `scripts/ci-pull-deploy.sh` → `install-pi-setup.sh` (`SKIP_APT=1`) → restart `pi-hub`
5. `curl http://127.0.0.1:4000/health` must show `mode: hub` when `.hub-ready` exists

Manual re-run: Actions → **Pi pull & deploy** → Run workflow.

#### One-time Pi bootstrap

```bash
# 1) Clone (once) — path must match PI_REPO_DIR secret (default below)
git clone git@github.com:<org>/Home-Security.git /home/koushik/Home-Security
# or HTTPS with a deploy key / credential helper

# 2) First install
cd /home/koushik/Home-Security/rasberry-pi-setup
sudo ./install-pi-setup.sh

# 3) SSH key for GitHub Actions (on your laptop)
ssh-keygen -t ed25519 -f ./pi-deploy-key -N "" -C "github-actions-pi-deploy"
ssh-copy-id -i ./pi-deploy-key.pub koushik@192.168.0.236
# Add pi-deploy-key (PRIVATE) as repo secret PI_SSH_KEY — never commit it

# 4) Passwordless sudo for install/restart (on Pi)
sudo visudo -f /etc/sudoers.d/homesecurity-ci
# add:
# koushik ALL=(root) NOPASSWD: /home/koushik/Home-Security/rasberry-pi-setup/install-pi-setup.sh, /bin/systemctl restart pi-hub.service, /bin/systemctl start pi-hub.service, /bin/systemctl daemon-reload, /bin/systemctl enable pi-setup.service, /usr/bin/cp, /usr/bin/rm, /bin/mkdir, /usr/bin/chmod, /usr/bin/chown, /usr/bin/touch, /usr/bin/nmcli, /bin/systemctl

# Simpler (dev only):  koushik ALL=(ALL) NOPASSWD: ALL

# 5) Tailscale on Pi (same account as TS_AUTHKEY)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

#### GitHub repo secrets

| Secret | Required | Example |
|--------|----------|---------|
| `PI_SSH_HOST` | yes | MagicDNS name or `100.x` of the Pi |
| `PI_SSH_USER` | yes | `koushik` |
| `PI_SSH_KEY` | yes | full private key PEM |
| `TS_AUTHKEY` | recommended | reusable auth key so Actions can reach the Pi |
| `PI_REPO_DIR` | no | `/home/koushik/Home-Security` |

Create a Tailscale auth key under Admin → Settings → Keys (reusable, tag e.g. `tag:ci`). Prefer OAuth client later if you tighten ACLs.

The Pi clone must be able to `git fetch` (deploy key with read access, or HTTPS token).

### Full deploy from laptop (LAN)

```bash
cd rasberry-pi-setup
./deploy-to-pi.sh
```

Optional env overrides:

```bash
PI_IP=192.168.0.236 PI_USER=koushik ./deploy-to-pi.sh
```

`deploy-to-pi.sh` scp’s files and runs `install-pi-setup.sh` (does not use git pull).

Then reboot so SoftAP → hub handoff runs cleanly:

```bash
ssh koushik@192.168.0.236 'sudo reboot'
curl http://192.168.0.236:4000/health   # after Wi‑Fi: expect "mode":"hub"
```

### First-time install (on the Pi itself)

```bash
cd /path/to/Home-Security/rasberry-pi-setup
chmod +x install-pi-setup.sh
sudo ./install-pi-setup.sh
sudo reboot
```

### Hub-only iterate (already provisioned, no CI)

When you only changed Python under `pi_hub/`:

```bash
scp -r pi_hub koushik@192.168.0.236:/home/koushik/
ssh koushik@192.168.0.236 \
  'sudo touch /home/koushik/homesecurity/.hub-ready && sudo systemctl restart pi-hub'
curl http://192.168.0.236:4000/health
```

### What install puts where

| Source (repo) | On Pi |
|---------------|--------|
| `pi-setup-api.py`, `pi-setup-boot.sh` | `/home/koushik/` |
| `pi_hub/` | `/home/koushik/pi_hub/` |
| `systemd/pi-setup.service` | `/etc/systemd/system/` (enabled) |
| `systemd/pi-hub.service` | `/etc/systemd/system/` (started by boot after Wi‑Fi) |
| runtime data | `/home/koushik/homesecurity/` (hls, clips, Drive token) |
| WiFi config | `/home/koushik/wifi-credentials.json` |

`pi-hub` is **not** `WantedBy=multi-user` — SoftAP boot owns the gate and starts the hub only after home Wi‑Fi succeeds (avoids `:4000` races).

## Troubleshooting

### Status / logs
```bash
systemctl status pi-setup.service
systemctl status pi-hub.service
tail -f /var/log/pi-setup.log
journalctl -u pi-hub -f
```

### Reset to SoftAP mode
```bash
sudo rm /home/koushik/wifi-credentials.json
sudo rm -f /home/koushik/homesecurity/.hub-ready
sudo systemctl stop pi-hub
sudo systemctl restart pi-setup.service
```

### Manual SoftAP control
```bash
sudo nmcli connection up HomeSecurity-Setup
sudo nmcli connection down HomeSecurity-Setup
sudo nmcli connection up "<your-home-ssid>"
```

### DHCP (dnsmasq)
```bash
systemctl is-active dnsmasq  # should be: inactive
sudo ss -ulnp | grep :67     # empty when not in hotspot
```

## Mobile App Integration

See `mobile/app/(tabs)/setup.tsx`.

1. Join `HomeSecurity-Setup`
2. Hit `http://10.42.0.1:4000`
3. `GET /scan` → user picks network + password
4. `POST /wifi`
5. Phone rejoins home WiFi
6. Verify `http://192.168.0.236:4000/health` (`mode: hub`)

## Network Summary

| Mode | Interface | IP | SSID | Purpose |
|------|-----------|-------|------|---------|
| **Setup** | wlan0 AP | 10.42.0.1 | HomeSecurity-Setup | First-time config |
| **Hub** | wlan0 STA | 192.168.0.236 | (home WiFi) | Live, clips, Drive, health |

Home mode uses NetworkManager **manual** IPv4 `192.168.0.236/24` (gateway `192.168.0.1`).

## Security Notes

- SoftAP password is hardcoded (`setup1234`) — change in `pi-setup-boot.sh`
- APIs are HTTP-only — OK on SoftAP / LAN; Tailscale for remote live
- WiFi creds plaintext in `wifi-credentials.json` — restrict perms
- Drive token: encrypt at rest before shipping (stub today — README §18)
- Setup/hub run as root via systemd (nmcli + camera)

## Next Steps

1. ✓ SoftAP + boot gate + hub handoff
2. ✓ `pi_hub` barebones routes matching the mobile `piApi` stubs
3. ⏭ Real ffmpeg HLS in `pi_hub.live`
4. ⏭ Real clip record + Drive upload
5. ⏭ Encrypt Drive token at rest
6. ⏭ Tailscale install docs / MagicDNS (§13 test 13.4)
7. ⏭ mDNS optional alternative to static `.236`
