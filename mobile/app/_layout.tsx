import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import {
  SetupWizardProvider,
  useSetupWizard,
} from '@/context/SetupWizardContext';
import { initPushNotifications, registerFcmWithPi } from '@/lib/notifications';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <SetupWizardProvider>
        <RootLayoutNav />
      </SetupWizardProvider>
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const { isLoading: authLoading } = useAuth();
  const { isLoading: setupLoading, piHost } = useSetupWizard();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !setupLoading) {
      SplashScreen.hideAsync();
    }
  }, [authLoading, setupLoading]);

  useEffect(() => {
    if (authLoading || setupLoading || Platform.OS !== 'android') return;

    let remove: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const cleanup = await initPushNotifications(router);
      if (cancelled) {
        cleanup();
        return;
      }
      remove = cleanup;
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [authLoading, setupLoading, router]);

  useEffect(() => {
    if (authLoading || setupLoading || Platform.OS !== 'android' || !piHost) {
      return;
    }
    void registerFcmWithPi().catch(() => undefined);
  }, [authLoading, setupLoading, piHost]);

  if (authLoading || setupLoading) {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="login"
        options={{ title: 'Sign in', presentation: 'modal' }}
      />
    </Stack>
  );
}
