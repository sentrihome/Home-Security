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

export const config = {
  cloudBaseUrl: process.env.EXPO_PUBLIC_CLOUD_URL ?? `http://${localhost}:3001`,
  piBaseUrl: process.env.EXPO_PUBLIC_PI_URL ?? `http://${localhost}:4000`,
  appScheme: 'homesecurity',
} as const;

export type AppConfig = typeof config;
