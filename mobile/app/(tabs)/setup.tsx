import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/context/AuthContext';
import { cloudApi } from '@/lib/api';

/**
 * Framework stub for ESP32 / device pairing.
 * Wire BLE / SoftAP flows from ESP32PairingApp here later.
 */
export default function SetupScreen() {
  const { isLoggedIn, session, cloudBaseUrl } = useAuth();
  const [deviceId, setDeviceId] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function linkDevice() {
    if (!session?.token) {
      setStatus('Sign in first.');
      return;
    }
    if (!deviceId.trim()) {
      setStatus('Enter a device ID.');
      return;
    }

    setBusy(true);
    try {
      await cloudApi.linkDevice(session.token, deviceId.trim(), cloudBaseUrl);
      setStatus(`Linked device ${deviceId.trim()}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Link failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Device setup"
      subtitle="Pair ESP32 / Pi devices and link them to your account.">
      <View style={styles.card}>
        <Text style={styles.section}>Pairing (stub)</Text>
        <Text style={styles.hint}>
          Port the native SoftAP / BLE pairing from ESP32PairingApp into this
          screen. For now you can link an existing device ID to your cloud account.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Link device</Text>
        {!isLoggedIn ? (
          <Text style={styles.hint}>Sign in required to call POST /api/devices/link.</Text>
        ) : null}
        <TextInput
          value={deviceId}
          onChangeText={setDeviceId}
          placeholder="device-id"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <PrimaryButton
          label="Link to account"
          loading={busy}
          disabled={!isLoggedIn}
          onPress={linkDevice}
        />
        {status ? <Text style={styles.status}>{status}</Text> : null}
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
  section: {
    fontSize: 17,
    fontWeight: '600',
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.7,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  status: {
    fontSize: 13,
    opacity: 0.75,
  },
});
