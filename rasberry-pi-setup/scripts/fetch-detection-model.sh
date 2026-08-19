#!/bin/bash
# Fetch MobileNet-SSD weights for pi_hub object detection.
#
# Weights are not vendored — 23MB of binary does not belong in git. Each file
# is pulled from a mirror list and verified by sha256 before being installed,
# so a truncated download or a changed mirror fails loudly instead of handing
# OpenCV a corrupt model.
#
# Usage: ./fetch-detection-model.sh [target_dir]
#   default target: /home/koushik/homesecurity/models

set -euo pipefail

TARGET_DIR="${1:-${MODEL_DIR:-/home/koushik/homesecurity/models}}"

PROTOTXT_NAME="MobileNetSSD_deploy.prototxt"
CAFFEMODEL_NAME="MobileNetSSD_deploy.caffemodel"

PROTOTXT_SHA256="e781559c4f5beaec2a486ccd952af5b6fa408e9498761bf5f4fb80b4e9f0d25e"
CAFFEMODEL_SHA256="761c86fbae3d8361dd454f7c740a964f62975ed32f4324b8b85994edec30f6af"

PROTOTXT_URLS=(
    "https://raw.githubusercontent.com/djmv/MobilNet_SSD_opencv/master/${PROTOTXT_NAME}"
)
CAFFEMODEL_URLS=(
    "https://github.com/djmv/MobilNet_SSD_opencv/raw/master/${CAFFEMODEL_NAME}"
    "https://github.com/PINTO0309/MobileNet-SSD-RealSense/raw/master/caffemodel/MobileNetSSD/${CAFFEMODEL_NAME}"
)

sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

# fetch <dest> <expected_sha256> <url>...
fetch() {
    local dest="$1"; shift
    local expected="$1"; shift
    local name
    name="$(basename "$dest")"

    if [ -f "$dest" ] && [ "$(sha256_of "$dest")" = "$expected" ]; then
        echo "  ✓ $name already present and verified"
        return 0
    fi

    local tmp
    tmp="$(mktemp "${dest}.XXXXXX")"
    # shellcheck disable=SC2064
    trap "rm -f '$tmp'" RETURN

    for url in "$@"; do
        echo "  → $name from $url"
        if curl -fsSL --retry 3 --retry-delay 2 --max-time 600 -o "$tmp" "$url"; then
            local actual
            actual="$(sha256_of "$tmp")"
            if [ "$actual" = "$expected" ]; then
                mv "$tmp" "$dest"
                echo "  ✓ $name verified ($(sha256_of "$dest" | cut -c1-12)…)"
                return 0
            fi
            echo "    checksum mismatch — expected ${expected:0:12}… got ${actual:0:12}…"
        else
            echo "    download failed"
        fi
    done

    echo "  ✗ could not obtain a verified $name" >&2
    return 1
}

echo "=== Fetching detection model into $TARGET_DIR ==="
mkdir -p "$TARGET_DIR"

fetch "$TARGET_DIR/$PROTOTXT_NAME" "$PROTOTXT_SHA256" "${PROTOTXT_URLS[@]}"
fetch "$TARGET_DIR/$CAFFEMODEL_NAME" "$CAFFEMODEL_SHA256" "${CAFFEMODEL_URLS[@]}"

if id koushik >/dev/null 2>&1; then
    chown -R koushik:koushik "$TARGET_DIR" 2>/dev/null || true
fi

echo ""
echo "✓ Detection model ready."
echo "  Restart the hub to pick it up:  sudo systemctl restart pi-hub"
echo "  Then check:                     curl http://localhost:4000/detect/status"
