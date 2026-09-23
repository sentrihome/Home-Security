/**
 * ESP HTTP client for SoftAP pairing.
 *
 * Phone must be joined to SoftAP `espwifi` (password `23012003`), then talk to
 * http://192.168.4.1 — firmware exposes only:
 *   GET  /health
 *   POST /pair   (application/json)
 */

export const ESP_BASE = 'http://192.168.4.1';
export const ESP_SOFTAP_SSID = 'espwifi';
export const ESP_SOFTAP_PASSWORD = '23012003';

const DEFAULT_TIMEOUT_MS = 8000;
/** /pair waits on UART + Station Wi-Fi join; allow extra headroom. */
const PAIR_TIMEOUT_MS = 20000;

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

async function getText(
  path: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string> {
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

async function postJson(
  path: string,
  body: unknown,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${ESP_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain',
      },
      body: JSON.stringify(body),
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

/** JSON body for POST /pair — keys must match firmware (lowercase). */
export type PairPayload = {
  homessid: string;
  homepass: string;
  permpass: string;
  encryptedpass: string;
  schedulestart: string;
  schedulestop: string;
  raspberrypiip: string;
  /** Optional; forwarded in raw JSON if Station/AP starts using it. */
  securitykey?: string;
};

export type PairResponse = {
  raw: string;
  /** true / false when firmware reports Station Wi-Fi join result */
  wifiConnection?: boolean;
  /** Present on successful join; SoftAP rotate may still be disabled in firmware */
  newApPassword?: string;
  /** e.g. received | NO ACCESS | corrupted | INVALID JSON */
  pairingStatus?: string;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseWifiConnectionFlag(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return undefined;
}

export function parsePairResponse(raw: string): PairResponse {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const pairingStatus =
      asString(parsed['pairing payload']) ??
      asString(parsed['pairing payload received']);
    return {
      raw,
      wifiConnection: parseWifiConnectionFlag(parsed.wifiConnection),
      newApPassword: asString(parsed.new_ap_password),
      pairingStatus,
    };
  } catch {
    return { raw, pairingStatus: raw.trim() || undefined };
  }
}

export async function health(): Promise<string> {
  return getText('/health');
}

/**
 * Send the full pairing config in one shot. Phone must stay on espwifi until
 * the response returns (or times out).
 */
export async function pair(payload: PairPayload): Promise<PairResponse> {
  const body: Record<string, string> = {
    homessid: cleanInput(payload.homessid),
    homepass: cleanInput(payload.homepass),
    permpass: cleanInput(payload.permpass),
    encryptedpass: cleanInput(payload.encryptedpass),
    schedulestart: cleanInput(payload.schedulestart),
    schedulestop: cleanInput(payload.schedulestop),
    raspberrypiip: cleanInput(payload.raspberrypiip),
  };
  if (payload.securitykey != null && cleanInput(payload.securitykey)) {
    body.securitykey = cleanInput(payload.securitykey);
  }

  const raw = await postJson('/pair', body, PAIR_TIMEOUT_MS);
  return parsePairResponse(raw);
}
