import cv2
import threading

cap = cv2.VideoCapture(0)

framewrite = None

def cameraread():
    while True:
        global framewrite
        ret, frame = cap.read()
        framewrite = frame
    
def cameraoutput():
    return framewrite

threading.Thread(target=cameraread, daemon=True).start()