import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/context/AuthContext';
import { cloudApi } from '@/lib/api';

/**
 * Dev-friendly sign-in until OAuth deep links are wired.
 * Paste the Bearer token returned by the cloud backend after Google OAuth.
 */
export default function LoginScreen() {
  const { cloudBaseUrl, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!token.trim()) {
      setError('Token is required.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      let resolvedEmail = email.trim();
      if (!resolvedEmail) {
        const me = await cloudApi.me(token.trim(), cloudBaseUrl);
        resolvedEmail = me.email ?? 'unknown';
      }
      await signIn({ token: token.trim(), email: resolvedEmail });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Sign in"
      subtitle="Use a cloud auth token (OAuth deep-link flow can replace this).">
      <View style={styles.card}>
        <Text style={styles.label}>Email (optional if /api/auth/me works)</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          style={styles.input}
        />
        <Text style={styles.label}>Bearer token</Text>
        <TextInput
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="paste token"
          style={[styles.input, styles.token]}
          multiline
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton label="Save session" loading={busy} onPress={submit} />
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
  label: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  token: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  error: {
    color: '#b91c1c',
    fontSize: 13,
  },
});
