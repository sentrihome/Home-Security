#!/bin/bash
# Interactive branch picker for the Pi.
# Fetches origin, lists recent branches, checks one out, reinstalls from that tree.
#
# Run on the Pi:
#   ./choose-version.sh
#   /home/koushik/choose-version.sh
#   /home/koushik/apps/Home-Security/rasberry-pi-setup/choose-version.sh

set -euo pipefail

PI_HOME="/home/koushik"
if [ -f "$PI_HOME/homesecurity/repo-dir" ]; then
    REPO_DIR="$(tr -d '[:space:]' < "$PI_HOME/homesecurity/repo-dir")"
fi
REPO_DIR="${REPO_DIR:-$PI_HOME/apps/Home-Security}"
SETUP_DIR="$REPO_DIR/rasberry-pi-setup"
MAX_BRANCHES="${MAX_BRANCHES:-15}"

red=$'\033[1;31m'
grn=$'\033[1;32m'
cyn=$'\033[1;36m'
yel=$'\033[1;33m'
dim=$'\033[2m'
rst=$'\033[0m'

if [ ! -d "$REPO_DIR/.git" ]; then
    echo "${red}No git clone at $REPO_DIR${rst}"
    exit 1
fi

cd "$REPO_DIR"
GIT_USER="koushik"
if [ "$(id -u)" -eq 0 ]; then
    git_as() { sudo -u "$GIT_USER" git "$@"; }
else
    git_as() { git "$@"; }
fi

echo "${cyn}Fetching origin…${rst}"
git_as fetch --prune origin

mapfile -t LINES < <(
    git_as for-each-ref --sort=-committerdate refs/remotes/origin \
        --format='%(refname:short)|%(committerdate:relative)|%(objectname:short)|%(subject)' \
        | grep -vE 'origin/HEAD$' \
        | head -n "$MAX_BRANCHES" || true
)

if [ "${#LINES[@]}" -eq 0 ]; then
    echo "${red}No remote branches found after fetch.${rst}"
    exit 1
fi

CURRENT="$(git_as rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"
HEAD_SHORT="$(git_as rev-parse --short HEAD)"

echo ""
echo "${cyn}╔══════════════════════════════════════════════════════════════════════════════╗${rst}"
echo "${cyn}║ CHOOSE VERSION${rst}  $REPO_DIR"
echo "${cyn}║${rst}  now: ${grn}${CURRENT}${rst} @ ${HEAD_SHORT}"
echo "${cyn}╚══════════════════════════════════════════════════════════════════════════════╝${rst}"
echo ""

BRANCHES=()
i=1
for line in "${LINES[@]}"; do
    ref="${line%%|*}"
    rest="${line#*|}"
    rel="${rest%%|*}"
    rest2="${rest#*|}"
    sha="${rest2%%|*}"
    sub="${rest2#*|}"
    name="${ref#origin/}"
    BRANCHES+=("$name")
    mark=" "
    [ "$name" = "$CURRENT" ] && mark="*"
    printf "  ${yel}%2d${rst} %s %-28s  ${dim}%s${rst}  %s  %s\n" "$i" "$mark" "$name" "$sha" "$rel" "${sub:0:40}"
    i=$((i + 1))
done
echo ""

CHOICE=""
if command -v whiptail >/dev/null 2>&1 && [ -t 0 ]; then
    MENU_ARGS=()
    n=1
    for line in "${LINES[@]}"; do
        ref="${line%%|*}"
        rest="${line#*|}"
        rel="${rest%%|*}"
        name="${ref#origin/}"
        MENU_ARGS+=("$n" "$name  ($rel)")
        n=$((n + 1))
    done
    CHOICE="$(whiptail --title "Pi git branch" --menu "Select a branch to check out and install" 22 78 12 "${MENU_ARGS[@]}" 3>&1 1>&2 2>&3)" || true
fi

if [ -z "$CHOICE" ]; then
    read -r -p "Number (or branch name), empty to cancel: " CHOICE
fi
[ -n "$CHOICE" ] || { echo "Cancelled."; exit 0; }

if [[ "$CHOICE" =~ ^[0-9]+$ ]]; then
    idx=$((CHOICE - 1))
    if [ "$idx" -lt 0 ] || [ "$idx" -ge "${#BRANCHES[@]}" ]; then
        echo "${red}Invalid number${rst}"
        exit 1
    fi
    BRANCH="${BRANCHES[$idx]}"
else
    BRANCH="${CHOICE#origin/}"
fi

echo ""
echo "Check out ${cyn}origin/${BRANCH}${rst} in $REPO_DIR and reinstall copies to $PI_HOME ?"
read -r -p "Type yes: " CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "Cancelled."; exit 0; }

echo "${cyn}Checking out origin/${BRANCH}…${rst}"
if [ -n "$(git_as status --porcelain)" ] && [ "${FORCE:-0}" != "1" ]; then
    echo "${red}Working tree dirty in $REPO_DIR — commit/stash, or FORCE=1 $0${rst}"
    git_as status --short
    exit 1
fi
git_as checkout -B "$BRANCH" "origin/$BRANCH"
git_as pull --ff-only origin "$BRANCH" || true
echo "HEAD=$(git_as log -1 --oneline)"

if [ ! -f "$SETUP_DIR/install-pi-setup.sh" ]; then
    echo "${red}Missing $SETUP_DIR/install-pi-setup.sh on this branch${rst}"
    exit 1
fi

echo "${cyn}Installing from this branch (SKIP_APT=1)…${rst}"
if [ "$(id -u)" -eq 0 ]; then
    SKIP_APT=1 "$SETUP_DIR/install-pi-setup.sh"
else
    sudo SKIP_APT=1 "$SETUP_DIR/install-pi-setup.sh"
fi

echo ""
echo "${grn}Done.${rst} Active branch: $(git_as rev-parse --abbrev-ref HEAD) @ $(git_as rev-parse --short HEAD)"
echo "Health: curl -s http://127.0.0.1:4000/health | head"
