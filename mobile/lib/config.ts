/**
 * Backend URLs for the Home Security stack.
 *
 * Cloud backend (port 3001): events, clips, auth, HLS playlist
 * Pi backend (port 4000): start/stop stream, motion trigger
 *
 * Android emulator → host machine: use 10.0.2.2 instead of localhost
 * iOS simulator → host machine: localhost works
 * Physical device: use your LAN IP or ngrok URL
 */
import { Platform } from 'react-native';

const localhost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

/** Known static Pi LAN address after SoftAP provisioning. */
export const DEFAULT_PI_HOST = '192.168.0.236';

/** SoftAP gateway while the phone is on HomeSecurity-Setup. */
export const PI_SOFTAP_BASE_URL = 'http://10.42.0.1:4000';

export function normalizePiHost(host: string): string {
  return host
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
    .replace(/:4000$/i, '');
}

export function computePiBaseUrl(host: string): string {
  const normalized = normalizePiHost(host);
  if (!normalized) {
    return `http://${DEFAULT_PI_HOST}:4000`;
  }
  if (/^https?:\/\//i.test(host.trim())) {
    return host.trim().replace(/\/$/, '');
  }
  return `http://${normalized}:4000`;
}

let piBaseUrlOverride: string | null = null;

export function setPiBaseUrlOverride(baseUrl: string | null) {
  piBaseUrlOverride = baseUrl?.trim().replace(/\/$/, '') || null;
}

export function getPiBaseUrl(): string {
  return piBaseUrlOverride ?? config.piBaseUrl;
}

export const config = {
  cloudBaseUrl: process.env.EXPO_PUBLIC_CLOUD_URL ?? `http://${localhost}:3001`,
  piBaseUrl: process.env.EXPO_PUBLIC_PI_URL ?? `http://${DEFAULT_PI_HOST}:4000`,
  appScheme: 'homesecurity',
} as const;

export type AppConfig = typeof config;
