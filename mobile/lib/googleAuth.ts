import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

import { getGoogleWebClient } from '@/lib/googleClient';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Debug keystore SHA-1 used by `npx expo run:android` (android/app/debug.keystore). */
export const DEBUG_ANDROID_SHA1 =
  '5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25';

export type GoogleSignInResult = {
  accessToken: string;
  /** Present only when Google issued a real refresh token. */
  refreshToken?: string;
  /** Forward to the Pi over LAN if refresh_token is not yet available. */
  serverAuthCode?: string;
  email: string;
};

let configured = false;

function ensureConfigured() {
  if (configured) return;

  // webClientId MUST be an OAuth client of type "Web application" — never the Android client ID.
  const { clientId: webClientId } = getGoogleWebClient();

  GoogleSignin.configure({
    ...(webClientId ? { webClientId } : {}),
    scopes: [DRIVE_SCOPE, 'openid', 'profile', 'email'],
    // Only request offline/server auth code when a real Web client is configured.
    offlineAccess: Boolean(webClientId),
    forceCodeForRefreshToken: Boolean(webClientId),
  });
  configured = true;
}

/**
 * Native Google Sign-In (Android). No browser redirect — result returns to the app directly.
 * Requires a dev build: `npx expo run:android` (not Expo Go).
 *
 * Google Cloud Android OAuth client must use:
 * - Package: com.sinisterchiller.homesecurity
 * - SHA-1: see DEBUG_ANDROID_SHA1
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (Platform.OS !== 'android') {
    throw new Error('Google Drive sign-in is Android-only for now.');
  }

  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) {
    throw new Error('Google sign-in was cancelled.');
  }

  const email = response.data.user.email;
  if (!email) {
    throw new Error('Google did not return an email address.');
  }

  const tokens = await GoogleSignin.getTokens();
  const accessToken = tokens.accessToken;
  if (!accessToken) {
    throw new Error('Google did not return an access token.');
  }

  const serverAuthCode = response.data.serverAuthCode ?? undefined;
  let refreshToken = (await exchangeServerAuthCode(serverAuthCode ?? null)) ?? undefined;

  if (!refreshToken && !serverAuthCode) {
    throw new Error(
      'Google did not issue a refresh token or server auth code. Confirm the factory app has the Web client id/secret, then sign in again.'
    );
  }

  return { accessToken, refreshToken, serverAuthCode: refreshToken ? undefined : serverAuthCode, email };
}

async function exchangeServerAuthCode(
  serverAuthCode: string | null
): Promise<string | null> {
  if (!serverAuthCode) return null;

  const { clientId, clientSecret } = getGoogleWebClient();
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    code: serverAuthCode,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { refresh_token?: string };
  return data.refresh_token ?? null;
}

export async function signOutGoogle(): Promise<void> {
  try {
    ensureConfigured();
    await GoogleSignin.signOut();
  } catch {
    // Ignore — local session clear still proceeds.
  }
}

/** Fresh Google access token for Drive list/play (same account as sign-in). */
export async function getDriveAccessToken(): Promise<string> {
  ensureConfigured();
  const tokens = await GoogleSignin.getTokens();
  if (!tokens.accessToken) {
    throw new Error('Google access token missing — sign in again.');
  }
  return tokens.accessToken;
}

export function formatGoogleSignInError(error: unknown): string {
  if (isErrorWithCode(error)) {
    const code = String(error.code);
    const msg = error.message || '';

    if (
      code === '10' ||
      code === 'DEVELOPER_ERROR' ||
      msg.includes('DEVELOPER_ERROR') ||
      msg.includes('Developer console')
    ) {
      return (
        `DEVELOPER_ERROR: Google Cloud Android client SHA-1 must be ${DEBUG_ANDROID_SHA1} ` +
        `and package com.sinisterchiller.homesecurity. ` +
        `Do not put the Android client ID in webClientId — create a Web client if you need offline tokens.`
      );
    }

    switch (error.code) {
      case statusCodes.IN_PROGRESS:
        return 'Sign-in already in progress.';
      case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
        return 'Google Play Services unavailable or outdated.';
      case statusCodes.SIGN_IN_CANCELLED:
        return 'Sign-in cancelled.';
      default:
        return msg || `Google sign-in error (${code})`;
    }
  }
  return error instanceof Error ? error.message : 'Google sign-in failed';
}

/** Native Google Sign-In is ready on Android (package/SHA-1 are validated by Google at runtime). */
export function isGoogleSignInReady(): boolean {
  return Platform.OS === 'android';
}
