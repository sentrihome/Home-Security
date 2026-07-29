import { useState, useEffect } from 'react';
import { StyleSheet, TextInput, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';

import { Text, View } from '@/components/Themed';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/context/AuthContext';
import { cloudApi } from '@/lib/api';

const PI_SETUP_URL = 'http://10.42.0.1:4000';

interface WifiNetwork {
  ssid: string;
  signal: number;
  security: string;
}

/**
 * Pi SoftAP provisioning + device linking
 */
export default function SetupScreen() {
  const { isLoggedIn, session, cloudBaseUrl } = useAuth();
  
  // SoftAP provisioning state
  const [setupMode, setSetupMode] = useState<'instructions' | 'scanning' | 'credentials' | 'submitting' | 'success'>('instructions');
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<string>('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [setupStatus, setSetupStatus] = useState('');
  
  // Device linking state
  const [deviceId, setDeviceId] = useState('');
  const [linkStatus, setLinkStatus] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  async function scanNetworks() {
    setSetupMode('scanning');
    setSetupStatus('Scanning for networks...');
    
    try {
      const response = await fetch(`${PI_SETUP_URL}/scan`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Scan failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      setNetworks(data.networks || []);
      setSetupMode('credentials');
      setSetupStatus('');
    } catch (error) {
      setSetupStatus(
        error instanceof Error 
          ? `Error: ${error.message}. Are you connected to HomeSecurity-Setup?` 
          : 'Scan failed'
      );
      setSetupMode('instructions');
    }
  }

  async function submitCredentials() {
    if (!selectedNetwork || !wifiPassword) {
      setSetupStatus('Select a network and enter password');
      return;
    }

    setSetupMode('submitting');
    setSetupStatus('Configuring Pi...');

    try {
      const response = await fetch(`${PI_SETUP_URL}/wifi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ssid: selectedNetwork,
          password: wifiPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed: ${response.statusText}`);
      }

      setSetupMode('success');
      setSetupStatus('✓ WiFi configured! Pi is switching to home network. Reconnect your phone to home WiFi, then link the device below.');
      setWifiPassword('');
    } catch (error) {
      setSetupStatus(
        error instanceof Error ? error.message : 'Configuration failed'
      );
      setSetupMode('credentials');
    }
  }

  async function linkDevice() {
    if (!session?.token) {
      setLinkStatus('Sign in first.');
      return;
    }
    if (!deviceId.trim()) {
      setLinkStatus('Enter a device ID.');
      return;
    }

    setLinkBusy(true);
    try {
      await cloudApi.linkDevice(session.token, deviceId.trim(), cloudBaseUrl);
      setLinkStatus(`✓ Linked device ${deviceId.trim()}`);
    } catch (error) {
      setLinkStatus(error instanceof Error ? error.message : 'Link failed');
    } finally {
      setLinkBusy(false);
    }
  }

  function resetSetup() {
    setSetupMode('instructions');
    setNetworks([]);
    setSelectedNetwork('');
    setWifiPassword('');
    setSetupStatus('');
  }

  return (
    <Screen
      title="Device Setup"
      subtitle="Configure your Raspberry Pi and link it to your account">
      
      {/* Step 1: SoftAP Provisioning */}
      <View style={styles.card}>
        <Text style={styles.section}>1. WiFi Configuration</Text>
        
        {setupMode === 'instructions' && (
          <>
            <Text style={styles.hint}>
              New Pi? First, join the Pi's WiFi network:{'\n\n'}
              • SSID: <Text style={styles.bold}>HomeSecurity-Setup</Text>{'\n'}
              • Password: <Text style={styles.bold}>setup1234</Text>{'\n\n'}
              Then come back here and tap "Scan Networks".
            </Text>
            <PrimaryButton
              label="Scan Networks"
              onPress={scanNetworks}
            />
          </>
        )}

        {setupMode === 'scanning' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.hint}>Scanning...</Text>
          </View>
        )}

        {setupMode === 'credentials' && (
          <>
            <Text style={styles.hint}>Select your home WiFi network:</Text>
            <ScrollView style={styles.networkList}>
              {networks.map((net) => (
                <TouchableOpacity
                  key={net.ssid}
                  style={[
                    styles.networkItem,
                    selectedNetwork === net.ssid && styles.networkItemSelected,
                  ]}
                  onPress={() => setSelectedNetwork(net.ssid)}>
                  <Text style={styles.networkName}>{net.ssid}</Text>
                  <Text style={styles.networkSignal}>
                    {net.signal}% • {net.security}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            {selectedNetwork ? (
              <>
                <Text style={styles.hint}>Password for {selectedNetwork}:</Text>
                <TextInput
                  value={wifiPassword}
                  onChangeText={setWifiPassword}
                  placeholder="WiFi password"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                <PrimaryButton
                  label="Configure Pi"
                  onPress={submitCredentials}
                />
              </>
            ) : null}
          </>
        )}

        {setupMode === 'submitting' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.hint}>Configuring...</Text>
          </View>
        )}

        {setupMode === 'success' && (
          <PrimaryButton
            label="Setup Another Pi"
            onPress={resetSetup}
          />
        )}

        {setupStatus ? (
          <Text style={[styles.status, setupMode === 'success' && styles.statusSuccess]}>
            {setupStatus}
          </Text>
        ) : null}
      </View>

      {/* Step 2: Link to Cloud */}
      <View style={styles.card}>
        <Text style={styles.section}>2. Link Device to Account</Text>
        {!isLoggedIn ? (
          <Text style={styles.hint}>Sign in required to link device to cloud.</Text>
        ) : (
          <>
            <Text style={styles.hint}>
              After Pi connects to home WiFi, enter its device ID to link it to your account.
            </Text>
            <TextInput
              value={deviceId}
              onChangeText={setDeviceId}
              placeholder="device-id"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <PrimaryButton
              label="Link to Account"
              loading={linkBusy}
              disabled={!isLoggedIn}
              onPress={linkDevice}
            />
            {linkStatus ? <Text style={styles.status}>{linkStatus}</Text> : null}
          </>
        )}
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
  bold: {
    fontWeight: '700',
  },
  center: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  networkList: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
  },
  networkItem: {
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  networkItemSelected: {
    backgroundColor: '#dbeafe',
  },
  networkName: {
    fontSize: 16,
    fontWeight: '500',
  },
  networkSignal: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 2,
  },
  status: {
    fontSize: 13,
    opacity: 0.75,
  },
  statusSuccess: {
    color: '#059669',
    fontWeight: '500',
  },
});
