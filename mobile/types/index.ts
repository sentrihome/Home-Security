export type AuthSession = {
  token: string;
  email: string;
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
