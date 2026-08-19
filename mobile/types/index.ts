export type AuthSession = {
  /** Google access token (short-lived); app uses this for Drive later. */
  token: string;
  email: string;
  /** Google refresh token handed to the Pi via POST /auth/drive. */
  refreshToken?: string;
};

export type EventClip = {
  _id: string;
  createdAt?: string;
  ownerEmail?: string;
  deviceId?: string;
  s3Key?: string;
  thumbnailS3Key?: string;
  [key: string]: unknown;
};

export type StreamStatus = {
  live?: boolean;
  deviceId?: string;
  [key: string]: unknown;
};

export type WebrtcUrls = {
  lan?: string;
  tailscale_ip?: string;
  tailscale_host?: string;
};

/** Response from Pi `POST /start` (MediaMTX WebRTC live session). */
export type LiveStartResponse = {
  ok?: boolean;
  streaming?: boolean;
  error?: string;
  webrtc_url?: string;
  webrtc?: WebrtcUrls;
  [key: string]: unknown;
};

export type DeviceLinkRequest = {
  deviceId: string;
};
