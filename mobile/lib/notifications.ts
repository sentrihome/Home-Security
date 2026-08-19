import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router as expoRouter } from 'expo-router';

import { piApi } from '@/lib/api';
import { loadFcmToken, saveFcmToken } from '@/lib/storage';

type AppRouter = Pick<typeof expoRouter, 'push'>;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const ALERT_CHANNEL_ID = 'alerts';

export async function ensureAndroidAlertChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
    name: 'Home Security alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1d4ed8',
  });
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  await ensureAndroidAlertChannel();

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  return status === 'granted';
}

export async function getFcmToken(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  const token = await Notifications.getDevicePushTokenAsync();
  return typeof token.data === 'string' ? token.data : null;
}

/**
 * Upload FCM token to Pi if it changed (or force=true).
 * Returns a short status string for UI.
 */
export async function registerFcmWithPi(options?: {
  force?: boolean;
  baseUrl?: string;
}): Promise<string> {
  if (Platform.OS !== 'android') {
    return 'Push registration is Android-only.';
  }

  const granted = await requestNotificationPermissions();
  if (!granted) {
    return 'Notifications permission denied. Enable it in system Settings.';
  }

  const token = await getFcmToken();
  if (!token) {
    return 'Could not get FCM token. Rebuild with google-services.json (expo run:android).';
  }

  const previous = await loadFcmToken();
  if (!options?.force && previous === token) {
    return 'Push token already registered with Pi.';
  }

  await piApi.registerFcm({ token, platform: 'android' }, options?.baseUrl);
  await saveFcmToken(token);
  return 'Push token registered with Pi.';
}

/** Tap notification → Live tab. Call once from root layout. */
export function setupNotificationHandlers(router: AppRouter): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(() => {
    router.push('/');
  });
  return () => sub.remove();
}

/**
 * Permissions + handlers + best-effort Pi registration.
 * Safe to call on every cold start; ignores Pi errors until /auth/fcm exists.
 */
export async function initPushNotifications(
  router: AppRouter
): Promise<() => void> {
  if (Platform.OS !== 'android') {
    return () => undefined;
  }

  const remove = setupNotificationHandlers(router);
  await requestNotificationPermissions();

  try {
    await registerFcmWithPi();
  } catch {
    // Pi /auth/fcm may not exist yet — ignore until Step 3.
  }

  return remove;
}
