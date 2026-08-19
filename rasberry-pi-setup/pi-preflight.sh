#!/bin/bash
# Shared preflight for install / deploy / choose-version.
# Prints a status bar, lists leftover-state problems, optionally fixes them.
#
# Usage:
#   source pi-preflight.sh
#   preflight_collect
#   preflight_print_bar
#   preflight_fail_if_blocking   # exit 1 unless FORCE=1
#   preflight_fix                 # stop leftover listeners, free :4000

PI_HOME="${PI_HOME:-/home/koushik}"
PI_REPO_DIR="${PI_REPO_DIR:-$PI_HOME/apps/Home-Security}"
HUB_READY="$PI_HOME/homesecurity/.hub-ready"
REPO_DIR_FILE="$PI_HOME/homesecurity/repo-dir"
CREDENTIALS_FILE="$PI_HOME/wifi-credentials.json"
STATIC_IP="192.168.0.236"

PRE_PROBLEMS=()
PRE_WARNS=()
PRE_OK=()

_pre_add() {
    local kind="$1"
    shift
    case "$kind" in
        problem) PRE_PROBLEMS+=("$*") ;;
        warn) PRE_WARNS+=("$*") ;;
        ok) PRE_OK+=("$*") ;;
    esac
}

_svc() { systemctl is-active --quiet "$1" 2>/dev/null && echo active || echo inactive; }

_port_pids() {
    ss -lptn "sport = :4000" 2>/dev/null | awk 'NR>1{print}' || true
}

_stale_py() {
    # Running python whose argv file is newer on disk than the process start.
    local pid file
    pid="$(pgrep -n -f 'python3 /home/koushik/pi-setup-api.py|python3 -m pi_hub' 2>/dev/null || true)"
    [ -n "$pid" ] || return 1
    file="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
    local start disk=0
    start="$(stat -c %Y "/proc/$pid" 2>/dev/null || echo 0)"
    if [[ "$file" == *pi-setup-api.py* ]] && [ -f "$PI_HOME/pi-setup-api.py" ]; then
        disk="$(stat -c %Y "$PI_HOME/pi-setup-api.py")"
    elif [[ "$file" == *pi_hub* ]] && [ -d "$PI_HOME/pi_hub" ]; then
        disk="$(find "$PI_HOME/pi_hub" -name '*.py' -printf '%T@\n' 2>/dev/null | sort -n | tail -1 | cut -d. -f1)"
        disk="${disk:-0}"
    fi
    if [ "$disk" -gt "$start" ]; then
        echo "$pid"
        return 0
    fi
    return 1
}

