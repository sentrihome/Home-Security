import { useEffect, useMemo, useState } from "react";
import StreamPlayer from "./components/StreamPlayer";
import { getHealth, startStream, stopStream, triggerMotion, clearLocalData } from "./api/pi";
import { getEvents, clearAllData } from "./api/cloud";
import "./App.css";

export default function App() {
  const [inputType, setInputType] = useState("webcam");
  const [inputValue, setInputValue] = useState("");
  const [playing, setPlaying] = useState(false);

  const [health, setHealth] = useState(null);
  const [events, setEvents] = useState([]);
  const [cloudEvents, setCloudEvents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [streamError, setStreamError] = useState(null);

  const hlsUrl = useMemo(() => "http://localhost:4000/hls/stream.m3u8", []);

  async function refreshHealth() {
    try {
      const data = await getHealth();
      setHealth(data);

      // Only sync playing state on initial load (when playing is false and stream is actually running)
      // Don't override user's explicit start/stop actions
      if (!playing && data?.stream?.running && data?.hls?.playlist) {
        console.log("🔄 Syncing: Backend stream detected, setting playing=true");
        setPlaying(true);
      }

      // Optional: if your backend returns events list, use it:
      // Example expected: data.events = [{name, url, time}]
      if (data?.events && Array.isArray(data.events)) {
        setEvents(data.events);
      }
    } catch (e) {
      console.error("Health check failed:", e);
    }
  }

  async function refreshCloudEvents() {
    try {
      const data = await getEvents();
      setCloudEvents(data);
    } catch (e) {
      console.error('Failed to fetch cloud events:', e);
    }
  }

  useEffect(() => {
    refreshHealth();
    refreshCloudEvents();
    const healthInterval = setInterval(refreshHealth, 2000);
    const cloudInterval = setInterval(refreshCloudEvents, 5000);
    return () => {
      clearInterval(healthInterval);
      clearInterval(cloudInterval);
    };
  }, []);

  async function onStart() {
    setBusy(true);
    setMsg("");
    setStreamError(null);
    try {
      await startStream(inputType, inputValue);
      setMsg("Stream starting... waiting for HLS segments");
      
      // Wait for HLS playlist to be ready
      let attempts = 0;
      const maxAttempts = 15;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const healthData = await getHealth();
        
        if (healthData?.hls?.playlist) {
          setPlaying(true);
          setMsg("Stream started");
          break;
        }
        
        attempts++;
        setMsg(`Stream starting... (${attempts}/${maxAttempts})`);
      }
      
      if (attempts >= maxAttempts) {
        setMsg("Stream started but HLS not ready yet. Please wait...");
        setPlaying(true);
      }
      
      await refreshHealth();
    } catch (e) {
      setMsg(`Start failed: ${e.message}`);
      setStreamError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onStop() {
    setBusy(true);
    setMsg("");
    setStreamError(null);
    try {
      await stopStream();
      setPlaying(false);
      setMsg("Stream stopped");
      await refreshHealth();
    } catch (e) {
      setMsg(`Stop failed: ${e.message}`);
      setStreamError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onClearData() {
    setBusy(true);
    setMsg("");
    try {
      // Clear local data (Pi backend)
      await clearLocalData();
      
      // Clear cloud data (MongoDB)
      await clearAllData();
      
      setMsg("All data cleared successfully!");
      setCloudEvents([]);
      await refreshHealth();
    } catch (e) {
      setMsg(`Clear data failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onMotion() {
    setBusy(true);
    setMsg("");
    setStreamError(null);
    try {
      await triggerMotion();
      setMsg("Motion event captured (clip extraction triggered).");
      await refreshHealth();
      // Refresh cloud events after a delay to allow upload
      setTimeout(refreshCloudEvents, 3000);
    } catch (e) {
      setMsg(`Motion failed: ${e.message}`);
      setStreamError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Home Security Dashboard</h1>
          <p>Live HLS feed + motion event capture (frontend)</p>
        </div>
        <div className="pill">{playing ? "● LIVE" : "● OFFLINE"}</div>
        {streamError && (
          <div className="pill" style={{ background: "#ff6b6b", color: "white" }}>
            ⚠️ Stream Error: {streamError}
          </div>
        )}
      </header>

      <div className="grid">
        <section className="card">
          <h2>Camera / Input</h2>

          <div className="row">
            <label>Input Type</label>
            <select value={inputType} onChange={(e) => setInputType(e.target.value)}>
              <option value="webcam">Webcam</option>
              <option value="rtsp">RTSP</option>
              <option value="file">File</option>
            </select>
          </div>

          {(inputType === "rtsp" || inputType === "file") && (
            <div className="row">
              <label>{inputType === "rtsp" ? "RTSP URL" : "File path"}</label>
              <input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={inputType === "rtsp" ? "rtsp://..." : "C:\\videos\\demo.mp4"}
              />
            </div>
          )}

          <div className="btnRow">
            <button disabled={busy} onClick={onStart}>
              Start
            </button>
            <button disabled={busy} onClick={onStop} className="secondary">
              Stop
            </button>
            <button disabled={busy} onClick={onMotion} className="warn">
              Simulate Motion
            </button>
            <button disabled={busy} onClick={onClearData} className="danger">
              Clear All Data
            </button>
          </div>

          <div className="small">
            <div>HLS URL (via proxy): <code>{hlsUrl}</code></div>
            <div className="hint">
              We use <code>/api</code> and <code>/hls</code> so you don’t hardcode <code>localhost:4000</code> in React.
            </div>
          </div>

          {msg && <div className="message">{msg}</div>}
        </section>

        <section className="card">
          <h2>System Status</h2>
          <div className="kv">
            <div className="k">Backend</div>
            <div className="v">{health ? "Connected" : "Disconnected"}</div>

            <div className="k">Stream running</div>
            <div className="v">{health?.stream?.running ? "Yes" : "No"}</div>

            <div className="k">Playlist exists</div>
            <div className="v">{health?.hls?.playlistExists ? "Yes" : "No"}</div>

            <div className="k">Segments</div>
            <div className="v">{health?.hls?.segmentCount ?? "-"}</div>

            <div className="k">Latest segment</div>
            <div className="v">{health?.hls?.latestSegment?.name ?? "-"}</div>
          </div>

          {health?.stream?.lastFfmpegError?.message && (
            <div className="errorBox">
              <b>FFmpeg:</b> {health.stream.lastFfmpegError.message}
            </div>
          )}
        </section>

        <section className="card wide">
          <StreamPlayer playing={playing} />
        </section>

        <section className="card wide">
          <h2>Recorded Events</h2>
          <p className="hint">
            Real motion events from cloud backend with thumbnails and video links.
          </p>

          {cloudEvents.length === 0 ? (
            <div className="empty">No events yet (trigger "Simulate Motion").</div>
          ) : (
            <div className="events">
              {cloudEvents.map((event) => (
                <div className="event" key={event._id || event.id}>
                  <div className="event-content">
                    {event.thumbnail && (
                      <img 
                        src={event.thumbnail.directUrl} 
                        alt="Motion preview"
                        className="event-thumbnail"
                        style={{ 
                          width: 200, 
                          height: 150, 
                          objectFit: 'cover',
                          borderRadius: 8,
                          marginRight: 16
                        }}
                      />
                    )}
                    <div className="event-details">
                      <div>
                        <b>Event {(event._id || event.id || '').slice(-6)}</b>
                        <div className="hint">
                          {new Date(event.timestamp || event.createdAt).toLocaleString()}
                        </div>
                        <div className="hint">Device: {event.deviceId}</div>
                        <div className="hint">Status: {event.status}</div>
                      </div>
                      {event.video && event.video.webViewLink && (
                        <a 
                          className="link" 
                          href={event.video.webViewLink} 
                          target="_blank" 
                          rel="noreferrer"
                        >
                          Watch Clip
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}



