// cloud-backend/server.js

import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import multer from "multer";

import {
  createOAuthClient,
  getAuthUrl,
  handleOAuthCallback,
  getDriveUserEmail,
  saveTokensForUser,
} from "./googleAuth.js";
import { requireAuth, requireAuthOrQueryToken, createToken, invalidateToken } from "./auth.js";
import { connectMongo } from "./mongo.js";
import { Event } from "./models/Event.js";
import { Device } from "./models/Device.js";
import { MotionAlert } from "./models/MotionAlert.js";
import { uploadToS3, getPresignedUrl, pruneOldSegments } from "./s3Client.js";
import { getHlsCache } from "./hlsCache.js";

/* =========================
   Presigned URL cache
   Avoids re-signing the same S3 key on every request.
   TTL is 45 min; presigned URLs are valid for 1 hour.
========================= */
const presignedCache = new Map(); // s3Key -> { url, expiresAt }
const PRESIGNED_TTL_MS = 45 * 60 * 1000;

async function getCachedPresignedUrl(s3Key) {
  const cached = presignedCache.get(s3Key);
  if (cached && Date.now() < cached.expiresAt) return cached.url;
  const url = await getPresignedUrl(s3Key, 3600);
  presignedCache.set(s3Key, { url, expiresAt: Date.now() + PRESIGNED_TTL_MS });
  return url;
}

const app = express();
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:5174"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());

/* =========================
   Upload (multer) setup
========================= */

const UPLOAD_DIR = "uploads";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp4";
    cb(null, `event_${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

/* =========================
   MongoDB connection
========================= */

await connectMongo();

/* =========================
   OAuth routes
========================= */

app.get("/auth/google", (_req, res) => {
  const client = createOAuthClient();
  res.redirect(getAuthUrl(client));
});

app.get("/auth/google/callback", async (req, res) => {
  console.log("OAuth callback hit, code=" + (req.query.code ? "present" : "MISSING"));

  // Helper: serve an HTML bridge page that opens the custom-scheme deep link.
  // Chrome blocks server-side 302 redirects to custom URI schemes, but it does
  // honour <a href="custom://..."> navigations triggered from JS / user click.
  const sendDeepLinkPage = (deepLink, success) => {
    const escaped = deepLink.replace(/"/g, "&quot;");
    const icon    = success ? "✅" : "❌";
    const title   = success ? "Login Successful" : "Login Failed";
    const body    = success
      ? "You are now signed in. Opening the app…"
      : "Something went wrong. Please try again.";
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;
         justify-content:center;min-height:100vh;margin:0;padding:24px;
         background:#f8f9fa;color:#202124;text-align:center}
    h1{font-size:1.5rem;margin-bottom:8px}
    p{color:#5f6368;margin-bottom:24px}
    a.btn{display:inline-block;padding:14px 32px;background:#1a73e8;color:#fff;
          border-radius:8px;text-decoration:none;font-size:1rem;font-weight:600}
  </style>
</head>
<body>
  <div style="font-size:3rem">${icon}</div>
  <h1>${title}</h1>
  <p>${body}</p>
  <a class="btn" href="${escaped}" id="open">Open App</a>
  <script>
    // Auto-open: works in Chrome/WebView as long as it's on the main frame.
    try { document.getElementById('open').click(); } catch(e){}
    // Fallback: if the app didn't open, the button stays visible.
  </script>
</body>
</html>`);
  };

  try {
    const client = createOAuthClient();
    const tokens = await handleOAuthCallback(client, req.query.code);
    let email = null;
    try {
      email = await getDriveUserEmail(client);
      if (email) {
        console.log("Google Drive connected as:", email);
        saveTokensForUser(email, tokens);
      }
    } catch (e) {
      console.warn("Could not fetch user email:", e.message);
    }
    if (!email) {
      const link = "home-security://auth-error?msg=" + encodeURIComponent("Could not get user email");
      return sendDeepLinkPage(link, false);
    }
    const authToken = createToken(email);
    const params = new URLSearchParams({ email, token: authToken });
    sendDeepLinkPage("home-security://auth-success?" + params.toString(), true);
  } catch (err) {
    console.error("OAuth callback error:", err.message);
    const link = "home-security://auth-error?msg=" + encodeURIComponent(err.message || "OAuth failed");
    sendDeepLinkPage(link, false);
  }
});