preflight_collect() {
    PRE_PROBLEMS=()
    PRE_WARNS=()
    PRE_OK=()

    if [ -f "$REPO_DIR_FILE" ]; then
        PI_REPO_DIR="$(tr -d '[:space:]' < "$REPO_DIR_FILE")"
    fi

    PRE_BRANCH="?"
    PRE_HEAD="?"
    if [ -d "$PI_REPO_DIR/.git" ]; then
        PRE_BRANCH="$(git -C "$PI_REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")"
        PRE_HEAD="$(git -C "$PI_REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo "?")"
        _pre_add ok "git $PI_REPO_DIR  $PRE_BRANCH@$PRE_HEAD"
        if [ -n "$(git -C "$PI_REPO_DIR" status --porcelain 2>/dev/null)" ]; then
            _pre_add warn "git working tree dirty in $PI_REPO_DIR"
        fi
        if [ "$PRE_BRANCH" = "HEAD" ]; then
            _pre_add warn "detached HEAD in $PI_REPO_DIR — choose-version.sh to pin a branch"
        fi
    else
        _pre_add problem "no git clone at $PI_REPO_DIR"
    fi

    if [ -d "$PI_HOME/Home-Security/.git" ] && [ "$PI_REPO_DIR" != "$PI_HOME/Home-Security" ]; then
        _pre_add warn "extra clone $PI_HOME/Home-Security is ignored (canonical is $PI_REPO_DIR)"
    fi

    PRE_SETUP="$(_svc pi-setup.service)"
    PRE_HUB="$(_svc pi-hub.service)"
    PRE_MTX="$(_svc mediamtx.service)"

    if [ "$PRE_SETUP" = "active" ] && [ "$PRE_HUB" = "active" ]; then
        _pre_add problem "BOTH pi-setup and pi-hub are active — they fight over :4000"
    else
        _pre_add ok "pi-setup=$PRE_SETUP  pi-hub=$PRE_HUB  mediamtx=$PRE_MTX"
    fi

    PRE_WLAN="$(ip -4 -br addr show wlan0 2>/dev/null | awk '{print $3}' || echo none)"
    PRE_SSID="$(nmcli -t -f NAME,DEVICE connection show --active 2>/dev/null | awk -F: '$2=="wlan0"{print $1; exit}')"
    PRE_SSID="${PRE_SSID:-none}"

    if [ -f "$HUB_READY" ]; then
        PRE_MODE="hub-ready"
        _pre_add ok "hub-ready present"
    else
        PRE_MODE="setup"
        _pre_add ok "hub-ready absent (setup / SoftAP path)"
    fi

    if [ "$PRE_SSID" = "HomeSecurity-Setup" ]; then
        _pre_add ok "SoftAP SSID active"
    elif [ "$PRE_SSID" != "none" ]; then
        local cred=""
        if [ -f "$CREDENTIALS_FILE" ]; then
            cred="$(jq -r '.ssid // empty' "$CREDENTIALS_FILE" 2>/dev/null || true)"
        fi
        if [ -n "$cred" ] && [ "$cred" != "$PRE_SSID" ]; then
            _pre_add problem "wifi-credentials.json SSID='$cred' but active connection is '$PRE_SSID'"
        fi
        if ! nmcli -t -f NAME connection show 2>/dev/null | grep -Fxq "$PRE_SSID"; then
            _pre_add problem "active SSID '$PRE_SSID' has no NetworkManager profile (boot will SoftAP-fallback)"
        fi
    fi

    local listeners
    listeners="$(_port_pids)"
    PRE_LISTEN="$listeners"
    if echo "$listeners" | grep -q .; then
        _pre_add ok ":4000 in use"
        if [ "$PRE_SETUP" = "active" ] && [ "$PRE_HUB" = "active" ]; then
            :
        fi
        local stray
        stray="$(pgrep -af 'python3 .*(pi-setup-api|pi_hub)' 2>/dev/null | grep -v systemd || true)"
        local n
        n="$(pgrep -c -f 'python3 /home/koushik/pi-setup-api.py|python3 -m pi_hub' 2>/dev/null || echo 0)"
        if [ "${n:-0}" -gt 1 ]; then
            _pre_add problem "multiple Flask/python listeners ($n) — leftover from a previous run"
        fi
    else
        _pre_add warn ":4000 is free (no API running yet)"
    fi

    local stale
    if stale="$(_stale_py)"; then
        _pre_add problem "stale python pid=$stale still serving old code (file on disk is newer). Restart the matching service after install — do not only copy files."
    fi

    if [ -d /tmp/rasberry-pi-setup ] && [ "${PWD:-}" != "/tmp/rasberry-pi-setup" ]; then
        _pre_add warn "leftover /tmp/rasberry-pi-setup from an old laptop deploy"
    fi

    if [ -d "$PI_HOME/pi_hub/__pycache__" ]; then
        _pre_add warn "stale $PI_HOME/pi_hub/__pycache__ (will be cleared on install)"
    fi
}

