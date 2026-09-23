import { DEFAULT_PI_HOST } from '@/lib/config';
import type { LiveStartResponse, WebrtcUrls } from '@/types';

export const WEBRTC_PORT = 8889;
export const WEBRTC_PATH = 'cam';

/** Build MediaMTX player URL from whatever host the app uses for the Pi API. */
export function webrtcPlayUrlFromPiBase(piBaseUrl: string): string {
  try {
    const api = new URL(piBaseUrl);
    const host = api.hostname || DEFAULT_PI_HOST;
    return `http://${host}:${WEBRTC_PORT}/${WEBRTC_PATH}`;
  } catch {
    return `http://${DEFAULT_PI_HOST}:${WEBRTC_PORT}/${WEBRTC_PATH}`;
  }
}

/**
 * Prefer the WebRTC URL that matches the configured Pi API host so LAN vs
 * Tailscale stay consistent. Fall back to hub-reported URLs.
 */
export function resolveWebrtcPlayUrl(
  piBaseUrl: string,
  start?: Pick<LiveStartResponse, 'webrtc_url' | 'webrtc'> | null
): string {
  const fromApiHost = webrtcPlayUrlFromPiBase(piBaseUrl);
  const urls: WebrtcUrls | undefined = start?.webrtc;

  try {
    const host = new URL(piBaseUrl).hostname.toLowerCase();
    const isTailscale =
      host.startsWith('100.') || host === 'mypi' || host.endsWith('.ts.net');

    if (urls) {
      // Explicit match first
      const candidates = [
        urls.lan,
        urls.tailscale_ip,
        urls.tailscale_host,
        start?.webrtc_url,
      ];
      for (const candidate of candidates) {
        if (!candidate) continue;
        try {
          if (new URL(candidate).hostname.toLowerCase() === host) {
            return candidate;
          }
        } catch {
          /* ignore bad URL */
        }
      }

      // Phone on Tailscale: prefer hub's Tailscale play URLs
      if (isTailscale) {
        if (urls.tailscale_ip) return urls.tailscale_ip;
        if (urls.tailscale_host) return urls.tailscale_host;
      }
    }
  } catch {
    /* ignore */
  }

  return fromApiHost;
}
