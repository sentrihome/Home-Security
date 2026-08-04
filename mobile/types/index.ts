export type AuthSession = {
  /** Google access token (short-lived); app uses this for Drive later. */
  token: string;
  email: string;
  /** Google refresh token — sent to the Pi via POST /auth/drive. */
  refreshToken: string;
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

export type DeviceLinkRequest = {
  deviceId: string;
};
