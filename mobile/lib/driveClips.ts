import { getDriveAccessToken } from '@/lib/googleAuth';

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
export const DRIVE_FOLDER_NAME = 'SentriHome';

export type DriveClip = {
  id: string;
  name: string;
  createdTime?: string;
  size?: number;
  webViewLink?: string;
  thumbnailLink?: string;
  source: 'drive';
};

async function driveGet<T>(pathAndQuery: string, token: string): Promise<T> {
  const res = await fetch(`${DRIVE_FILES}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `Drive HTTP ${res.status}`);
  }
  return JSON.parse(text) as T;
}

async function findSentriHomeFolder(token: string): Promise<string | null> {
  const q = encodeURIComponent(
    `name = '${DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const data = await driveGet<{ files?: { id: string }[] }>(
    `?q=${q}&fields=files(id,name)&pageSize=1&spaces=drive`,
    token
  );
  return data.files?.[0]?.id ?? null;
}

/**
 * List clips in the user's SentriHome Drive folder (architecture §17).
 * Works on cellular — does not use the Pi.
 */
export async function listDriveClips(): Promise<DriveClip[]> {
  const token = await getDriveAccessToken();
  const folderId = await findSentriHomeFolder(token);
  if (!folderId) {
    return [];
  }
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const fields = encodeURIComponent(
    'files(id,name,createdTime,modifiedTime,size,webViewLink,thumbnailLink,mimeType)'
  );
  const data = await driveGet<{
    files?: {
      id: string;
      name: string;
      createdTime?: string;
      modifiedTime?: string;
      size?: string;
      webViewLink?: string;
      thumbnailLink?: string;
      mimeType?: string;
    }[];
  }>(`?q=${q}&fields=${fields}&orderBy=createdTime desc&pageSize=50`, token);

  return (data.files ?? [])
    .filter((f) => (f.mimeType || '').startsWith('video/') || /\.mp4$/i.test(f.name))
    .map((f) => ({
      id: f.id,
      name: f.name,
      createdTime: f.createdTime || f.modifiedTime,
      size: f.size ? Number(f.size) : undefined,
      webViewLink: f.webViewLink,
      thumbnailLink: f.thumbnailLink,
      source: 'drive' as const,
    }));
}
