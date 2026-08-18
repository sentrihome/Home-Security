import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { LivePlayer } from '@/components/ui/LivePlayer';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { useSetupWizard } from '@/context/SetupWizardContext';
import { piApi } from '@/lib/api';
import { resolveWebrtcPlayUrl } from '@/lib/webrtc';

export default function LiveScreen() {
  const { piBaseUrl } = useSetupWizard();
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('Open this tab on home Wi‑Fi or Tailscale to watch.');
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);

  const startLive = useCallback(async () => {
    setBusy(true);
    setStatus('Starting live session…');
    try {
      const result = await piApi.start('app', '', piBaseUrl);
      if (result?.ok === false) {
        throw new Error(result.error || 'Publisher failed');
      }
      const url = resolveWebrtcPlayUrl(piBaseUrl, result);
      setPlayUrl(url);
      setStreaming(true);
      setStatus(`Live — ${url}`);
    } catch (error) {
      setPlayUrl(null);
      setStreaming(false);
      setStatus(
        `Start failed: ${error instanceof Error ? error.message : String(error)}. ` +
          'Check Pi URL in Setup/Settings and that MediaMTX is running.'
      );
    } finally {
      setBusy(false);
    }
  }, [piBaseUrl]);

  const stopLive = useCallback(async () => {
    setBusy(true);
    try {
      await piApi.stop(piBaseUrl);
      setStatus('Stopped');
    } catch (error) {
      setStatus(`Stop failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPlayUrl(null);
      setStreaming(false);
      setBusy(false);
    }
  }, [piBaseUrl]);

  useFocusEffect(
    useCallback(() => {
      void startLive();

      return () => {
        setPlayUrl(null);
        setStreaming(false);
        void piApi.stop(piBaseUrl).catch(() => {
          /* ignore — tab left */
        });
      };
    }, [piBaseUrl, startLive])
  );

  return (
    <Screen
      title="Live stream"
      subtitle="Pi WebRTC over LAN or Tailscale (MediaMTX :8889)."
      scroll={false}
      style={styles.screen}>
      <Text style={styles.meta}>{piBaseUrl}</Text>

      {playUrl && streaming ? (
        <LivePlayer
          url={playUrl}
          onError={(message) => setStatus(`Player: ${message}`)}
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            {busy
              ? 'Connecting…'
              : status.startsWith('Start failed')
                ? 'Could not start — see error below'
                : 'Stream not active'}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <PrimaryButton
          label={streaming ? 'Refresh stream' : 'Start stream'}
          loading={busy}
          onPress={() => void startLive()}
        />
        <PrimaryButton
          label="Stop stream"
          variant="secondary"
          loading={busy}
          disabled={!streaming}
          onPress={() => void stopLive()}
        />
        <PrimaryButton
          label="Trigger motion clip"
          variant="secondary"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            setStatus('Motion…');
            try {
              await piApi.motion(piBaseUrl);
              setStatus('Motion — clip requested');
            } catch (error) {
              setStatus(
                `Motion failed: ${error instanceof Error ? error.message : String(error)}`
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>

      <Text style={styles.status}>{status}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: 12,
  },
  meta: {
    fontSize: 13,
    opacity: 0.65,
  },
  placeholder: {
    flex: 1,
    minHeight: 240,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
  },
  placeholderText: {
    color: '#e2e8f0',
    fontSize: 15,
  },
  actions: {
    gap: 10,
  },
  status: {
    fontSize: 13,
    opacity: 0.75,
  },
});