preflight_print_bar() {
    local red=$'\033[1;31m' yel=$'\033[1;33m' grn=$'\033[1;32m' cyn=$'\033[1;36m' rst=$'\033[0m' dim=$'\033[2m'
    local nprob="${#PRE_PROBLEMS[@]}" nwarn="${#PRE_WARNS[@]}"
    local color="$grn"
    [ "$nwarn" -gt 0 ] && color="$yel"
    [ "$nprob" -gt 0 ] && color="$red"

    echo ""
    echo "${color}╔══════════════════════════════════════════════════════════════════════════════╗${rst}"
    echo "${color}║ PREFLIGHT${rst}  repo=${dim}${PI_REPO_DIR}${rst}"
    echo "${color}║${rst}  branch=${cyn}${PRE_BRANCH:-?}${rst}  HEAD=${cyn}${PRE_HEAD:-?}${rst}  mode=${cyn}${PRE_MODE:-?}${rst}"
    echo "${color}║${rst}  wlan=${cyn}${PRE_SSID:-?} ${PRE_WLAN:-}${rst}"
    echo "${color}║${rst}  services: setup=${cyn}${PRE_SETUP}${rst}  hub=${cyn}${PRE_HUB}${rst}  mediamtx=${cyn}${PRE_MTX}${rst}"
    if [ -n "${PRE_LISTEN:-}" ]; then
        echo "${color}║${rst}  :4000 ${dim}$(echo "$PRE_LISTEN" | tr '\n' ' ' | cut -c1-60)${rst}"
    fi
    echo "${color}║${rst}  problems=${red}${nprob}${rst}  warnings=${yel}${nwarn}${rst}"
    local p
    for p in "${PRE_PROBLEMS[@]}"; do
        echo "${red}║  ✖ ${p}${rst}"
    done
    for p in "${PRE_WARNS[@]}"; do
        echo "${yel}║  ! ${p}${rst}"
    done
    if [ "$nprob" -eq 0 ] && [ "$nwarn" -eq 0 ]; then
        echo "${grn}║  ✓ no leftover-state issues${rst}"
    fi
    echo "${color}╚══════════════════════════════════════════════════════════════════════════════╝${rst}"
    echo ""
}

preflight_fail_if_blocking() {
    if [ "${#PRE_PROBLEMS[@]}" -eq 0 ]; then
        return 0
    fi
    if [ "${FORCE:-0}" = "1" ]; then
        echo "FORCE=1 — continuing despite problems"
        return 0
    fi
    echo "Refusing to continue. Fix the ✖ items, or re-run with FORCE=1"
    echo "  Typical fix: sudo systemctl stop pi-setup.service pi-hub.service"
    echo "               sudo fuser -k 4000/tcp || true"
    return 1
}

preflight_fix() {
    echo "=== Clearing leftover listeners (will not run SoftAP wipe) ==="
    systemctl stop pi-setup.service 2>/dev/null || true
    systemctl stop pi-hub.service 2>/dev/null || true
    sleep 1
    fuser -k 4000/tcp 2>/dev/null || true
    pkill -f 'python3 /home/koushik/pi-setup-api.py' 2>/dev/null || true
    pkill -f 'python3 -m pi_hub' 2>/dev/null || true
    sleep 1
    rm -rf "$PI_HOME/pi_hub/__pycache__" "$PI_HOME/pi_hub/"*/__pycache__ 2>/dev/null || true
    if ss -lptn "sport = :4000" 2>/dev/null | awk 'NR>1{found=1} END{exit !found}'; then
        echo "WARNING: :4000 still in use after cleanup"
        ss -lptn "sport = :4000" || true
        return 1
    fi
    echo "Port :4000 is free"
}

preflight_start_right_service() {
    # After files are copied: start hub if ready, else leave services down
    # (starting pi-setup runs boot.sh which DEV-wipes Wi‑Fi).
    if [ -f "$HUB_READY" ] && [ "${PRE_SSID:-}" != "HomeSecurity-Setup" ] && [ "${PRE_SSID:-none}" != "none" ]; then
        echo "Starting pi-hub (hub-ready + home Wi‑Fi)…"
        systemctl start pi-hub.service
        sleep 2
        systemctl is-active pi-hub.service
        return 0
    fi
    echo "Not starting pi-setup (that would re-run boot / possible SoftAP wipe)."
    echo "  Hub:   sudo touch $HUB_READY && sudo systemctl start pi-hub"
    echo "  Setup: sudo systemctl start pi-setup     # SoftAP / DEV wipe possible"
}
