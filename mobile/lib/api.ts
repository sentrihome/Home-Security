import { config, getPiBaseUrl } from '@/lib/config';
import type { EventClip, StreamStatus } from '@/types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  queryToken?: boolean;
  baseUrl?: string;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const baseUrl = options.baseUrl ?? config.cloudBaseUrl;
  const url = new URL(path.startsWith('http') ? path : `${baseUrl}${path}`);

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
    if (options.queryToken) {
      url.searchParams.set('token', options.token);
    }
  }

  const response = await fetch(url.toString(), {
    method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ApiError(text || `Request failed (${response.status})`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}

/** Cloud backend (port 3001) — legacy; clips path uses Drive directly. */
export const cloudApi = {
  status: (baseUrl?: string) =>
    request<{ ok?: boolean; status?: string }>('/status', { baseUrl }),

  me: (token: string, baseUrl?: string) =>
    request<{ email?: string }>('/api/auth/me', { token, baseUrl }),

  events: (token: string, baseUrl?: string) =>
    request<EventClip[]>('/api/events', { token, baseUrl }),

  linkDevice: (token: string, deviceId: string, baseUrl?: string) =>
    request('/api/devices/link', {
      method: 'POST',
      token,
      body: { deviceId },
      baseUrl,
    }),

  streamStatus: (deviceId: string, token?: string | null, baseUrl?: string) =>
    request<StreamStatus>(`/api/stream/status/${encodeURIComponent(deviceId)}`, {
      token,
      baseUrl,
    }),

  playlistUrl: (deviceId: string, token?: string | null, baseUrl?: string) => {
    const root = baseUrl ?? config.cloudBaseUrl;
    const url = new URL(`/api/stream/playlist/${encodeURIComponent(deviceId)}`, root);
    if (token) url.searchParams.set('token', token);
    return url.toString();
  },

  clipUrl: (eventId: string, token?: string | null, baseUrl?: string) => {
    const root = baseUrl ?? config.cloudBaseUrl;
    const url = new URL(`/api/clips/${encodeURIComponent(eventId)}`, root);
    if (token) url.searchParams.set('token', token);
    return url.toString();
  },

  thumbnailUrl: (eventId: string, token?: string | null, baseUrl?: string) => {
    const root = baseUrl ?? config.cloudBaseUrl;
    const url = new URL(`/api/clips/${encodeURIComponent(eventId)}/thumbnail`, root);
    if (token) url.searchParams.set('token', token);
    return url.toString();
  },

  /** Legacy cloud OAuth URL — prefer in-app Google AuthSession. */
  googleAuthUrl: (baseUrl?: string) =>
    `${baseUrl ?? config.cloudBaseUrl}/auth/google`,
};

/** Pi backend (port 4000) */
export const piApi = {
  health: (baseUrl?: string) =>
    request('/health', { baseUrl: baseUrl ?? getPiBaseUrl() }),

  start: (type: string, value = '', baseUrl?: string) =>
    request('/start', {
      method: 'POST',
      body: { type, value },
      baseUrl: baseUrl ?? getPiBaseUrl(),
    }),

  stop: (baseUrl?: string) =>
    request('/stop', {
      method: 'POST',
      baseUrl: baseUrl ?? getPiBaseUrl(),
    }),

  motion: (baseUrl?: string) =>
    request('/motion', {
      method: 'POST',
      baseUrl: baseUrl ?? getPiBaseUrl(),
    }),

  /** Hand off Google refresh token to Pi (LAN / Tailscale only). */
  authDrive: (
    body: { email: string; refresh_token: string },
    baseUrl?: string
  ) =>
    request<{ ok?: boolean; email?: string; error?: string }>('/auth/drive', {
      method: 'POST',
      body,
      baseUrl: baseUrl ?? getPiBaseUrl(),
    }),
};

