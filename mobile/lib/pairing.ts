/**
 * Utilities for ESP pairing: random SoftAP password + 8-digit OTP +
 * permanent-password validation.
 *
 * Ported from:
 *   ESP32PairingApp/app/src/main/java/com/example/esp32pairingapp/pairing/PasswordGenerator.kt
 *   ESP32PairingApp/app/src/main/java/com/example/esp32pairingapp/pairing/OtpGenerator.kt
 *
 * Pure functions — no React, no fetch, no side effects.
 */

const RANDOM_PASS_CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const DEFAULT_RANDOM_PASS_LENGTH = 16;

/**
 * Random alphanumeric password. WPA2 requires 8..63 chars; default is 16.
 * Uses Math.random — good enough for a local SoftAP password that the user
 * will only ever see once and the ESP stores verbatim.
 */
export function generateRandomPassword(
  length: number = DEFAULT_RANDOM_PASS_LENGTH
): string {
  if (length < 8 || length > 63) {
    throw new Error(
      'Password length must be between 8 and 63 (WPA2 requirement).'
    );
  }
  let out = '';
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * RANDOM_PASS_CHARSET.length);
    out += RANDOM_PASS_CHARSET[idx];
  }
  return out;
}

/**
 * Random 8-digit numeric OTP. Range: 10000000..99999999 (no leading zero).
 */
export function generateOtp(): string {
  const n = Math.floor(Math.random() * 90_000_000) + 10_000_000;
  return String(n);
}

/**
 * Keypad-set permanent password: only characters reachable on the 4x4 keypad
 * wired to the ESP main are allowed. Must be exactly 8 characters.
 */
export const PERMANENT_PASS_ALLOWED: ReadonlySet<string> = new Set([
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'A', 'B', 'C', 'D',
  '#', '*',
]);

export const PERMANENT_PASS_LENGTH = 8;

export function isValidPermanentPass(value: string): boolean {
  if (value.length !== PERMANENT_PASS_LENGTH) return false;
  for (const ch of value) {
    if (!PERMANENT_PASS_ALLOWED.has(ch)) return false;
  }
  return true;
}

