import cv2

cap = cv2.VideoCapture(0)
fourcc = cv2.VideoWriter_fourcc(*"mp4v")
save = cv2.VideoWriter("save.mp4", fourcc, 30, (1920, 1080))
def cameraoutput():
    
    ret, frame = cap.read()
    save.write(frame)
    return frame