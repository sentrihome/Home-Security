import { useEffect, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { Link, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Text, View } from '@/components/Themed';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/context/AuthContext';
import { useSetupWizard } from '@/context/SetupWizardContext';
import { cloudApi } from '@/lib/api';
import { config } from '@/lib/config';

export default function SettingsScreen() {
  const { session, isLoggedIn, cloudBaseUrl, setCloudBaseUrl, signOut } = useAuth();
  const { piHost, piBaseUrl, setPiHost } = useSetupWizard();
  const [urlDraft, setUrlDraft] = useState(cloudBaseUrl);
  const [piHostDraft, setPiHostDraft] = useState(piHost);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setPiHostDraft(piHost);
  }, [piHost]);

  async function saveUrl() {
    await setCloudBaseUrl(urlDraft);
    setMessage('Cloud URL saved.');
  }

  async function savePiHostUrl() {
    await setPiHost(piHostDraft);
    setMessage('Pi host saved.');
  }

  async function openGoogleAuth() {
    const authUrl = cloudApi.googleAuthUrl(cloudBaseUrl);
    await WebBrowser.openBrowserAsync(authUrl);
    setMessage(
      'Complete Google sign-in in the browser, then paste the token on the Sign in screen (OAuth deep-link wiring comes next).'
    );
  }

  return (
    <Screen title="Settings" subtitle="Cloud backend and account.">
      <View style={styles.card}>
        <Text style={styles.section}>Account</Text>
        {isLoggedIn ? (
          <>
            <Text style={styles.meta}>Signed in as {session?.email}</Text>
            <PrimaryButton
              label="Sign out"
              variant="danger"
              onPress={async () => {
                await signOut();
                setMessage('Signed out.');
              }}
            />
          </>
        ) : (
          <>
            <Text style={styles.meta}>Not signed in</Text>
            <Link href="/login" asChild>
              <PrimaryButton label="Sign in" />
            </Link>
            <PrimaryButton
              label="Open Google OAuth"
              variant="secondary"
              onPress={openGoogleAuth}
            />
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Cloud base URL</Text>
        <Text style={styles.hint}>
          Emulator: http://10.0.2.2:3001 · Simulator: http://localhost:3001 · Device: ngrok / LAN
        </Text>
        <TextInput
          value={urlDraft}
          onChangeText={setUrlDraft}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <PrimaryButton label="Save URL" onPress={saveUrl} />
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Pi host / IP</Text>
        <Text style={styles.hint}>
          Static LAN address of the Raspberry Pi (port 4000). Saved from SoftAP setup or
          edit manually here.
        </Text>
        <TextInput
          value={piHostDraft}
          onChangeText={setPiHostDraft}
          placeholder="192.168.0.236"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Text style={styles.meta}>Resolved: {piBaseUrl}</Text>
        <PrimaryButton label="Save Pi host" onPress={savePiHostUrl} />
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Defaults</Text>
        <Text style={styles.meta}>Scheme: {config.appScheme}</Text>
        <PrimaryButton
          label="Go to live"
          variant="secondary"
          onPress={() => router.push('/')}
        />
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}
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
  section: {
    fontSize: 17,
    fontWeight: '600',
  },
  meta: {
    fontSize: 14,
    opacity: 0.7,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  message: {
    fontSize: 13,
    opacity: 0.75,
  },
});
