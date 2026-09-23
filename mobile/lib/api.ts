import { config, getPiBaseUrl } from '@/lib/config';
import type { EventClip, LiveStartResponse, StreamStatus } from '@/types';

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
  health: async (baseUrl?: string) => {
    const base = baseUrl ?? getPiBaseUrl();
    try {
      return await request<Record<string, unknown>>('/health', { baseUrl: base });
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
        return await request<Record<string, unknown>>('/status', { baseUrl: base });
      }
      throw error;
    }
  },

  start: (type: string, value = '', baseUrl?: string) =>
    request<LiveStartResponse>('/start', {
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

  /**
   * Hand Google Drive credentials to the Pi (LAN / Tailscale only).
   * Phone person: see DOCUMENTATION.md "Phone: Google Drive OAuth".
   */
  authDrive: (
    body: {
      refresh_token?: string;
      auth_code?: string;
      server_auth_code?: string;
      redirect_uri?: string;
      code_verifier?: string;
      email?: string;
      client_id?: string;
      client_secret?: string;
      folder_name?: string;
    },
    baseUrl?: string
  ) =>
    request<{ ok?: boolean; email?: string; linked?: boolean; error?: string }>(
      '/auth/drive',
      {
        method: 'POST',
        body,
        baseUrl: baseUrl ?? getPiBaseUrl(),
      }
    ),

  driveStatus: (baseUrl?: string) =>
    request<{
      linked?: boolean;
      email?: string | null;
      folder_name?: string;
      folder_id?: string | null;
      last_upload?: unknown;
      error?: string | null;
    }>('/auth/drive', { baseUrl: baseUrl ?? getPiBaseUrl() }),

  unlinkDrive: (baseUrl?: string) =>
    request<{ ok?: boolean; linked?: boolean }>('/auth/drive', {
      method: 'DELETE',
      baseUrl: baseUrl ?? getPiBaseUrl(),
    }),

  clipsCache: (baseUrl?: string) =>
    request<{
      clips?: { name: string; path?: string; size?: number; mtime?: number }[];
    }>('/clips/cache', { baseUrl: baseUrl ?? getPiBaseUrl() }),

  clipFileUrl: (name: string, baseUrl?: string) => {
    const root = (baseUrl ?? getPiBaseUrl()).replace(/\/$/, '');
    return `${root}/clips/file/${encodeURIComponent(name)}`;
  },

  /** Register Android FCM device token with the Pi. */
  registerFcm: (
    body: { token: string; platform: 'android' },
    baseUrl?: string
  ) =>
    request<{ ok?: boolean; error?: string }>('/auth/fcm', {
      method: 'POST',
      body,
      baseUrl: baseUrl ?? getPiBaseUrl(),
    }),
};

