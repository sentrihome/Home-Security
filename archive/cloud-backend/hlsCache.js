/**
 * In-memory HLS playlist manager.
 * Tracks the last N segment keys so we can build a valid m3u8
 * without hitting S3 on every request.
 */

const MAX_SEGMENTS = 6;          // ~12s at 2s/segment
const SEGMENT_DURATION = 2;      // must match ffmpeg -hls_time

class HlsCache {
  constructor() {
    this.segments = [];           // [{ key, seq }]
    this.sequenceNumber = 0;
    this.isLive = false;
    this.lastUpdated = null;
  }

  addSegment(s3Key) {
    this.segments.push({ key: s3Key, seq: this.sequenceNumber++ });
    // Keep only last MAX_SEGMENTS
    if (this.segments.length > MAX_SEGMENTS) {
      this.segments.shift();      // oldest removed from playlist
    }
    this.isLive = true;
    this.lastUpdated = Date.now();
  }

  /** Build an HLS playlist with presigned URLs */
  async buildPlaylist(getPresignedUrlFn) {
    if (this.segments.length === 0) return null;

    const firstSeq = this.segments[0].seq;
    const lines = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      `#EXT-X-TARGETDURATION:${SEGMENT_DURATION}`,
      `#EXT-X-MEDIA-SEQUENCE:${firstSeq}`,
    ];

    for (const seg of this.segments) {
      const url = await getPresignedUrlFn(seg.key, 120); // 2-min URLs
      lines.push(`#EXTINF:${SEGMENT_DURATION}.0,`);
      lines.push(url);
    }

    // No EXT-X-ENDLIST → tells player this is a live stream
    return lines.join("\n");
  }

  markStopped() {
    this.isLive = false;
  }

  get age() {
    return this.lastUpdated ? Date.now() - this.lastUpdated : Infinity;
  }
}

// One cache per device
const caches = new Map();

export function getHlsCache(deviceId = "default") {
  if (!caches.has(deviceId)) caches.set(deviceId, new HlsCache());
  return caches.get(deviceId);
}