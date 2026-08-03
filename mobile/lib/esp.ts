/**
 * ESP HTTP client for the pairing/setup flow.
 *
 * Talks to the ESP's SoftAP directly at http://192.168.4.1 while the phone is
 * joined to either "ESP32_Master_Config" (main setup) or "ESPMODULE" (module pairing).
 *
 * Endpoint paths currently being renamed by the firmware team — empty-string
 * placeholders below will be filled in as those renames are confirmed.
 *
 * Ported from:
 *   ESP32PairingApp/app/src/main/java/com/example/esp32pairingapp/network/EspHttpClient.kt
 *
 * Every request body is application/x-www-form-urlencoded (NOT JSON).
 */

export const ESP_BASE = 'http://192.168.4.1';

const DEFAULT_TIMEOUT_MS = 8000;

export class EspError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'EspError';
    this.status = status;
  }
}

export function cleanInput(value: string): string {
  return value.trim().replace(/\p{C}/gu, '');
}

function enc(value: string): string {
  return encodeURIComponent(cleanInput(value));
}

function ensurePath(path: string, caller: string) {
  if (!path) {
    throw new EspError(
      `${caller}: endpoint path is not configured. Update lib/esp.ts with the new firmware path.`
    );
  }
}

async function getText(
  path: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string> {
  ensurePath(path, 'GET');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${ESP_BASE}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json, text/plain' },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new EspError(
        `GET ${path} failed: HTTP ${response.status}`,
        response.status
      );
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function postForm(
  path: string,
  body: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string> {
  ensurePath(path, 'POST');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${ESP_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/plain',
      },
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new EspError(
        `POST ${path} failed: HTTP ${response.status}`,
        response.status
      );
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Endpoints that restart Wi-Fi mid-response can drop the socket before we finish
 * reading the response. Treat those drops as success — the ESP received the
 * request before it tore Wi-Fi down.
 */
async function postFormTolerant(path: string, body: string): Promise<string> {
  try {
    return await postForm(path, body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('Network request failed') ||
      msg.includes('aborted') ||
      msg.includes('The operation was aborted') ||
      msg.includes('Connection reset')
    ) {
      return 'OK';
    }
    throw err;
  }
}

export type WifiStatusResponse = {
  connected: boolean;
  ip?: string;
  state?: string;
  reason?: string;
};

// ── Endpoints ────────────────────────────────────────────────────────────────
// Empty-string paths are placeholders awaiting firmware confirmation.

export async function health(): Promise<string> {
  return getText('/health');
}

export async function wifiStatus(): Promise<WifiStatusResponse> {
  const raw = await getText('');
  try {
    const parsed = JSON.parse(raw);
    return {
      connected: Boolean(parsed.connected),
      ip: typeof parsed.ip === 'string' ? parsed.ip : undefined,
      state: typeof parsed.state === 'string' ? parsed.state : undefined,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
    };
  } catch {
    return { connected: false, state: raw.trim() };
  }
}

export async function sendSsid(ssid: string): Promise<string> {
  return postForm('/ssid', `ssid=${enc(ssid)}`);
}

export async function sendPass(pass: string): Promise<string> {
  return postForm('/pass', `password=${enc(pass)}`);
}

/** Rotates the ESP SoftAP password. Restarts Wi-Fi — socket may drop mid-response. */
export async function sendEncryptedPass(pass: string): Promise<string> {
  return postFormTolerant('/encryptedpass', `encryptedpass=${enc(pass)}`);
}

export async function sendPermanentPass(pass: string): Promise<string> {
  return postForm('/permanentpass', `permanentpass=${enc(pass)}`);
}

export async function sendOneTimePass(otp: string): Promise<string> {
  return postForm('/otp', `otp=${enc(otp)}`);
}

/**
 * Sent while the phone is joined to the module's AP (ESPMODULE). The module then
 * uses this password to join the main ESP going forward.
 */
export async function sendMainConnection(pass: string): Promise<string> {
  return postForm('', `pass=${enc(pass)}`);
}

export async function sendSchedule(
  start: string,
  stop: string
): Promise<string> {
  return postForm('/schedule', `schedulestart=${enc(start)}&schedulestop=${enc(stop)}`);
}

