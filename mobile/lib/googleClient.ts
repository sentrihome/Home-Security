import Constants from 'expo-constants';

/**
 * Factory Web OAuth client baked into the app at build time.
 * Customers never copy this onto the Pi — the phone POSTs it over LAN
 * with the user's refresh token (README §18).
 */
export function getGoogleWebClient(): { clientId: string; clientSecret: string } {
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    googleWebClientId?: string;
    googleWebClientSecret?: string;
  };
  const clientId = (
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    extra.googleWebClientId ||
    ''
  ).trim();
  const clientSecret = (
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_SECRET ||
    extra.googleWebClientSecret ||
    ''
  ).trim();
  return { clientId, clientSecret };
}

export function googleWebClientReady(): boolean {
  const { clientId, clientSecret } = getGoogleWebClient();
  return Boolean(clientId && clientSecret);
}

/** Google refresh tokens look like `1//…`. Access tokens look like `ya29.…`. */
export function isGoogleRefreshToken(token: string | undefined | null): boolean {
  const t = (token || '').trim();
  return t.startsWith('1/') || t.startsWith('1//');
}
