from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
# from fastapi.requests import Request
from pydantic import BaseModel
from aiortc import (
    RTCPeerConnection,
    RTCSessionDescription,
    VideoStreamTrack,
    RTCConfiguration,
    RTCIceServer,
)
import asyncio
import av
from cam import cameraoutput


api = FastAPI()

ICE_SERVERS = [
    RTCIceServer(urls=["stun:stun.cloudflare.com:3478"]),
    RTCIceServer(
        urls=[
            "turn:turn.cloudflare.com:3478?transport=udp",
            "turn:turn.cloudflare.com:3478?transport=tcp",
            "turns:turn.cloudflare.com:5349?transport=tcp",
        ],
        username="g08d0b8648e113b95b50f07e3670941c00dbca7e3a1d777a07b07f7d177041b1",
        credential="c2a0d2023d9209a5ec0a1d9b784611d933c1dcc6c98b5a328ea157f25dee498d",
    ),
]
RTC_CONFIG = RTCConfiguration(iceServers=ICE_SERVERS)


class requestdata(BaseModel):
    sdp: str
    type: str


api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@api.get("/")
def health():
    return {"health":"ok"}

@api.get("/page")
def page():
    return FileResponse("index.html")

class CameraTrack(VideoStreamTrack):
    async def recv(self):
        pts, time_base = await self.next_timestamp()
        frame = cameraoutput()
        video_frame = av.VideoFrame.from_ndarray(frame, format="bgr24")
        video_frame.pts = pts
        video_frame.time_base = time_base
        return video_frame

@api.post("/offer")
async def rtcoffer(receiveddata: requestdata):
    sdprec = receiveddata.sdp
    typerec = receiveddata.type
    rtc = RTCPeerConnection(configuration=RTC_CONFIG)
    await rtc.setRemoteDescription(RTCSessionDescription(sdp=sdprec, type=typerec))

    rtc.addTrack(CameraTrack())

    answer = await rtc.createAnswer()
    await rtc.setLocalDescription(answer)

    # Wait for ICE gathering to complete so that relay candidates
    # (including TURN) are included in the SDP we return.
    if rtc.iceGatheringState != "complete":
        loop = asyncio.get_event_loop()
        gathering_done: asyncio.Future[None] = loop.create_future()

        def on_gathering_state_change() -> None:
            if rtc.iceGatheringState == "complete" and not gathering_done.done():
                gathering_done.set_result(None)

        rtc.on("icegatheringstatechange", on_gathering_state_change)

        try:
            # If it completed between the check and handler registration,
            # skip waiting; otherwise, wait up to 10 seconds.
            if rtc.iceGatheringState != "complete":
                await asyncio.wait_for(gathering_done, timeout=10.0)
        except asyncio.TimeoutError:
            # If gathering takes too long, return whatever candidates we have.
            pass
        finally:
            rtc.remove_listener("icegatheringstatechange", on_gathering_state_change)

    return {
        "sdp": rtc.localDescription.sdp,
        "type": rtc.localDescription.type,
    }