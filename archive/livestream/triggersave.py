import cv2
import glob
import recording


def triggersavefunc(output_path="output.mp4", fps=30):    
    paths = sorted(
        glob.glob("save*.mp4"),
        key=lambda p: int(p.replace("save", "").replace(".mp4", ""))
    )
    if not paths:
        return

    writer = None

    for path in paths:
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            continue

        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            if writer is None:
                h, w = frame.shape[:2]
                fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                writer = cv2.VideoWriter(output_path, fourcc, fps, (w, h))
            writer.write(frame)

        cap.release()

    if writer is not None:
        writer.release()