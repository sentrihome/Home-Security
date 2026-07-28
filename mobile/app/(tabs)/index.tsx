import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Link } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/context/AuthContext';
import { cloudApi, piApi } from '@/lib/api';
import { config } from '@/lib/config';

export default function LiveScreen() {
  const { isLoggedIn, session, cloudBaseUrl } = useAuth();
  const [status, setStatus] = useState('Idle');
  const [busy, setBusy] = useState(false);

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(true);
    setStatus(`${label}…`);
    try {
      await action();
      setStatus(`${label} — OK`);
    } catch (error) {
      setStatus(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Live stream"
      subtitle="Control the Pi stream and check cloud HLS status.">
      {!isLoggedIn ? (
        <View style={styles.card}>
          <Text style={styles.cardText}>
            Sign in to load private stream status and clip-backed URLs.
          </Text>
          <Link href="/login" asChild>
            <PrimaryButton label="Sign in" />
          </Link>
        </View>
      ) : (
        <Text style={styles.meta}>Signed in as {session?.email}</Text>
      )}

      <View style={styles.card}>
        <Text style={styles.section}>Pi backend</Text>
        <Text style={styles.meta}>{config.piBaseUrl}</Text>
        <PrimaryButton
          label="Start webcam stream"
          loading={busy}
          onPress={() => run('Start stream', () => piApi.start('webcam'))}
        />
        <PrimaryButton
          label="Stop stream"
          variant="secondary"
          loading={busy}
          onPress={() => run('Stop stream', () => piApi.stop())}
        />
        <PrimaryButton
          label="Trigger motion"
          variant="secondary"
          loading={busy}
          onPress={() => run('Motion', () => piApi.motion())}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Cloud backend</Text>
        <Text style={styles.meta}>{cloudBaseUrl}</Text>
        <PrimaryButton
          label="Check /status"
          variant="secondary"
          loading={busy}
          onPress={() =>
            run('Cloud status', async () => {
              const result = await cloudApi.status(cloudBaseUrl);
              setStatus(`Cloud status — ${JSON.stringify(result)}`);
            })
          }
        />
        <Text style={styles.hint}>
          HLS player wiring belongs here next: use cloudApi.playlistUrl(deviceId, token).
        </Text>
      </View>

      <Text style={styles.status}>{status}</Text>
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
  cardText: {
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    fontSize: 17,
    fontWeight: '600',
  },
  meta: {
    fontSize: 13,
    opacity: 0.65,
  },
  hint: {
    fontSize: 13,
    opacity: 0.55,
    lineHeight: 18,
  },
  status: {
    fontSize: 13,
    opacity: 0.75,
  },
});
