import cv2

cap = cv2.VideoCapture(0)

def cameraoutput():
    
    ret, frame = cap.read()
    
    return frame