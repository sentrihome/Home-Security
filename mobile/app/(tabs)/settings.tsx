import { useEffect, useState } from 'react';
import { Platform, StyleSheet, TextInput } from 'react-native';
import { Link, router } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { Text, View } from '@/components/Themed';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/context/AuthContext';
import { useSetupWizard } from '@/context/SetupWizardContext';
import { config, PI_LAN_HOST, TAILSCALE_PI_HOST } from '@/lib/config';
import { registerFcmWithPi } from '@/lib/notifications';

export default function SettingsScreen() {
  const { session, isLoggedIn, cloudBaseUrl, setCloudBaseUrl, signOut } = useAuth();
  const { piHost, piBaseUrl, setPiHost } = useSetupWizard();
  const [urlDraft, setUrlDraft] = useState(cloudBaseUrl);
  const [piHostDraft, setPiHostDraft] = useState(piHost);
  const [message, setMessage] = useState('');
  const [notifStatus, setNotifStatus] = useState('Checking…');
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    setPiHostDraft(piHost);
  }, [piHost]);

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'android') {
        setNotifStatus('Android only');
        return;
      }
      const p = await Notifications.getPermissionsAsync();
      setNotifStatus(
        p.status === 'granted' ? 'Allowed' : `Not allowed (${p.status})`
      );
    })();
  }, []);

  async function saveUrl() {
    await setCloudBaseUrl(urlDraft);
    setMessage('Cloud URL saved.');
  }

  async function savePiHostUrl() {
    await setPiHost(piHostDraft);
    setMessage('Pi host saved.');
  }

  async function reregisterPush() {
    setPushBusy(true);
    setMessage('');
    try {
      const msg = await registerFcmWithPi({ force: true });
      const p = await Notifications.getPermissionsAsync();
      setNotifStatus(
        p.status === 'granted' ? 'Allowed' : `Not allowed (${p.status})`
      );
      setMessage(msg);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Push registration failed');
    } finally {
      setPushBusy(false);
    }
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
              <PrimaryButton label="Sign in with Google" />
            </Link>
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
          Home LAN first ({PI_LAN_HOST}). Switch to Tailscale ({TAILSCALE_PI_HOST}) when you
          are away. API uses port 4000; live video uses port 8889 on the same host.
        </Text>
        <TextInput
          value={piHostDraft}
          onChangeText={setPiHostDraft}
          placeholder={PI_LAN_HOST}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Text style={styles.meta}>Resolved: {piBaseUrl}</Text>
        <PrimaryButton label="Save Pi host" onPress={savePiHostUrl} />
        <PrimaryButton
          label={`Use LAN (${PI_LAN_HOST})`}
          variant="secondary"
          onPress={async () => {
            setPiHostDraft(PI_LAN_HOST);
            await setPiHost(PI_LAN_HOST);
            setMessage('Using home LAN.');
          }}
        />
        <PrimaryButton
          label={`Use Tailscale (${TAILSCALE_PI_HOST})`}
          variant="secondary"
          onPress={async () => {
            setPiHostDraft(TAILSCALE_PI_HOST);
            await setPiHost(TAILSCALE_PI_HOST);
            setMessage('Using Tailscale.');
          }}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Notifications (Android)</Text>
        <Text style={styles.meta}>Permission: {notifStatus}</Text>
        <Text style={styles.hint}>
          Required for motion alerts. Use a dev build (expo run:android), not Expo Go. Pi
          must expose POST /auth/fcm (Step 3).
        </Text>
        <PrimaryButton
          label="Re-register push token"
          loading={pushBusy}
          onPress={reregisterPush}
        />
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
