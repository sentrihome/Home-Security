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
import * as esp from '@/lib/esp';
import {
  formatGoogleSignInError,
  isGoogleSignInReady,
  signInWithGoogle,
  signOutGoogle,
} from '@/lib/googleAuth';
import { registerFcmWithPi } from '@/lib/notifications';
import {
  PERMANENT_PASS_ALLOWED,
  PERMANENT_PASS_LENGTH,
  generateRandomPassword,
  isValidPermanentPass,
} from '@/lib/pairing';
import {
  loadEspRandomPassword,
  saveEspRandomPassword,
} from '@/lib/storage';

type SoftApMode = 'instructions' | 'scanning' | 'credentials' | 'submitting' | 'verify';
/** 0 = SoftAP health, 1 = collect fields + POST /pair, 2 = done */
type EspStep = 0 | 1 | 2;

interface WifiNetwork {
  ssid: string;
  signal: number;
  security: string;
}

const STEP_LABELS = ['Pi Wi-Fi', 'ESP32', 'Done'];
const ESP_STEP_LABELS = ['Connect', 'Configure', 'Done'];

/**
 * Setup wizard: Google Drive auth → Pi SoftAP → ESP SoftAP pairing.
 */
export default function SetupScreen() {
  const { isLoggedIn, session, signIn, signOut, cloudBaseUrl } = useAuth();
  const {
    currentStep,
    setCurrentStep,
    piHost,
    setPiHost,
    advanceFromPiSetup,
  } = useSetupWizard();

  const [setupMode, setSetupMode] = useState<SoftApMode>('instructions');
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState('');
  const [piWifiPassword, setPiWifiPassword] = useState('');
  const [setupStatus, setSetupStatus] = useState('');
  const [pendingPiHost, setPendingPiHost] = useState(DEFAULT_PI_HOST);
  const [verifying, setVerifying] = useState(false);
  const [piSetupDone, setPiSetupDone] = useState(false);

  const [espStep, setEspStep] = useState<EspStep>(0);
  const [espStatus, setEspStatus] = useState('');
  const [espBusy, setEspBusy] = useState(false);
  const [connectionOk, setConnectionOk] = useState(false);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [permanentPass, setPermanentPass] = useState('');
  const [permanentPassError, setPermanentPassError] = useState<string | null>(null);
  const [randomPass, setRandomPass] = useState('');
  const [armTime, setArmTime] = useState('');
  const [disarmTime, setDisarmTime] = useState('');
  const [securityKey, setSecurityKey] = useState('');
  const [espAcknowledged, setEspAcknowledged] = useState(false);

  const [deviceId, setDeviceId] = useState('');
  const [linkStatus, setLinkStatus] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleStatus, setGoogleStatus] = useState('');
  const googleReady = isGoogleSignInReady();

  useEffect(() => {
    if (currentStep > 0) setPiSetupDone(true);
    if (currentStep >= 2) {
      setEspAcknowledged(true);
    }
  }, [currentStep]);

  useEffect(() => {
    (async () => {
      const saved = await loadEspRandomPassword();
      if (saved) setRandomPass(saved);
    })();
  }, []);

  async function handleGoogleSignIn() {
    setGoogleBusy(true);
    setGoogleStatus('');
    try {
      const { accessToken, refreshToken, email } = await signInWithGoogle();
      await signIn({ token: accessToken, refreshToken, email });
      setGoogleStatus(`Signed in as ${email}`);
    } catch (e) {
      setGoogleStatus(formatGoogleSignInError(e));
    } finally {
      setGoogleBusy(false);
    }
  }

  async function handleGoogleSignOut() {
    await signOutGoogle();
    await signOut();
    setGoogleStatus('');
  }

  /** Health-check Pi, POST Drive refresh token, then advance wizard. */
  async function handoffToPi(host: string) {
    setVerifying(true);
    setSetupStatus(`Checking ${host}:4000…`);
    try {
      const baseUrl = `http://${host}:4000`;
      await piApi.health(baseUrl);

      if (!session?.email || !session.refreshToken) {
        throw new Error('Sign in with Google first (refresh token required).');
      }

      setSetupStatus('Sending Google Drive token to Pi…');
      const handoff = await piApi.authDrive(
        { email: session.email, refresh_token: session.refreshToken },
        baseUrl
      );
      if (
        handoff &&
        typeof handoff === 'object' &&
        'ok' in handoff &&
        (handoff as { ok?: boolean }).ok === false
      ) {
        throw new Error(
          (handoff as { error?: string }).error || 'Pi rejected Drive token'
        );
      }

      await setPiHost(host);
      setPendingPiHost(host);

      let fcmMsg = '';
      try {
        fcmMsg = await registerFcmWithPi({
          force: true,
          baseUrl: `http://${host}:4000`,
        });
      } catch (e) {
        fcmMsg =
          e instanceof Error
            ? `FCM register failed: ${e.message}`
            : 'FCM register failed';
      }

      setPiSetupDone(true);
      advanceFromPiSetup();
      setSetupStatus(
        `Pi OK at ${host}. Drive token stored on Pi. ${fcmMsg}`
      );
    } catch (error) {
      setSetupStatus(
        error instanceof Error
          ? `Verify/handoff failed: ${error.message}`
          : 'Verification failed'
      );
    } finally {
      setVerifying(false);
    }
  }

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
    if (!selectedNetwork || !piWifiPassword) {
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
          password: piWifiPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed: ${response.statusText}`);
      }

      const host = (data.static_ip as string | undefined) || DEFAULT_PI_HOST;
      setPendingPiHost(host);
      setPiWifiPassword('');
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
    await handoffToPi(pendingPiHost);
  }

  function resetEspState() {
    setEspStep(0);
    setEspStatus('');
    setEspBusy(false);
    setConnectionOk(false);
    setWifiSsid('');
    setWifiPassword('');
    setPermanentPass('');
    setPermanentPassError(null);
    setRandomPass('');
    setArmTime('');
    setDisarmTime('');
    setSecurityKey('');
    setEspAcknowledged(false);
  }

  function resetPiSetup() {
    setSetupMode('instructions');
    setNetworks([]);
    setSelectedNetwork('');
    setPiWifiPassword('');
    setSetupStatus('');
    setPendingPiHost(DEFAULT_PI_HOST);
    setPiSetupDone(false);
    resetEspState();
    setCurrentStep(0);
  }

  async function runEspStep0() {
    setEspBusy(true);
    setEspStatus('Testing ESP connection...');
    try {
      await esp.health();
      setConnectionOk(true);
      setEspStep(1);
      setEspStatus('ESP connected. Fill in the pairing fields, then send.');
    } catch (err) {
      setEspStatus(
        `Connection failed: ${errMsg(err)}\n\nJoin SoftAP "${esp.ESP_SOFTAP_SSID}" (password ${esp.ESP_SOFTAP_PASSWORD}), then retry.`
      );
    } finally {
      setEspBusy(false);
    }
  }

  function onPermanentPassChange(next: string) {
    const upper = next.toUpperCase();
    if (upper.length > PERMANENT_PASS_LENGTH) {
      setPermanentPassError(
        `Password must be exactly ${PERMANENT_PASS_LENGTH} characters`
      );
      return;
    }
    for (const ch of upper) {
      if (!PERMANENT_PASS_ALLOWED.has(ch)) {
        setPermanentPassError('Only 0-9, A-D, # and * are allowed');
        return;
      }
    }
    setPermanentPass(upper);
    setPermanentPassError(null);
  }

  function onGenerateRandom() {
    setRandomPass(generateRandomPassword());
  }

  async function runEspPair() {
    if (!wifiSsid.trim() || !wifiPassword.trim()) {
      setEspStatus('Enter your home Wi-Fi SSID and password.');
      return;
    }
    if (!isValidPermanentPass(permanentPass)) {
      setPermanentPassError(
        `Password must be exactly ${PERMANENT_PASS_LENGTH} characters`
      );
      setEspStatus('Enter a valid permanent password.');
      return;
    }
    if (!randomPass) {
      setEspStatus('Generate an encrypted SoftAP password first.');
      return;
    }

    setEspBusy(true);
    setEspStatus('Sending pairing payload to ESP (POST /pair)...');
    try {
      await saveEspRandomPassword(randomPass);
      const result = await esp.pair({
        homessid: wifiSsid,
        homepass: wifiPassword,
        permpass: permanentPass,
        encryptedpass: randomPass,
        schedulestart: armTime.trim(),
        schedulestop: disarmTime.trim(),
        raspberrypiip: piHost || DEFAULT_PI_HOST,
        securitykey: securityKey.trim() || undefined,
      });

      if (result.pairingStatus === 'NO ACCESS') {
        setEspStatus(
          'ESP returned NO ACCESS. Put the central console on the setup screen, then retry.'
        );
        return;
      }
      if (
        result.pairingStatus === 'corrupted' ||
        result.pairingStatus === 'INVALID JSON'
      ) {
        setEspStatus(
          `Pairing rejected (${result.pairingStatus}). Response: ${result.raw.slice(0, 200)}`
        );
        return;
      }
      if (result.wifiConnection === false) {
        setEspStatus(
          'Payload received, but the console failed to join home Wi-Fi. Check SSID/password and retry.'
        );
        return;
      }
      if (result.wifiConnection !== true) {
        setEspStatus(
          `Unexpected ESP response.\n${result.raw.slice(0, 240)}`
        );
        return;
      }

      const apNote = result.newApPassword
        ? `\nNew AP password from ESP: ${result.newApPassword}`
        : '';
      setEspAcknowledged(true);
      setEspStep(2);
      setCurrentStep(2);
      setEspStatus(`Pairing OK — console joined home Wi-Fi.${apNote}`);
    } catch (err) {
      setEspStatus(
        `Pairing failed: ${errMsg(err)}\n\nStay on SoftAP "${esp.ESP_SOFTAP_SSID}" until the request finishes.`
      );
    } finally {
      setEspBusy(false);
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
      subtitle="Sign in with Google, connect the Pi to home Wi-Fi, then configure the ESP32.">
      <StepIndicator current={currentStep} />

      <StepCard
        n={0}
        title="Sign in with Google"
        subtitle="Do this on home Wi-Fi or cellular — not on the Pi hotspot."
        active={!isLoggedIn}
        done={isLoggedIn}
        alwaysShowBody>
        {isLoggedIn ? (
          <>
            <Text style={styles.hint}>Signed in as {session?.email}</Text>
            <PrimaryButton
              label="Sign out"
              variant="secondary"
              onPress={() => handleGoogleSignOut()}
            />
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              Use an Android dev build (expo run:android), not Expo Go.
            </Text>
            <PrimaryButton
              label="Sign in with Google"
              loading={googleBusy}
              disabled={!googleReady}
              onPress={handleGoogleSignIn}
            />
          </>
        )}
        {googleStatus ? <Text style={styles.status}>{googleStatus}</Text> : null}
      </StepCard>

      <StepCard
        n={1}
        title="Connect Pi to home Wi-Fi"
        subtitle="Join HomeSecurity-Setup, send credentials, then verify the Pi on your LAN."
        active={currentStep === 0}
        done={piSetupDone}>
        {!isLoggedIn ? (
          <Text style={styles.hint}>Sign in with Google above first.</Text>
        ) : (
          <>
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
                    disabled={!isLoggedIn}
                    loading={verifying}
                    onPress={() => handoffToPi(DEFAULT_PI_HOST)}
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
                      value={piWifiPassword}
                      onChangeText={setPiWifiPassword}
                      placeholder="WiFi password"
                      placeholderTextColor="#9ca3af"
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
          </>
        )}
      </StepCard>

      <StepCard
        n={2}
        title="Configure ESP32"
        subtitle={`Join SoftAP "${esp.ESP_SOFTAP_SSID}" (password ${esp.ESP_SOFTAP_PASSWORD}). Pi IP for payload: ${piHost}. One POST /pair sends all fields.`}
        active={currentStep === 1}
        done={espAcknowledged}
        alwaysShowBody={currentStep === 1}>
        <Text style={styles.hint}>
          Sub-steps:{' '}
          {ESP_STEP_LABELS.map((l, i) => (i === espStep ? `[${l}]` : l)).join(' → ')}
        </Text>

        {espStatus ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusText}>{espStatus}</Text>
          </View>
        ) : null}

        {espStep === 0 ? (
          <PrimaryButton
            label={connectionOk ? 'Connected' : 'Test ESP connection'}
            loading={espBusy}
            disabled={connectionOk}
            onPress={runEspStep0}
          />
        ) : null}

        {espStep === 1 ? (
          <>
            <TextInput
              value={wifiSsid}
              onChangeText={setWifiSsid}
              placeholder="Home Wi-Fi SSID (homessid)"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <TextInput
              value={wifiPassword}
              onChangeText={setWifiPassword}
              placeholder="Home Wi-Fi password (homepass)"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <TextInput
              value={permanentPass}
              onChangeText={onPermanentPassChange}
              placeholder="Permanent pass e.g. 1234ABCD (permpass)"
              placeholderTextColor="#9ca3af"
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.input}
            />
            <Text style={styles.helper}>
              {permanentPassError ??
                `${permanentPass.length}/${PERMANENT_PASS_LENGTH} characters (0-9, A-D, #, *)`}
            </Text>

            {randomPass ? (
              <View style={styles.passCard}>
                <Text style={styles.passText}>{randomPass}</Text>
              </View>
            ) : null}
            <PrimaryButton
              label="Generate encryptedpass"
              variant="secondary"
              onPress={onGenerateRandom}
            />

            <TextInput
              value={armTime}
              onChangeText={setArmTime}
              placeholder="Arm time HH:MM (schedulestart, optional)"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <TextInput
              value={disarmTime}
              onChangeText={setDisarmTime}
              placeholder="Disarm time HH:MM (schedulestop, optional)"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <Text style={styles.helper}>
              raspberrypiip will be sent as {piHost || DEFAULT_PI_HOST}
            </Text>
            <TextInput
              value={securityKey}
              onChangeText={setSecurityKey}
              placeholder="securitykey (optional)"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <PrimaryButton
              label="Send pairing payload"
              loading={espBusy}
              disabled={
                espBusy ||
                !wifiSsid.trim() ||
                !wifiPassword.trim() ||
                !isValidPermanentPass(permanentPass) ||
                !randomPass
              }
              onPress={runEspPair}
            />
          </>
        ) : null}
      </StepCard>

      {currentStep === 2 ? (
        <View style={styles.doneCard}>
          <Text style={styles.doneTitle}>Setup complete</Text>
          <Text style={styles.doneBody}>
            Pi is saved at {piHost}. ESP pairing payload was accepted. Reconnect the
            phone to your home Wi-Fi to use the app normally. You can still link a cloud
            device ID below.
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
          placeholderTextColor="#9ca3af"
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
  alwaysShowBody?: boolean;
  children: ReactNode;
};

function StepCard({
  n,
  title,
  subtitle,
  active,
  done,
  alwaysShowBody,
  children,
}: StepCardProps) {
  const showBody = alwaysShowBody || (active && !done);
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
      {showBody ? <View style={styles.cardBody}>{children}</View> : null}
    </View>
  );
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
  helper: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.75,
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
    color: '#0f172a',
    backgroundColor: '#ffffff',
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
  statusCard: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
  },
  statusText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#0f172a',
  },
  passCard: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  passText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
    color: '#0f172a',
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

