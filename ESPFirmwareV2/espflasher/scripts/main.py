from fastapi import FastAPI
import requests
import os
from dotenv import load_dotenv
from fastapi.responses import StreamingResponse
import time
import asyncio
import json

load_dotenv()

app = FastAPI()

@app.get("/health")
def health_response():
    return {
        "health" : "ok"
    }

tag = None

@app.get("/versionmanifest")
def versionmanifest_response_function():
    global tag
    user = os.environ.get("GITUSER", "")
    repo = os.environ.get("REPO", "")
    target = os.environ.get("TARGET_FILE", "")
    token = os.environ.get("GITOKEN", "")
    url = f"https://api.github.com/repos/{user}/{repo}/contents/{target}"
    print(url)
    headers = {
        "Authorization" : f"Bearer {token}",
        "Accept": "application/vnd.github.raw+json"
    }
    print(headers)
    response = requests.get(url=url, headers=headers)
    tag = response.json()["version"]
    return response.json()


@app.get("/download")
def download_response_function():
    def process():
        got_download_url = False
        while not got_download_url:
            if not got_download_url:
                yield f"{json.dumps({"got_download_url" : "false", "download_url" : "Check for updates"})}\n"
            user = os.environ.get("GITUSER", "")
            repo = os.environ.get("REPO", "")
            target = os.environ.get("TARGET_FILE", "")
            token = os.environ.get("GITOKEN", "")
            url = f"https://api.github.com/repos/{user}/{repo}/releases/tags/{tag}"
            print(url)
            headers = {
                    "Authorization" : f"Bearer {token}"
                }
            print(headers)
            response = requests.get(url=url, headers=headers)
            if tag == None:
                continue
            download_url = response.json()["assets"][0]["url"]
            yield f"{json.dumps({"got_download_url" : "true", "download_url" : download_url})}\n"
            got_download_url = True
            time.sleep(1)
    return StreamingResponse(process(), media_type="text/event-stream")