/* =========================
   Auth status (requires Bearer token)
========================= */

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ email: req.user.email });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const raw = req.headers.authorization;
  const token = raw && raw.startsWith("Bearer ") ? raw.slice(7).trim() : null;
  invalidateToken(token);
  console.log("User logged out:", req.user.email);
  res.json({ status: "ok", message: "Logged out" });
});

/* =========================
   Device linking (Pi -> user, for upload attribution)
========================= */

app.post("/api/devices/link", requireAuth, async (req, res) => {
  const deviceId = req.body?.deviceId?.trim?.();
  if (!deviceId) {
    return res.status(400).json({ error: "deviceId required" });
  }
  await Device.findOneAndUpdate(
    { deviceId },
    { ownerEmail: req.user.email, updatedAt: new Date() },
    { upsert: true, new: true }
  );
  console.log("Device linked: %s → %s", deviceId, req.user.email);
  res.json({ status: "ok", deviceId, ownerEmail: req.user.email });
});

/* =========================
   Health check
========================= */

app.get("/status", (_req, res) => {
  res.json({ status: "ok", service: "cloud-backend" });
});

/* =========================
   Stream: Pi pushes HLS segments
========================= */

/**
 * POST /api/stream/segment
 * Body: multipart, field "segment" = .ts file, "deviceId", "seq"
 * Called by Pi backend for every ffmpeg output segment.
 */
app.post("/api/stream/segment", upload.single("segment"), async (req, res) => {
  const deviceId = req.body.deviceId || "default";
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No segment file" });

  try {
    const seq = req.body.seq || Date.now();
    const s3Key = `live/${deviceId}/seg_${seq}.ts`;

    const data = fs.readFileSync(file.path);
    await uploadToS3(s3Key, data, "video/mp2t");
    fs.unlinkSync(file.path);

    const cache = getHlsCache(deviceId);
    cache.addSegment(s3Key);

    pruneOldSegments(`live/${deviceId}/`, 10 * 60 * 1000).catch(console.error);

    res.json({ status: "ok", key: s3Key });
  } catch (err) {
    if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    console.error("Segment upload error:", err.message);
    res.status(500).json({ error: "Segment upload failed" });
  }
});

/**
 * GET /api/stream/playlist/:deviceId
 * Returns a live HLS m3u8 playlist with presigned S3 URLs.
 */
app.get("/api/stream/playlist/:deviceId", async (req, res) => {
  const deviceId = req.params.deviceId || "default";
  const cache = getHlsCache(deviceId);

  if (!cache.isLive || cache.age > 15000) {
    return res.status(404).json({ error: "Stream offline" });
  }

  const playlist = await cache.buildPlaylist(getPresignedUrl);
  if (!playlist) return res.status(404).json({ error: "No segments yet" });

  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.send(playlist);
});

/**
 * GET /api/stream/status/:deviceId
 * Lightweight poll endpoint to check if stream is live.
 */
app.get("/api/stream/status/:deviceId", (req, res) => {
  const cache = getHlsCache(req.params.deviceId || "default");
  res.json({
    live: cache.isLive && cache.age < 15000,
    segmentCount: cache.segments.length,
    lastUpdated: cache.lastUpdated,
  });
});

/* =========================
   Event upload from Pi
========================= */

app.post("/api/events/upload", upload.single("file"), async (req, res) => {
  const deviceId = req.body.deviceId || "unknown";
  const type = req.body.type || "video";
  if (!req.file) return res.status(400).json({ error: "Missing file" });

  try {
    const ext = path.extname(req.file.originalname) || (type === "thumbnail" ? ".jpg" : ".mp4");
    const eventId = `${deviceId}_${Date.now()}`;
    const s3Key = `events/${deviceId}/${eventId}${ext}`;
    const contentType = type === "thumbnail" ? "image/jpeg" : "video/mp4";

    let ownerEmail = null;
    const device = await Device.findOne({ deviceId }).lean();
    if (device?.ownerEmail) ownerEmail = device.ownerEmail;

    const data = fs.readFileSync(req.file.path);
    await uploadToS3(s3Key, data, contentType);
    fs.unlinkSync(req.file.path);

    // Save to MongoDB (with ownerEmail for multi-user)
    let event;
    if (type === "video") {
      event = await Event.create({
        ownerEmail: ownerEmail || undefined,
        deviceId,
        filename: req.file.originalname || `${eventId}.mp4`,
        s3Key,
        status: "ready",
      });
    } else {
      // Thumbnail — attach to latest pending event for this device
      event = await Event.findOneAndUpdate(
        { deviceId, thumbnailS3Key: { $exists: false } },
        { thumbnailS3Key: s3Key },
        { new: true, sort: { createdAt: -1 } }
      );
    }

    res.json({ status: "ok", event });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "Upload failed" });
  }
});

