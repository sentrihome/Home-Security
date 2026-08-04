import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/context/AuthContext';
import { fetchGoogleEmail, useGoogleDriveAuth } from '@/lib/googleAuth';

/**
 * Android Google OAuth (dev build). Grants Drive access for Pi handoff.
 */
export default function LoginScreen() {
  const { signIn } = useAuth();
  const { response, promptAsync, ready } = useGoogleDriveAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (response?.type !== 'success') return;

    const accessToken = response.authentication?.accessToken;
    const refreshToken = response.authentication?.refreshToken;
    if (!accessToken || !refreshToken) {
      setError(
        'No refresh token from Google. Revoke app access at myaccount.google.com/permissions and try again.'
      );
      return;
    }

    let cancelled = false;
    (async () => {
      setBusy(true);
      setError('');
      try {
        const email = await fetchGoogleEmail(accessToken);
        if (cancelled) return;
        await signIn({ token: accessToken, refreshToken, email });
        router.back();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Sign-in failed');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [response, signIn]);

  return (
    <Screen
      title="Sign in"
      subtitle="Android Google OAuth (dev build). Grants Drive access for Pi handoff.">
      <View style={styles.card}>
        <Text style={styles.hint}>
          Use npx expo run:android — not Expo Go.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          label="Sign in with Google"
          loading={busy}
          disabled={!ready}
          onPress={() => promptAsync()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.7,
  },
  error: {
    color: '#b91c1c',
    fontSize: 13,
  },
});
