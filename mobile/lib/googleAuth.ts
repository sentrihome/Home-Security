import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * Android-only Google OAuth for Drive.
 * Use a dev build (`npx expo run:android`), not Expo Go.
 */
export function useGoogleDriveAuth() {
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: androidClientId || undefined,
    scopes: [DRIVE_SCOPE, 'openid', 'profile', 'email'],
    extraParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  });

  return {
    request,
    response,
    promptAsync,
    ready: Boolean(androidClientId && request),
  };
}

/** Fetch email from Google userinfo using the access token. */
export async function fetchGoogleEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo failed (${res.status})`);
  }
  const data = (await res.json()) as { email?: string };
  if (!data.email) throw new Error('No email returned by Google');
  return data.email;
}

