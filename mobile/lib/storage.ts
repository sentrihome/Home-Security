import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { AuthSession } from '@/types';

const SESSION_KEY = 'homesecurity.auth.session';
const CLOUD_URL_KEY = 'homesecurity.cloud.baseUrl';
const ESP_RANDOM_PASS_KEY = 'homesecurity.esp.randomPass';

async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string) {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string) {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function saveSession(session: AuthSession) {
  await setItem(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<AuthSession | null> {
  const raw = await getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export async function clearSession() {
  await deleteItem(SESSION_KEY);
}

export async function saveCloudBaseUrl(url: string) {
  await setItem(CLOUD_URL_KEY, url);
}

export async function loadCloudBaseUrl(): Promise<string | null> {
  return getItem(CLOUD_URL_KEY);
}

export async function saveEspRandomPassword(pass: string) {
  await setItem(ESP_RANDOM_PASS_KEY, pass);
}

export async function loadEspRandomPassword(): Promise<string | null> {
  return getItem(ESP_RANDOM_PASS_KEY);
}

export async function clearEspRandomPassword() {
  await deleteItem(ESP_RANDOM_PASS_KEY);
}

