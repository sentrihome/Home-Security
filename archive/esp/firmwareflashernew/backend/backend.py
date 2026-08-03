from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import subprocess
import os
import shutil
import requests
import re
import zipfile

api = FastAPI()

api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev only
    allow_methods=["*"],
    allow_headers=["*"],
)

@api.get("/health")
def health():
    return {"health": "ok"}

class reqs(BaseModel):
    device: str
    action: str
    options: str

def strip_ansi(text: str) -> str:
    # Removes ANSI escape sequences (colors, cursor movement, etc.)
    return re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', text)

def wroomdownloadprogress():
            response = requests.get("https://github.com/sinisterchiller/buildreleasetest/releases/download/test/wroombuild.zip", stream=True)
            total_size = int(response.headers.get("content-length", 0))
            downloaded = 0

            with open("wroom/build.zip", "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)

                        if total_size:
                            percent = downloaded * 100 / total_size
                            yield f"\r{percent:.2f}"
            yield '\n{"status": "allgood"}'

def s3downloadprogress():
            response = requests.get("https://github.com/sinisterchiller/buildreleasetest/releases/download/test/s3build.zip", stream=True)
            total_size = int(response.headers.get("content-length", 0))
            downloaded = 0

            with open("s3/build.zip", "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)

                        if total_size:
                            percent = downloaded * 100 / total_size
                            yield f"\r{percent:.2f}"
            yield '\n{"status": "allgood"}'  

@api.post("/actions")
def frontendreqsfunc(data:reqs):
    devicerec = data.device
    actionrec = data.action
    optionsrec = data.options
    
    if devicerec == "wroom" and actionrec == "download":
        clone_target = "wroom/"
        if os.path.exists(clone_target):
            shutil.rmtree(clone_target)
        os.makedirs("wroom/", exist_ok= True)
        return StreamingResponse(wroomdownloadprogress(), media_type="text/plain")
    
    if devicerec == "s3" and actionrec == "download":
        clone_target = "s3/"
        if os.path.exists(clone_target):
            shutil.rmtree(clone_target)
        os.makedirs("s3/", exist_ok= True)
        return StreamingResponse(s3downloadprogress(), media_type="text/plain")

    if devicerec == "wroom" and actionrec == "status":
        result3 = subprocess.run(["ls /dev/cu.*"], shell=True, capture_output=True, text=True)
        return {"result": result3.stdout.split()}
    
    if devicerec == "wroom" and actionrec == "flash":
        print(devicerec, actionrec, optionsrec)

    if devicerec == "s3" and actionrec == "status":
        result3 = subprocess.run(["ls /dev/cu.*"], shell=True, capture_output=True, text=True)
        return {"result": result3.stdout.split()}
    
    if devicerec == "s3" and actionrec == "flash":
        with zipfile.ZipFile("s3/build.zip", 'r') as zip_ref:
             zip_ref.extractall("s3/")
        result4 = subprocess.run([".venv/bin/python -m esptool --port " + optionsrec + " chip-id"], shell=True, capture_output=True, text=True)
        print(result4.stdout)
        print(result4.stderr)
        print(result4.returncode)
        print(devicerec, actionrec, optionsrec)
        if result4.returncode == 0:
             result5 = subprocess.run([".venv/bin/python -m esptool --port " + optionsrec + " chip-id"], shell=True, capture_output=True, text=True)
        return {
             "output": strip_ansi(result5.stdout),
             "error": strip_ansi(result5.stderr),
             "returncode": result5.returncode
        }
    return {"status": "allgood"}