/* =========================
   Frontend API - List events (all clips, no auth required)
   TODO: re-enable requireAuth + ownerEmail filter when multi-user auth is ready
========================= */

app.get("/api/events", async (_req, res) => {
  // Auth disabled — returns all ready clips regardless of owner.
  const events = await Event.find({
    // ownerEmail: req.user.email,   // TODO: re-enable for per-user filtering
    s3Key: { $exists: true, $ne: null },
    status: "ready",
  })
    .sort({ createdAt: -1 })
    .limit(50);

  // Embed presigned S3 URLs directly so the app loads media straight from S3
  // (no extra hop through the backend / ngrok for each thumbnail or clip).
  const result = await Promise.all(events.map(async (e) => {
    let thumbnailUrl = null;
    let videoUrl = null;
    try { videoUrl = await getCachedPresignedUrl(e.s3Key); } catch (_) {}
    if (e.thumbnailS3Key) {
      try { thumbnailUrl = await getCachedPresignedUrl(e.thumbnailS3Key); } catch (_) {}
    }
    return {
      _id: e._id,
      id: e._id,
      deviceId: e.deviceId,
      filename: e.filename,
      createdAt: e.createdAt,
      timestamp: e.createdAt,
      status: e.status,
      hasVideo: !!e.s3Key,
      hasThumbnail: !!e.thumbnailS3Key,
      thumbnailUrl,
      videoUrl,
    };
  }));

  res.json(result);
});

/* =========================
   Serve clips from S3 (no auth required)
   TODO: re-enable requireAuthOrQueryToken + owner check when multi-user auth is ready
========================= */

app.get("/api/clips/:eventId", async (req, res) => {
  const eventId = req.params.eventId?.trim();
  if (!eventId) return res.status(400).json({ error: "Invalid event ID" });
  const event = await Event.findById(eventId);
  if (!event?.s3Key) return res.status(404).json({ error: "Not found" });
  // if (event.ownerEmail && event.ownerEmail !== req.user?.email) {
  //   return res.status(403).json({ error: "Forbidden: not your clip" });
  // }
  const url = await getCachedPresignedUrl(event.s3Key);
  res.redirect(302, url);
});

app.get("/api/clips/:eventId/thumbnail", async (req, res) => {
  const eventId = req.params.eventId?.trim();
  if (!eventId) return res.status(400).json({ error: "Invalid event ID" });
  const event = await Event.findById(eventId);
  if (!event?.thumbnailS3Key) return res.status(404).json({ error: "No thumbnail" });
  // if (event.ownerEmail && event.ownerEmail !== req.user?.email) {
  //   return res.status(403).json({ error: "Forbidden: not your clip" });
  // }
  const url = await getCachedPresignedUrl(event.thumbnailS3Key);
  res.redirect(302, url);
});

/* =========================
   Motion alerts (Pi → Cloud → App)
========================= */

// SSE clients waiting for motion events.
// Each entry is an Express response object with SSE headers already sent.
const sseClients = new Set();

/**
 * Push a motion alert to every connected SSE client immediately.
 * Called from POST /api/motion and POST /api/motion/test.
 */
function broadcastMotionAlert(alert) {
  const payload = JSON.stringify({
    id:          alert._id,
    deviceId:    alert.deviceId,
    eventId:     alert.eventId  ?? null,
    createdAt:   alert.createdAt,
    createdAtMs: alert.createdAt.getTime(),
  });
  for (const client of sseClients) {
    try { client.write(`data: ${payload}\n\n`); } catch (_) {}
  }
  console.log(`📡 SSE broadcast to ${sseClients.size} client(s): alert ${alert._id}`);
}

/**
 * GET /api/motion/stream
 * Server-Sent Events stream — app connects once and receives alerts instantly.
 * Sends a heartbeat comment every 20 s to stay alive through ngrok's idle timeout.
 */
app.get("/api/motion/stream", (req, res) => {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx / ngrok buffering
  res.flushHeaders();

  // Heartbeat to prevent ngrok/proxy from closing the idle connection
  const heartbeat = setInterval(() => {
    try { res.write(":\n\n"); } catch (_) {}
  }, 20_000);

  sseClients.add(res);
  console.log(`🔌 SSE client connected (total: ${sseClients.size})`);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    console.log(`🔌 SSE client disconnected (total: ${sseClients.size})`);
  });
});

