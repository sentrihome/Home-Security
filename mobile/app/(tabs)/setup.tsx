import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View as RNView,
} from 'react-native';

import { Text, View } from '@/components/Themed';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/context/AuthContext';
import { useSetupWizard, type WizardStep } from '@/context/SetupWizardContext';
import { cloudApi, piApi } from '@/lib/api';
import { DEFAULT_PI_HOST, PI_SOFTAP_BASE_URL } from '@/lib/config';

type SoftApMode = 'instructions' | 'scanning' | 'credentials' | 'submitting' | 'verify';

interface WifiNetwork {
  ssid: string;
  signal: number;
  security: string;
}

const STEP_LABELS = ['Pi Wi-Fi', 'ESP32', 'Done'];

/**
 * Setup wizard: Pi SoftAP first, then ESP handoff (stub), plus cloud link.
 */
export default function SetupScreen() {
  const { isLoggedIn, session, cloudBaseUrl } = useAuth();
  const {
    currentStep,
    setCurrentStep,
    piHost,
    piBaseUrl,
    setPiHost,
    advanceFromPiSetup,
  } = useSetupWizard();

  const [setupMode, setSetupMode] = useState<SoftApMode>('instructions');
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [setupStatus, setSetupStatus] = useState('');
  const [pendingPiHost, setPendingPiHost] = useState(DEFAULT_PI_HOST);
  const [verifying, setVerifying] = useState(false);
  const [piSetupDone, setPiSetupDone] = useState(false);

  const [espAcknowledged, setEspAcknowledged] = useState(false);

  const [deviceId, setDeviceId] = useState('');
  const [linkStatus, setLinkStatus] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  useEffect(() => {
    if (currentStep > 0) setPiSetupDone(true);
    if (currentStep >= 2) setEspAcknowledged(true);
  }, [currentStep]);

  async function scanNetworks() {
    setSetupMode('scanning');
    setSetupStatus('Scanning for networks...');

    try {
      const response = await fetch(`${PI_SOFTAP_BASE_URL}/scan`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
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
      const response = await fetch(`${PI_SOFTAP_BASE_URL}/wifi`, {
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

      const host = (data.static_ip as string | undefined) || DEFAULT_PI_HOST;
      setPendingPiHost(host);
      setWifiPassword('');
      setSetupMode('verify');
      setSetupStatus(
        `WiFi configured. Pi will use ${host}. Reconnect this phone to your home Wi-Fi, then verify.`
      );
    } catch (error) {
      setSetupStatus(error instanceof Error ? error.message : 'Configuration failed');
      setSetupMode('credentials');
    }
  }

  async function verifyPiOnLan() {
    setVerifying(true);
    setSetupStatus(`Checking ${pendingPiHost}:4000…`);
    try {
      const baseUrl = `http://${pendingPiHost}:4000`;
      await piApi.health(baseUrl);
      await setPiHost(pendingPiHost);
      setPiSetupDone(true);
      advanceFromPiSetup();
      setSetupStatus(`Pi reachable at ${pendingPiHost}.`);
    } catch (error) {
      setSetupStatus(
        error instanceof Error
          ? `Not reachable yet: ${error.message}. Make sure the phone is back on home Wi-Fi and try again.`
          : 'Verification failed'
      );
    } finally {
      setVerifying(false);
    }
  }

  function resetPiSetup() {
    setSetupMode('instructions');
    setNetworks([]);
    setSelectedNetwork('');
    setWifiPassword('');
    setSetupStatus('');
    setPendingPiHost(DEFAULT_PI_HOST);
    setPiSetupDone(false);
    setEspAcknowledged(false);
    setCurrentStep(0);
  }

  function continueEspStub() {
    setEspAcknowledged(true);
    setCurrentStep(2);
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
      setLinkStatus(`Linked device ${deviceId.trim()}`);
    } catch (error) {
      setLinkStatus(error instanceof Error ? error.message : 'Link failed');
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <Screen
      title="Device setup"
      subtitle="Connect the Pi to home Wi-Fi first, then configure the ESP32.">
      <StepIndicator current={currentStep} />

      <StepCard
        n={1}
        title="Connect Pi to home Wi-Fi"
        subtitle="Join HomeSecurity-Setup, send credentials, then verify the Pi on your LAN."
        active={currentStep === 0}
        done={piSetupDone}>
        {setupMode === 'instructions' && (
          <>
            <Text style={styles.hint}>
              Join the Pi hotspot in phone settings:{'\n\n'}
              • SSID: <Text style={styles.bold}>HomeSecurity-Setup</Text>
              {'\n'}• Password: <Text style={styles.bold}>setup1234</Text>
              {'\n\n'}
              Then return here and scan.
            </Text>
            <PrimaryButton label="Scan networks" onPress={scanNetworks} />
            {piSetupDone ? null : (
              <PrimaryButton
                label="Skip — Pi already on LAN"
                variant="secondary"
                onPress={async () => {
                  await setPiHost(DEFAULT_PI_HOST);
                  setPiSetupDone(true);
                  advanceFromPiSetup();
                }}
              />
            )}
          </>
        )}

        {setupMode === 'scanning' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.hint}>Scanning…</Text>
          </View>
        )}

        {setupMode === 'credentials' && (
          <>
            <Text style={styles.hint}>Select your home Wi-Fi network:</Text>
            <RNView style={styles.networkList}>
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
            </RNView>

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
                <PrimaryButton label="Configure Pi" onPress={submitCredentials} />
              </>
            ) : null}
          </>
        )}

        {setupMode === 'submitting' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.hint}>Configuring…</Text>
          </View>
        )}

        {setupMode === 'verify' && (
          <>
            <Text style={styles.hint}>
              Expected Pi IP: <Text style={styles.bold}>{pendingPiHost}</Text>
            </Text>
            <PrimaryButton
              label="Verify Pi on home network"
              loading={verifying}
              onPress={verifyPiOnLan}
            />
            <PrimaryButton
              label="Start over"
              variant="secondary"
              onPress={resetPiSetup}
            />
          </>
        )}

        {setupStatus ? (
          <Text
            style={[
              styles.status,
              setupMode === 'verify' && piSetupDone && styles.statusSuccess,
            ]}>
            {setupStatus}
          </Text>
        ) : null}
      </StepCard>

      <StepCard
        n={2}
        title="Configure ESP32"
        subtitle="The ESP will use this Pi as its master backend. Full SoftAP pairing comes next."
        active={currentStep === 1}
        done={espAcknowledged}>
        <Text style={styles.hint}>
          Saved Pi IP for ESP master backend:{'\n'}
          <Text style={styles.bold}>{piHost}</Text>
          {'\n'}
          Base URL: {piBaseUrl}
        </Text>
        <Text style={styles.hint}>
          Later this step will join the ESP SoftAP and call /api/setmasterip with that
          address. For now, continue once you have noted the Pi IP.
        </Text>
        <PrimaryButton label="Continue with this Pi IP" onPress={continueEspStub} />
      </StepCard>

      {currentStep === 2 ? (
        <View style={styles.doneCard}>
          <Text style={styles.doneTitle}>Pi ready</Text>
          <Text style={styles.doneBody}>
            Pi is saved at {piHost}. ESP SoftAP provisioning can use this IP in the next
            wizard pass. You can still link a cloud device ID below.
          </Text>
          <PrimaryButton label="Re-run Pi setup" variant="secondary" onPress={resetPiSetup} />
        </View>
      ) : null}

      <View style={styles.divider} />

      <View style={styles.card}>
        <Text style={styles.section}>Link device to account</Text>
        {!isLoggedIn ? (
          <Text style={styles.hint}>Sign in required.</Text>
        ) : (
          <Text style={styles.hint}>
            Enter a device ID to link it to your cloud account.
          </Text>
        )}
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
          loading={linkBusy}
          disabled={!isLoggedIn}
          onPress={linkDevice}
        />
        {linkStatus ? <Text style={styles.status}>{linkStatus}</Text> : null}
      </View>
    </Screen>
  );
}

