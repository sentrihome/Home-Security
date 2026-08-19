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
import {
  PERMANENT_PASS_ALLOWED,
  PERMANENT_PASS_LENGTH,
  generateOtp,
  generateRandomPassword,
  isValidPermanentPass,
} from '@/lib/pairing';
import {
  loadEspRandomPassword,
  saveEspRandomPassword,
} from '@/lib/storage';

type SoftApMode = 'instructions' | 'scanning' | 'credentials' | 'submitting' | 'verify';
type EspStep = 0 | 1 | 2 | 3 | 4 | 5;

interface WifiNetwork {
  ssid: string;
  signal: number;
  security: string;
}

const STEP_LABELS = ['Pi Wi-Fi', 'ESP32', 'Done'];
const ESP_STEP_LABELS = ['Connect', 'Wi-Fi', 'Permanent', 'Random', 'Module'];

/**
 * Connection tools: Google, Pi Wi-Fi/Drive/camera, ESP pairing.
 * Every step stays available so you can redo a single link without resetting all.
 */
export default function SetupScreen() {
  const { isLoggedIn, session, signIn, signOut, cloudBaseUrl } = useAuth();
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
  const [wifiCredsSent, setWifiCredsSent] = useState(false);
  const [permanentPass, setPermanentPass] = useState('');
  const [permanentPassError, setPermanentPassError] = useState<string | null>(null);
  const [permanentPassSent, setPermanentPassSent] = useState(false);
  const [randomPass, setRandomPass] = useState('');
  const [randomPassSent, setRandomPassSent] = useState(false);
  const [modulePaired, setModulePaired] = useState(false);
  const [espAcknowledged, setEspAcknowledged] = useState(false);

  const [deviceId, setDeviceId] = useState('');
  const [linkStatus, setLinkStatus] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  // TEMP: debug panel for sendOneTimePass + sendSchedule. Remove when drawer UI exists.
  const [otpDisplay, setOtpDisplay] = useState('');
  const [armTime, setArmTime] = useState('');
  const [disarmTime, setDisarmTime] = useState('');
  const [debugStatus, setDebugStatus] = useState('');
  const [debugBusy, setDebugBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleStatus, setGoogleStatus] = useState('');
  const googleReady = isGoogleSignInReady();

  useEffect(() => {
    if (currentStep > 0) setPiSetupDone(true);
    if (currentStep >= 2) {
      setEspAcknowledged(true);
      setModulePaired(true);
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

  async function sendDriveTokenToPi(baseUrl: string) {
    if (!session?.email || !session.refreshToken) {
      throw new Error('Sign in with Google first (refresh token required).');
    }
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
    const webClientSecret = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_SECRET?.trim();
    const handoff = await piApi.authDrive(
      {
        email: session.email,
        refresh_token: session.refreshToken,
        ...(webClientId ? { client_id: webClientId } : {}),
        ...(webClientSecret ? { client_secret: webClientSecret } : {}),
      },
      baseUrl
    );
    if (handoff && typeof handoff === 'object' && 'ok' in handoff && handoff.ok === false) {
      throw new Error(handoff.error || 'Pi rejected Drive token');
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
      const list = Array.isArray(data.networks) ? data.networks : [];
      list.sort((a: WifiNetwork, b: WifiNetwork) => (b.signal ?? 0) - (a.signal ?? 0));
      setNetworks(list);
      setSetupMode('credentials');
      setSetupStatus(list.length ? `${list.length} networks found` : 'No networks found');
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

      if (session?.refreshToken) {
        setSetupStatus('WiFi saved. Sending Google Drive token to Pi…');
        try {
          await sendDriveTokenToPi(PI_SOFTAP_BASE_URL);
          setSetupStatus(
            `Token stored. Pi will join ${host}. Reconnect this phone to home Wi-Fi, then verify.`
          );
        } catch (handoffErr) {
          setSetupStatus(
            `WiFi saved, but Drive handoff failed: ${
              handoffErr instanceof Error ? handoffErr.message : 'unknown'
            }. Sign in with Google, then verify on LAN.`
          );
        }
      } else {
        setSetupStatus(
          `WiFi configured. Sign in with Google, then open http://10.42.0.1:4000/dev on the Pi hotspot, or verify after the Pi is on ${host}.`
        );
      }
      setSetupMode('verify');
    } catch (error) {
      setSetupStatus(error instanceof Error ? error.message : 'Configuration failed');
      setSetupMode('credentials');
    }
  }

  async function verifyPiOnLan() {
    const host = setupMode === 'verify' ? pendingPiHost : piHost;
    await handoffToPi(host);
  }

  async function handoffToPi(host: string) {
    setVerifying(true);
    setSetupStatus(`Checking ${host}:4000…`);
    try {
      const baseUrl = `http://${host}:4000`;
      await piApi.health(baseUrl);
      if (session?.refreshToken) {
        setSetupStatus('Sending Google Drive token to Pi…');
        await sendDriveTokenToPi(baseUrl);
      }
      await setPiHost(host);
      setPiSetupDone(true);
      advanceFromPiSetup();
      setSetupStatus(
        session?.refreshToken
          ? `Pi OK at ${host}. Drive token stored.`
          : `Pi reachable at ${host}.`
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

  function resetEspState() {
    setEspStep(0);
    setEspStatus('');
    setEspBusy(false);
    setConnectionOk(false);
    setWifiSsid('');
    setWifiPassword('');
    setWifiCredsSent(false);
    setPermanentPass('');
    setPermanentPassError(null);
    setPermanentPassSent(false);
    setRandomPassSent(false);
    setModulePaired(false);
    setEspAcknowledged(false);
  }

  function redoPiWifi() {
    setSetupMode('instructions');
    setNetworks([]);
    setSelectedNetwork('');
    setPiWifiPassword('');
    setSetupStatus('');
    setPendingPiHost(DEFAULT_PI_HOST);
    setCurrentStep(0);
  }

  async function sendDriveToCurrentPi() {
    setVerifying(true);
    setSetupStatus(`Sending Drive token to ${piBaseUrl}…`);
    try {
      await sendDriveTokenToPi(piBaseUrl);
      setSetupStatus(`Drive token stored on ${piHost}.`);
    } catch (error) {
      setSetupStatus(
        error instanceof Error ? `Drive handoff failed: ${error.message}` : 'Drive handoff failed'
      );
    } finally {
      setVerifying(false);
    }
  }

  async function startPiCamera() {
    setVerifying(true);
    setSetupStatus(`Starting camera on ${piBaseUrl}…`);
    try {
      const result = await piApi.start('app', '', piBaseUrl);
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
        throw new Error(result.error || 'Publisher failed');
      }
      setSetupStatus('Camera publisher started. Open Live to watch.');
    } catch (error) {
      setSetupStatus(
        error instanceof Error
          ? `Start camera failed: ${error.message}`
          : 'Start camera failed'
      );
    } finally {
      setVerifying(false);
    }
  }

  async function runEspStep0() {
    setEspBusy(true);
    setEspStatus('Testing ESP connection...');
    try {
      await esp.health();
      setConnectionOk(true);
      setEspStep(1);
      setEspStatus('ESP connected.');
    } catch (err) {
      setEspStatus(
        `Connection failed: ${errMsg(err)}\n\nMake sure your phone is on the ESP32_Master_Config Wi-Fi.`
      );
    } finally {
      setEspBusy(false);
    }
  }

  async function runEspStep1() {
    if (!wifiSsid.trim() || !wifiPassword.trim()) {
      setEspStatus('Enter your home Wi-Fi SSID and password.');
      return;
    }
    setEspBusy(true);
    setEspStatus('Sending Wi-Fi credentials...');
    try {
      await esp.sendSsid(wifiSsid);
      await esp.sendPass(wifiPassword);
      setWifiCredsSent(true);
      setEspStep(2);
      setEspStatus('Wi-Fi credentials sent.');
    } catch (err) {
      setEspStatus(`Failed to send Wi-Fi credentials: ${errMsg(err)}`);
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

  async function runEspStep2() {
    if (!isValidPermanentPass(permanentPass)) {
      setPermanentPassError(
        `Password must be exactly ${PERMANENT_PASS_LENGTH} characters`
      );
      return;
    }
    setEspBusy(true);
    setEspStatus('Sending permanent password...');
    try {
      await esp.sendPermanentPass(permanentPass);
      setPermanentPassSent(true);
      setEspStep(3);
      setEspStatus('Permanent password set.');
    } catch (err) {
      setEspStatus(`Failed to set permanent password: ${errMsg(err)}`);
    } finally {
      setEspBusy(false);
    }
  }

  function onGenerateRandom() {
    setRandomPass(generateRandomPassword());
  }

  async function runEspStep3() {
    if (!randomPass) {
      setEspStatus('Generate a random password first.');
      return;
    }
    setEspBusy(true);
    setEspStatus('Sending random password to ESP...');
    try {
      // Save first — if the ESP restarts its AP mid-response and the fetch drops,
      // we still have the password on the phone for module pairing.
      await saveEspRandomPassword(randomPass);
      await esp.sendEncryptedPass(randomPass);
      setRandomPassSent(true);
      setEspStep(4);
      setEspStatus(
        'Random password saved on this phone.\n\nNow open your phone Wi-Fi settings and join "ESPMODULE", then come back and tap Start Pairing.'
      );
    } catch (err) {
      setEspStatus(`Failed to send random password: ${errMsg(err)}`);
    } finally {
      setEspBusy(false);
    }
  }

  async function runEspStep4() {
    setEspBusy(true);
    setEspStatus('Pairing module...');
    try {
      const passToSend = (await loadEspRandomPassword()) ?? randomPass;
      if (!passToSend) {
        setEspStatus('No saved random password. Redo the random SoftAP step while on the ESP main Wi-Fi.');
        return;
      }
      const response = await esp.sendMainConnection(passToSend);
      if (response.trim().toUpperCase() === 'OK') {
        setModulePaired(true);
        setEspAcknowledged(true);
        setEspStep(5);
        setCurrentStep(2);
        setEspStatus('');
      } else {
        setEspStatus(
          `Module responded but pairing was not confirmed.\nResponse: ${response.slice(0, 200)}`
        );
      }
    } catch (err) {
      setEspStatus(
        `Module pairing failed: ${errMsg(err)}\n\nMake sure you're connected to the ESPMODULE Wi-Fi.`
      );
    } finally {
      setEspBusy(false);
    }
  }

  function generateAndShowOtp() {
    setOtpDisplay(generateOtp());
    setDebugStatus('OTP generated. Tap Send OTP to push it to the ESP.');
  }

  async function sendOtp() {
    if (!otpDisplay) {
      setDebugStatus('Generate an OTP first.');
      return;
    }
    setDebugBusy(true);
    setDebugStatus('Sending OTP...');
    try {
      const response = await esp.sendOneTimePass(otpDisplay);
      setDebugStatus(`OTP sent. Response: ${response.slice(0, 200)}`);
    } catch (err) {
      setDebugStatus(`OTP failed: ${errMsg(err)}`);
    } finally {
      setDebugBusy(false);
    }
  }

  async function sendSchedule() {
    if (!armTime.trim() || !disarmTime.trim()) {
      setDebugStatus('Enter both arm and disarm times (HH:MM).');
      return;
    }
    setDebugBusy(true);
    setDebugStatus('Sending schedule...');
    try {
      const response = await esp.sendSchedule(armTime.trim(), disarmTime.trim());
      setDebugStatus(`Schedule sent. Response: ${response.slice(0, 200)}`);
    } catch (err) {
      setDebugStatus(`Schedule failed: ${errMsg(err)}`);
    } finally {
      setDebugBusy(false);
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
      subtitle="Redo any connection at any time — Google, Pi, Drive, camera, or ESP.">
      <StepIndicator current={currentStep} onSelect={setCurrentStep} />

      <StepCard
        n={1}
        title="Pi: Google, Wi-Fi, Drive, camera"
        subtitle="Join HomeSecurity-Setup for Wi-Fi, or use LAN/Tailscale for Drive and camera."
        done={piSetupDone}>
        {isLoggedIn ? (
          <>
            <Text style={styles.hint}>Google: {session?.email}</Text>
            <PrimaryButton
              label="Sign out of Google"
              variant="secondary"
              onPress={handleGoogleSignOut}
            />
          </>
        ) : (
          <PrimaryButton
            label="Sign in with Google"
            loading={googleBusy}
            disabled={!googleReady}
            onPress={handleGoogleSignIn}
          />
        )}
        {googleStatus ? <Text style={styles.hint}>{googleStatus}</Text> : null}

        <Text style={styles.hint}>
          Pi hotspot:{' '}
          <Text style={styles.bold}>HomeSecurity-Setup</Text> /{' '}
          <Text style={styles.bold}>setup1234</Text>
        </Text>

        {setupMode === 'scanning' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.hint}>Scanning…</Text>
          </View>
        )}

        {setupMode === 'credentials' && (
          <>
            <Text style={styles.hint}>
              Select your home Wi-Fi network ({networks.length} found):
            </Text>
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
          <Text style={styles.hint}>
            Expected Pi IP: <Text style={styles.bold}>{pendingPiHost}</Text>
          </Text>
        )}

        <PrimaryButton label="Scan Pi hotspot networks" onPress={scanNetworks} />
        <PrimaryButton
          label="Verify Pi on home / Tailscale"
          loading={verifying}
          onPress={verifyPiOnLan}
        />
        <PrimaryButton
          label="Send Drive token to Pi"
          loading={verifying}
          disabled={!isLoggedIn}
          onPress={sendDriveToCurrentPi}
        />
        <PrimaryButton
          label="Start camera"
          loading={verifying}
          onPress={startPiCamera}
        />
        <PrimaryButton
          label="Skip — Pi already on LAN"
          variant="secondary"
          onPress={async () => {
            await setPiHost(DEFAULT_PI_HOST);
            setPiSetupDone(true);
            advanceFromPiSetup();
          }}
        />
        <PrimaryButton label="Redo Pi Wi-Fi form" variant="secondary" onPress={redoPiWifi} />

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
        subtitle={`Pi: ${piHost} (${piBaseUrl}). Open any sub-step — you do not have to finish the previous one.`}
        done={espAcknowledged}>
        <RNView style={styles.chipRow}>
          {ESP_STEP_LABELS.map((label, index) => (
            <TouchableOpacity
              key={label}
              onPress={() => setEspStep(index as EspStep)}
              style={[styles.chip, espStep === index && styles.chipActive]}>
              <Text style={[styles.chipLabel, espStep === index && styles.chipLabelActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </RNView>

        {espStatus ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusText}>{espStatus}</Text>
          </View>
        ) : null}

        {espStep === 0 ? (
          <PrimaryButton
            label={connectionOk ? 'Test ESP connection again' : 'Test ESP connection'}
            loading={espBusy}
            onPress={runEspStep0}
          />
        ) : null}

        {espStep === 1 ? (
          <>
            <TextInput
              value={wifiSsid}
              onChangeText={setWifiSsid}
              placeholder="Home Wi-Fi SSID"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <TextInput
              value={wifiPassword}
              onChangeText={setWifiPassword}
              placeholder="Home Wi-Fi password"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <PrimaryButton
              label={wifiCredsSent ? 'Send Wi-Fi credentials again' : 'Send Wi-Fi credentials'}
              loading={espBusy}
              disabled={!wifiSsid.trim() || !wifiPassword.trim()}
              onPress={runEspStep1}
            />
          </>
        ) : null}

        {espStep === 2 ? (
          <>
            <TextInput
              value={permanentPass}
              onChangeText={onPermanentPassChange}
              placeholder="e.g. 1234ABCD"
              placeholderTextColor="#9ca3af"
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.input}
            />
            <Text style={styles.helper}>
              {permanentPassError ??
                `${permanentPass.length}/${PERMANENT_PASS_LENGTH} characters (0-9, A-D, #, *)`}
            </Text>
            <PrimaryButton
              label={
                permanentPassSent ? 'Save permanent password again' : 'Save permanent password'
              }
              loading={espBusy}
              disabled={!isValidPermanentPass(permanentPass)}
              onPress={runEspStep2}
            />
          </>
        ) : null}

        {espStep === 3 ? (
          <>
            {randomPass ? (
              <View style={styles.passCard}>
                <Text style={styles.passText}>{randomPass}</Text>
              </View>
            ) : null}
            <PrimaryButton
              label="Generate"
              variant="secondary"
              onPress={onGenerateRandom}
            />
            <PrimaryButton
              label={randomPassSent ? 'Send & save again' : 'Send & save'}
              loading={espBusy}
              disabled={!randomPass}
              onPress={runEspStep3}
            />
          </>
        ) : null}

        {espStep === 4 || espStep === 5 ? (
          <PrimaryButton
            label={modulePaired ? 'Pair module again' : 'Start pairing'}
            loading={espBusy}
            onPress={runEspStep4}
          />
        ) : null}

        <PrimaryButton label="Reset ESP form only" variant="secondary" onPress={resetEspState} />
      </StepCard>

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

      <View style={styles.divider} />

      <View style={styles.card}>
        <Text style={styles.section}>Debug — OTP & Schedule</Text>
        <Text style={styles.helper}>
          Temporary. Remove once the drawer UI is built.
        </Text>

        {otpDisplay ? (
          <View style={styles.passCard}>
            <Text style={styles.passText}>{otpDisplay}</Text>
          </View>
        ) : null}
        <PrimaryButton
          label="Generate OTP"
          variant="secondary"
          onPress={generateAndShowOtp}
        />
        <PrimaryButton
          label="Send OTP to ESP"
          loading={debugBusy}
          disabled={!otpDisplay}
          onPress={sendOtp}
        />

        <TextInput
          value={armTime}
          onChangeText={setArmTime}
          placeholder="Arm time (HH:MM)"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <TextInput
          value={disarmTime}
          onChangeText={setDisarmTime}
          placeholder="Disarm time (HH:MM)"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <PrimaryButton
          label="Send schedule"
          loading={debugBusy}
          disabled={!armTime.trim() || !disarmTime.trim()}
          onPress={sendSchedule}
        />

        {debugStatus ? <Text style={styles.helper}>{debugStatus}</Text> : null}
      </View>
    </Screen>
  );
}

function StepIndicator({
  current,
  onSelect,
}: {
  current: WizardStep;
  onSelect: (step: WizardStep) => void;
}) {
  return (
    <View style={styles.indicatorRow}>
      {STEP_LABELS.map((label, index) => {
        const isDone = index < current;
        const isActive = index === current;
        return (
          <TouchableOpacity
            key={label}
            style={styles.indicatorCell}
            onPress={() => onSelect(index as WizardStep)}
            accessibilityRole="button"
            accessibilityLabel={`Go to ${label}`}>
            <View
              style={[
                styles.indicatorDot,
                isDone && styles.indicatorDotDone,
                isActive && styles.indicatorDotActive,
              ]}>
              <Text style={styles.indicatorNumber}>{index + 1}</Text>
            </View>
            <Text style={styles.indicatorLabel}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

type StepCardProps = {
  n: number;
  title: string;
  subtitle: string;
  done: boolean;
  children: ReactNode;
};

function StepCard({ n, title, subtitle, done, children }: StepCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.section}>
        {n}. {title}
        {done ? '  ✓' : ''}
      </Text>
      <Text style={styles.hint}>{subtitle}</Text>
      <View style={styles.cardBody}>{children}</View>
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
  cardBody: {
    gap: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f8fafc',
  },
  chipActive: {
    backgroundColor: '#1d4ed8',
    borderColor: '#1d4ed8',
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  chipLabelActive: {
    color: '#fff',
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
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#d1d5db',
    marginVertical: 4,
  },
});
