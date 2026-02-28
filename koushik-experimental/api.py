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
    RTCIceCandidate,
)
import asyncio
import uuid
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

# Session store for trickle ICE: session_id -> RTCPeerConnection
sessions: dict[str, RTCPeerConnection] = {}


class requestdata(BaseModel):
    sdp: str
    type: str


class IceCandidateData(BaseModel):
    sessionId: str
    candidate: str | None = None
    sdpMid: str | None = None
    sdpMLineIndex: int | None = None


def _parse_ice_candidate(candidate_str: str) -> RTCIceCandidate | None:
    """
    Parse a browser ICE candidate string into an RTCIceCandidate.
    Expects a string starting with 'candidate:'.
    """
    if not candidate_str:
        return None

    line = candidate_str.strip()
    if not line.startswith("candidate:"):
        return None

    parts = line.replace("candidate:", "", 1).split()
    # candidate:<foundation> <component> <protocol> <priority> <ip> <port> typ <type> ...
    if len(parts) < 8:
        return None

    foundation = parts[0]
    component = int(parts[1])
    protocol = parts[2]
    priority = int(parts[3])
    ip = parts[4]
    port = int(parts[5])
    cand_type = parts[7]

    return RTCIceCandidate(
        foundation=foundation,
        component=component,
        protocol=protocol,
        priority=priority,
        ip=ip,
        port=port,
        type=cand_type,
        sdpMid=None,
        sdpMLineIndex=None,
    )


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

    session_id = str(uuid.uuid4())
    sessions[session_id] = rtc

    return {
        "sdp": rtc.localDescription.sdp,
        "type": rtc.localDescription.type,
        "sessionId": session_id,
    }


@api.post("/ice-candidate")
async def add_ice_candidate(data: IceCandidateData):
    rtc = sessions.get(data.sessionId)
    if not rtc:
        return {"ok": False, "error": "unknown session"}

    if data.candidate is None:
        # Signal end-of-candidates.
        await rtc.addIceCandidate(None)
        return {"ok": True}

    parsed = _parse_ice_candidate(data.candidate)
    if parsed is None:
        return {"ok": False, "error": "invalid candidate"}

    parsed.sdpMid = data.sdpMid
    parsed.sdpMLineIndex = data.sdpMLineIndex

    try:
        await rtc.addIceCandidate(parsed)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}

    return {"ok": True}