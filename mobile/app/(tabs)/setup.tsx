import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/context/AuthContext';
import { cloudApi } from '@/lib/api';
import * as esp from '@/lib/esp';
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

type Step = 0 | 1 | 2 | 3 | 4 | 5;

const STEP_LABELS = ['Connect', 'Wi-Fi', 'Permanent', 'Random', 'Module', 'Done'];

export default function SetupScreen() {
  const { isLoggedIn, session, cloudBaseUrl } = useAuth();

  const [currentStep, setCurrentStep] = useState<Step>(0);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

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

  const [deviceId, setDeviceId] = useState('');
  const [linkStatus, setLinkStatus] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await loadEspRandomPassword();
      if (saved) setRandomPass(saved);
    })();
  }, []);

  async function runStep0() {
    setBusy(true);
    setStatus('Testing ESP connection...');
    try {
      await esp.health();
      setConnectionOk(true);
      setCurrentStep(1);
      setStatus('ESP connected.');
    } catch (err) {
      setStatus(
        `Connection failed: ${errMsg(err)}\n\nMake sure your phone is on the ESP32_Master_Config Wi-Fi.`
      );
    } finally {
      setBusy(false);
    }
  }

  async function runStep1() {
    if (!wifiSsid.trim() || !wifiPassword.trim()) {
      setStatus('Enter your home Wi-Fi SSID and password.');
      return;
    }
    setBusy(true);
    setStatus('Sending Wi-Fi credentials...');
    try {
      await esp.sendSsid(wifiSsid);
      await esp.sendPass(wifiPassword);
      setWifiCredsSent(true);
      setCurrentStep(2);
      setStatus('Wi-Fi credentials sent.');
    } catch (err) {
      setStatus(`Failed to send Wi-Fi credentials: ${errMsg(err)}`);
    } finally {
      setBusy(false);
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

  async function runStep2() {
    if (!isValidPermanentPass(permanentPass)) {
      setPermanentPassError(
        `Password must be exactly ${PERMANENT_PASS_LENGTH} characters`
      );
      return;
    }
    setBusy(true);
    setStatus('Sending permanent password...');
    try {
      await esp.sendPermanentPass(permanentPass);
      setPermanentPassSent(true);
      setCurrentStep(3);
      setStatus('Permanent password set.');
    } catch (err) {
      setStatus(`Failed to set permanent password: ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  }

  function onGenerateRandom() {
    setRandomPass(generateRandomPassword());
  }

  async function runStep3() {
    if (!randomPass) {
      setStatus('Generate a random password first.');
      return;
    }
    setBusy(true);
    setStatus('Sending random password to ESP...');
    try {
      // Save first — if the ESP restarts its AP mid-response and the fetch drops,
      // we still have the password on the phone for step 4.
      await saveEspRandomPassword(randomPass);
      await esp.sendEncryptedPass(randomPass);
      setRandomPassSent(true);
      setCurrentStep(4);
      setStatus(
        'Random password saved on this phone.\n\nNow open your phone Wi-Fi settings and join "ESPMODULE", then come back and tap Start Pairing.'
      );
    } catch (err) {
      setStatus(`Failed to send random password: ${errMsg(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runStep4() {
    setBusy(true);
    setStatus('Pairing module...');
    try {
      const passToSend = (await loadEspRandomPassword()) ?? randomPass;
      if (!passToSend) {
        setStatus('No saved random password. Redo step 4 while on the ESP main Wi-Fi.');
        return;
      }
      const response = await esp.sendMainConnection(passToSend);
      if (response.trim().toUpperCase() === 'OK') {
        setModulePaired(true);
        setCurrentStep(5);
        setStatus('');
      } else {
        setStatus(
          `Module responded but pairing was not confirmed.\nResponse: ${response.slice(0, 200)}`
        );
      }
    } catch (err) {
      setStatus(
        `Module pairing failed: ${errMsg(err)}\n\nMake sure you're connected to the ESPMODULE Wi-Fi.`
      );
    } finally {
      setBusy(false);
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
    } catch (err) {
      setLinkStatus(errMsg(err));
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <Screen
      title="Device setup"
      subtitle="Pair a new ESP32 device and link it to your account.">
      <StepIndicator current={currentStep} />

      {status ? (
        <View style={styles.statusCard}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      ) : null}

      <StepCard
        n={1}
        title="Connect to ESP Main"
        subtitle="Join the ESP32_Master_Config Wi-Fi in your phone settings, then tap Test."
        active={currentStep === 0}
        done={connectionOk}>
        <PrimaryButton
          label={connectionOk ? 'Connected' : 'Test connection'}
          loading={busy && currentStep === 0}
          disabled={connectionOk}
          onPress={runStep0}
        />
      </StepCard>

      <StepCard
        n={2}
        title="Send Wi-Fi credentials"
        subtitle="Your home Wi-Fi SSID and password. The ESP uses these to reach the internet."
        active={currentStep === 1}
        done={wifiCredsSent}>
        <TextInput
          value={wifiSsid}
          onChangeText={setWifiSsid}
          placeholder="Home Wi-Fi SSID"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!wifiCredsSent}
          style={styles.input}
        />
        <TextInput
          value={wifiPassword}
          onChangeText={setWifiPassword}
          placeholder="Home Wi-Fi password"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!wifiCredsSent}
          style={styles.input}
        />
        <PrimaryButton
          label={wifiCredsSent ? 'Sent' : 'Send Wi-Fi credentials'}
          loading={busy && currentStep === 1}
          disabled={wifiCredsSent || !wifiSsid.trim() || !wifiPassword.trim()}
          onPress={runStep1}
        />
      </StepCard>

      <StepCard
        n={3}
        title="Set permanent password"
        subtitle={`Exactly ${PERMANENT_PASS_LENGTH} characters using 0-9, A-D, # and *.`}
        active={currentStep === 2}
        done={permanentPassSent}>
        <TextInput
          value={permanentPass}
          onChangeText={onPermanentPassChange}
          placeholder="e.g. 1234ABCD"
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!permanentPassSent}
          style={styles.input}
        />
        <Text style={styles.helper}>
          {permanentPassError ??
            `${permanentPass.length}/${PERMANENT_PASS_LENGTH} characters`}
        </Text>
        <PrimaryButton
          label={permanentPassSent ? 'Saved' : 'Save permanent password'}
          loading={busy && currentStep === 2}
          disabled={permanentPassSent || !isValidPermanentPass(permanentPass)}
          onPress={runStep2}
        />
      </StepCard>

      <StepCard
        n={4}
        title="Random SoftAP password"
        subtitle="Generate a strong password for the ESP's own Wi-Fi. Saved to this phone for step 5."
        active={currentStep === 3}
        done={randomPassSent}>
        {randomPass ? (
          <View style={styles.passCard}>
            <Text style={styles.passText}>{randomPass}</Text>
          </View>
        ) : null}
        <PrimaryButton
          label="Generate"
          variant="secondary"
          disabled={randomPassSent}
          onPress={onGenerateRandom}
        />
        <PrimaryButton
          label={randomPassSent ? 'Sent & saved' : 'Send & save'}
          loading={busy && currentStep === 3}
          disabled={randomPassSent || !randomPass}
          onPress={runStep3}
        />
      </StepCard>

      <StepCard
        n={5}
        title="Pair module"
        subtitle="Switch your phone to the ESPMODULE Wi-Fi in your phone settings, then come back and tap Start Pairing."
        active={currentStep === 4}
        done={modulePaired}>
        <PrimaryButton
          label={modulePaired ? 'Paired' : 'Start pairing'}
          loading={busy && currentStep === 4}
          disabled={modulePaired}
          onPress={runStep4}
        />
      </StepCard>

      {currentStep === 5 ? (
        <View style={styles.doneCard}>
          <Text style={styles.doneTitle}>Setup complete</Text>
          <Text style={styles.doneBody}>
            Your ESP main and module are configured. Reconnect the phone to your
            home Wi-Fi to use the app normally.
          </Text>
        </View>
      ) : null}

      <View style={styles.divider} />

      <View style={styles.card}>
        <Text style={styles.section}>Link an existing device</Text>
        {!isLoggedIn ? (
          <Text style={styles.helper}>Sign in required.</Text>
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
          loading={linkBusy}
          disabled={!isLoggedIn}
          onPress={linkDevice}
        />
        {linkStatus ? <Text style={styles.helper}>{linkStatus}</Text> : null}
      </View>
    </Screen>
  );
}

function StepIndicator({ current }: { current: Step }) {
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
      {active || done ? <Text style={styles.helper}>{subtitle}</Text> : null}
      {active && !done ? (
        <View style={styles.cardBody}>{children}</View>
      ) : null}
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
    opacity: 0.75,
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
  helper: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.75,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  statusCard: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
  },
  statusText: {
    fontSize: 13,
    lineHeight: 18,
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

