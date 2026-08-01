import requests
import json
import os
import time
import sys
import shutil
import hashlib
import refreshlatest

STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".download_state.json")

def save_state(state):
    """Atomic write: write to temp then rename (prevents torn reads)."""
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f)
    os.replace(tmp, STATE_FILE)


# Ensure clean download directory
if os.path.exists("downloads"):
    shutil.rmtree("downloads")
save_state({"phase": "running", "message": "cleaning downloads folder"})
os.mkdir("downloads")


query_URL = f"https://api.github.com/repos/{refreshlatest.USER}/{refreshlatest.REPO}/releases/tags/{refreshlatest.VERSION_TAG}"

query_headers = {
    "Authorization" : f"Bearer {refreshlatest.GITAPI}",
    "Accept" : "application/vnd.github.raw+json"
}

save_state({"phase": "running", "message": "fetching release manifest"})
results = requests.get(query_URL, headers=query_headers)
results.raise_for_status()
parsing = results.json()

download_url = parsing["assets"][0]["url"]

download_headers = {
    "Authorization" : f"Bearer {refreshlatest.GITAPI}",
    "Accept" : "application/octet-stream"
}

save_state({"phase": "running", "message": f"downloading {parsing['assets'][0]['name']}"})

# Follow redirect to get actual download URL
resp = requests.get(download_url, headers=download_headers, allow_redirects=False, stream=True)
if resp.status_code in (301, 302):
    actual_url = resp.headers["Location"]
    resp.close()
    resp = requests.get(actual_url, headers=download_headers, stream=True)
resp.raise_for_status()

total_size = int(resp.headers.get("content-length", 0))
output_path = os.path.join("downloads", parsing["assets"][0]["name"])

if total_size > 0:
    downloaded = 0
    start_time = time.time()
    with open(output_path, "wb") as f:
        for i, chunk in enumerate(resp.iter_content(chunk_size=8192)):
            f.write(chunk)
            f.flush()
            downloaded += len(chunk)
            pct = round((downloaded / total_size) * 100, 1)
            elapsed = time.time() - start_time
            speed = downloaded / elapsed / (1024 * 1024) if elapsed > 0 else 0
            # Write state every chunk (not every iteration — reduces disk I/O noise)
            save_state({"phase": "running", "pct": pct, "speedMbs": round(speed, 1), "message": f"downloading {round(downloaded / (1024*1024), 1)}MB / {round(total_size / (1024*1024), 1)}MB"})
else:
    with open(output_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
            f.flush()

save_state({"phase": "complete", "pct": 100, "message": "downloaded"})
