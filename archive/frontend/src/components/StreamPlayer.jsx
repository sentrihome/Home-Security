import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

const STREAM_URL = "http://localhost:4000/hls/stream.m3u8";

export default function StreamPlayer({ playing }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [status, setStatus] = useState("Idle");
  const retryTimeoutRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      console.error("🎥 StreamPlayer: video element not found");
      return;
    }

    console.log("🎥 StreamPlayer: playing =", playing);
    console.log("🎥 StreamPlayer: STREAM_URL =", STREAM_URL);

    // Clear any pending retries
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Cleanup previous instance
    if (hlsRef.current) {
      console.log("🎥 StreamPlayer: Destroying previous HLS instance");
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    video.removeAttribute("src");
    video.load();

    if (!playing) {
      console.log("🎥 StreamPlayer: Not playing, setting status to Stopped");
      setStatus("Stopped");
      return;
    }

    console.log("🎥 StreamPlayer: Starting stream...");
    setStatus("Loading...");

    // Safari supports native HLS
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      console.log("🎥 StreamPlayer: Using native HLS (Safari)");
      video.src = STREAM_URL;
      
      video.addEventListener('loadedmetadata', () => {
        console.log("🎥 StreamPlayer: Metadata loaded");
        setStatus("Playing (native HLS)");
      });
      
      video.addEventListener('error', (e) => {
        console.error("🎥 StreamPlayer: Video error:", e);
        setStatus("Error loading stream");
      });
      
      video.play()
        .then(() => console.log("🎥 StreamPlayer: Native HLS playback started"))
        .catch((err) => {
          console.error("🎥 StreamPlayer: Native HLS playback failed:", err);
          setStatus(`Playback error: ${err.message}`);
        });
      
      return;
    }

    // Other browsers need hls.js
    if (Hls.isSupported()) {
      console.log("🎥 StreamPlayer: Using hls.js");
      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 2,
        debug: false,
        enableWorker: true,
        maxBufferLength: 10,
        maxMaxBufferLength: 20,
      });

      hlsRef.current = hls;

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        console.error("🎥 HLS Error:", data);
        
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error("🎥 Fatal network error, trying to recover");
              setStatus("Network error, retrying...");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error("🎥 Fatal media error, trying to recover");
              setStatus("Media error, recovering...");
              hls.recoverMediaError();
              break;
            default:
              console.error("🎥 Fatal error, cannot recover");
              setStatus(`Fatal error: ${data.type}`);
              hls.destroy();
              break;
          }
        }
      });

      hls.on(Hls.Events.MANIFEST_LOADED, () => {
        console.log("🎥 StreamPlayer: Manifest loaded");
      });

      console.log("🎥 StreamPlayer: Loading HLS source:", STREAM_URL);
      hls.loadSource(STREAM_URL);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log("🎥 StreamPlayer: Manifest parsed, starting playback");
        setStatus("Starting playback...");
        
        video.play()
          .then(() => {
            console.log("🎥 StreamPlayer: HLS.js playback started");
            setStatus("Playing");
          })
          .catch((err) => {
            console.error("🎥 StreamPlayer: HLS.js playback failed:", err);
            setStatus(`Playback error: ${err.message}`);
          });
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        if (status !== "Playing") {
          setStatus("Playing");
        }
      });

      return () => {
        console.log("🎥 StreamPlayer: Cleanup - destroying HLS");
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }
        hls.destroy();
        hlsRef.current = null;
      };
    }

    console.error("🎥 StreamPlayer: HLS not supported in this browser");
    setStatus("HLS not supported in this browser");
  }, [playing]);

  return (
    <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid #ddd" }}>
      <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 14 }}>
        <b>Live Feed</b> — {status}
      </div>
      <video
        ref={videoRef}
        controls
        muted
        autoPlay
        playsInline
        style={{ width: "100%", background: "black", display: "block", minHeight: "400px" }}
      />
    </div>
  );
}
