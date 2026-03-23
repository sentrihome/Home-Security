import cam
import time
import cv2
import threading
import os
import api
from triggersave import triggersavefunc
import glob


paths = sorted(
        glob.glob("save*.mp4"),
        key=lambda p: int(p.replace("save", "").replace(".mp4", ""))
    )
for p in paths:
    try:
        os.remove(p)
    except FileNotFoundError:
        pass

fourcc = cv2.VideoWriter_fourcc(*"avc1")
save = None
start = time.time()
savecount = 0

def videorecord():
    global savecount
    deletecount = 0
    save = None
    start = None
    while True:
        savename = "save" + str(savecount) + ".mp4"
        if cam.framewrite is None:
            time.sleep(0.033)
            continue

        if save is None:
            h, w = cam.framewrite.shape[:2]
            save = cv2.VideoWriter(savename, fourcc, 30, (w, h))
            start = time.time()

        save.write(cam.framewrite)

        if time.time() - start >= 3:
            save.release()
            save = None
            savecount += 1
            if savecount >= 9 :
                try:
                    os.remove(f"save{deletecount}.mp4")
                    deletecount += 1
                except FileNotFoundError:
                    pass
            
            if savecount == api.required :
                triggersavefunc()
        time.sleep(1/30)

threading.Thread(target=videorecord, daemon=True).start()