function StepIndicator({ current }: { current: WizardStep }) {
  return (
    <View style={styles.indicatorRow}>
      {STEP_LABELS.map((label, index) => {
        const isDone = index < current;
        const isActive = index === current;
        return (
          <View key={label} style={styles.indicatorCell}>
            <View
              style={[
                styles.indicatorDot,
                isDone && styles.indicatorDotDone,
                isActive && styles.indicatorDotActive,
              ]}>
              <Text style={styles.indicatorNumber}>{index + 1}</Text>
            </View>
            <Text style={styles.indicatorLabel}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

type StepCardProps = {
  n: number;
  title: string;
  subtitle: string;
  active: boolean;
  done: boolean;
  children: ReactNode;
};

function StepCard({ n, title, subtitle, active, done, children }: StepCardProps) {
  return (
    <View
      style={[
        styles.card,
        done && styles.cardDone,
        !active && !done && styles.cardPending,
      ]}>
      <Text style={styles.section}>
        {n}. {title}
        {done ? '  ✓' : ''}
      </Text>
      {active || done ? <Text style={styles.hint}>{subtitle}</Text> : null}
      {active && !done ? <View style={styles.cardBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  indicatorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  indicatorCell: {
    alignItems: 'center',
    flex: 1,
  },
  indicatorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e7eb',
    marginBottom: 4,
  },
  indicatorDotActive: {
    backgroundColor: '#1d4ed8',
  },
  indicatorDotDone: {
    backgroundColor: '#059669',
  },
  indicatorNumber: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  indicatorLabel: {
    fontSize: 11,
    opacity: 0.75,
  },
  card: {
    gap: 10,
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d5db',
  },
  cardDone: {
    opacity: 0.85,
  },
  cardPending: {
    opacity: 0.5,
  },
  cardBody: {
    gap: 10,
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
    overflow: 'hidden',
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
  doneCard: {
    gap: 10,
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#a7f3d0',
  },
  doneTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#065f46',
  },
  doneBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#065f46',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#d1d5db',
    marginVertical: 4,
  },
});
