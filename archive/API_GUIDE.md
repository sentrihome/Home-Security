# Home Security API Guide

## 🚨 **IMPORTANT: Use Correct Backend Ports**

### **Cloud Backend (Port 3001)**
- ✅ `GET /status` - Health check
- ✅ `GET /api/events` - List events with thumbnails
- ✅ `GET /api/clips/:eventId` - Stream video clip from Google Drive
- ✅ `GET /api/clips/:eventId/thumbnail` - Stream thumbnail from Google Drive
- ✅ `POST /api/events/upload` - Upload files (Pi only)
- ✅ `DELETE /api/clear-all` - Clear database
- ❌ `POST /start` - Not available (use Pi backend)
- ❌ `POST /stop` - Not available (use Pi backend)
- ❌ `POST /motion` - Not available (use Pi backend)

### **Pi Backend (Port 4000)**
- ✅ `GET /health` - System status
- ✅ `POST /start` - Start stream
- ✅ `POST /stop` - Stop stream
- ✅ `POST /motion` - Trigger motion
- ✅ `DELETE /clear-all` - Clear local data

## 🎯 **Correct Usage Examples**

### **Stream Control (Pi Backend)**
```bash
# Start stream
curl -X POST http://localhost:4000/start \
  -H "Content-Type: application/json" \
  -d '{"type":"webcam","value":""}'

# Stop stream
curl -X POST http://localhost:4000/stop

# Trigger motion
curl -X POST http://localhost:4000/motion
```

### **Cloud Data (Cloud Backend)**
```bash
# Get events
curl http://localhost:3001/api/events

# Stream video clip (replace EVENT_ID with event._id from /api/events)
curl -O -J "http://localhost:3001/api/clips/EVENT_ID"

# Stream thumbnail (replace EVENT_ID with event._id)
curl -O -J "http://localhost:3001/api/clips/EVENT_ID/thumbnail"

# Clear database
curl -X DELETE http://localhost:3001/api/clear-all

# Health check
curl http://localhost:3001/status
```

## 📹 **Clip Serving (Cloud Backend)**

Clips are streamed from Google Drive through the cloud backend:

| Endpoint | Description |
|----------|-------------|
| `GET /api/clips/:eventId` | Streams the video file (video/mp4). Use in `<video src="...">` or download. |
| `GET /api/clips/:eventId/thumbnail` | Streams the thumbnail image (image/jpeg). Use in `<img src="...">`. |

**Example frontend usage:**
```html
<video src="http://localhost:3001/api/clips/675abc123def456789" controls></video>
<img src="http://localhost:3001/api/clips/675abc123def456789/thumbnail" />
```

Replace `675abc123def456789` with the event's `_id` from `GET /api/events`.

## 🖥️ **Frontend Integration**

The frontend automatically routes requests correctly:
- `/api/*` → Pi backend (port 4000)
- `/cloud/*` → Cloud backend (port 3001)

## 🚨 **Common Mistakes to Avoid**

1. **❌ Wrong:** `curl -X POST http://localhost:3001/stop`
   **✅ Right:** `curl -X POST http://localhost:4000/stop`

2. **❌ Wrong:** `curl http://localhost:4000/api/events`
   **✅ Right:** `curl http://localhost:3001/api/events`

3. **❌ Wrong:** `curl -X DELETE http://localhost:4000/api/clear-all`
   **✅ Right:** `curl -X DELETE http://localhost:3001/api/clear-all`

## 🎯 **Quick Test Commands**

```bash
# Test Pi backend
curl http://localhost:4000/health

# Test cloud backend  
curl http://localhost:3001/status

# Trigger motion (full pipeline test)
curl -X POST http://localhost:4000/motion
sleep 5
curl http://localhost:3001/api/events

# Download a clip (get event ID from /api/events first)
curl -o clip.mp4 "http://localhost:3001/api/clips/YOUR_EVENT_ID"
```
