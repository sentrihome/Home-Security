import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/context/AuthContext';
import {
  formatGoogleSignInError,
  isGoogleSignInReady,
  signInWithGoogle,
} from '@/lib/googleAuth';

/**
 * Android Google Sign-In (native). Grants Drive access for Pi handoff.
 */
export default function LoginScreen() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = isGoogleSignInReady();

  async function handleGoogleSignIn() {
    setBusy(true);
    setError('');
    try {
      const { accessToken, refreshToken, email } = await signInWithGoogle();
      await signIn({ token: accessToken, refreshToken, email });
      router.back();
    } catch (err) {
      setError(formatGoogleSignInError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Sign in"
      subtitle="Android Google Sign-In (dev build). Grants Drive access for Pi handoff.">
      <View style={styles.card}>
        <Text style={styles.hint}>
          Use npx expo run:android — not Expo Go. Native Google sheet (no browser redirect).
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          label="Sign in with Google"
          loading={busy}
          disabled={!ready}
          onPress={handleGoogleSignIn}
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
