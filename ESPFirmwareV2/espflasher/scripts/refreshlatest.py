import requests
import json
import os

GITAPI = os.environ.get("GITHUB_PAT", "")
USER = "sinisterchiller"
REPO = "buildreleasetest"
TARGET_FILE = "payload.json"

URL = f"https://api.github.com/repos/{USER}/{REPO}/contents/{TARGET_FILE}"


headers = {
    "Authorization" : f"Bearer {GITAPI}",
    "Accept" : "application/vnd.github.raw+json"
}

results = requests.get(URL, headers=headers)
results.raise_for_status()
resultsjson = results.json()
VERSION_TAG = resultsjson["version"]

if __name__ == "__main__":
    print(results.text)