/**
 * POST /api/motion
 * Called by the Pi when hardware motion is detected.
 * No auth required — Pi uses device-level trust (deviceId).
 * Body: { deviceId, eventId? }   eventId is optional if the Pi has already
 * uploaded a clip and has the resulting event _id.
 */
app.post("/api/motion", async (req, res) => {
  const deviceId = req.body?.deviceId?.trim() || "unknown";
  const eventId  = req.body?.eventId?.trim()  || null;

  let ownerEmail = null;
  try {
    const device = await Device.findOne({ deviceId }).lean();
    ownerEmail = device?.ownerEmail ?? null;
  } catch (_) {}

  const alert = await MotionAlert.create({ deviceId, ownerEmail, eventId });
  console.log(`🚨 Motion alert created: ${alert._id} (device: ${deviceId}, owner: ${ownerEmail})`);
  broadcastMotionAlert(alert);
  res.json({ status: "ok", alertId: alert._id });
});

/**
 * GET /api/motion/latest
 * Auth disabled — returns the newest pending alert for anyone.
 * TODO: re-enable requireAuth + per-user filtering when multi-user auth is ready
 */
app.get("/api/motion/latest", async (_req, res) => {
  // Check global cooldown (any "was_me" ack that is still active)
  const activeCooldown = await MotionAlert.findOne({
    cooldownUntil: { $gt: new Date() },
  }).sort({ createdAt: -1 }).lean();

  if (activeCooldown) {
    return res.json({ alert: null, cooldownUntil: activeCooldown.cooldownUntil });
  }

  const alert = await MotionAlert.findOne({ status: "pending" })
    .sort({ createdAt: -1 })
    .lean();

  if (!alert) return res.json({ alert: null, cooldownUntil: null });

  res.json({
    alert: {
      id:          alert._id,
      deviceId:    alert.deviceId,
      eventId:     alert.eventId,
      createdAt:   alert.createdAt,
      createdAtMs: alert.createdAt.getTime(),
    },
    cooldownUntil: null,
  });
});

/**
 * POST /api/motion/test
 * Creates a test motion alert (no auth required).
 */
app.post("/api/motion/test", async (_req, res) => {
  const alert = await MotionAlert.create({
    deviceId:   "test-device",
    ownerEmail: null,
    eventId:    null,
  });
  console.log(`🧪 Test motion alert created: ${alert._id}`);
  broadcastMotionAlert(alert);
  res.json({ status: "ok", alertId: alert._id });
});

/**
 * POST /api/motion/:alertId/acknowledge
 * Auth disabled — anyone can acknowledge any alert.
 * TODO: re-enable requireAuth + ownership check when multi-user auth is ready
 */
app.post("/api/motion/:alertId/acknowledge", async (req, res) => {
  const { action } = req.body;
  if (!["was_me", "not_me"].includes(action)) {
    return res.status(400).json({ error: "action must be 'was_me' or 'not_me'" });
  }

  const alert = await MotionAlert.findById(req.params.alertId);
  if (!alert) return res.status(404).json({ error: "Alert not found" });
  // if (alert.ownerEmail && alert.ownerEmail !== req.user?.email) {
  //   return res.status(403).json({ error: "Forbidden" });
  // }

  const cooldownUntil = action === "was_me"
    ? new Date(Date.now() + 30 * 1000)
    : null;

  await MotionAlert.findByIdAndUpdate(req.params.alertId, {
    status: "acknowledged",
    action,
    cooldownUntil,
  });

  console.log(`✅ Motion alert ${req.params.alertId} acknowledged: ${action}`);
  res.json({ status: "ok", action, cooldownUntil });
});

/* =========================
   Clear all data endpoint
========================= */

app.delete("/api/clear-all", async (_req, res) => {
  try {
    // Clear MongoDB events
    await Event.deleteMany({});
    
    // Note: S3 files would need additional cleanup logic
    // For now, just clear the database
    
    res.json({ 
      status: "ok", 
      message: "All data cleared from database",
      deletedCount: 0 
    });
  } catch (err) {
    console.error("❌ Clear data failed:", err.message);
    res.status(500).json({ error: "Failed to clear data" });
  }
});

/* =========================
   Global error handlers
========================= */

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).send("Internal Server Error");
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  process.exit(1);
});

/* =========================
   Start server
========================= */

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0',() => {
  console.log(`☁️ Cloud backend running at http://localhost:${PORT}`);
});
