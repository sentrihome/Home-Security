import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  DEFAULT_PI_HOST,
  TAILSCALE_PI_HOST,
  computePiBaseUrl,
  normalizePiHost,
  setPiBaseUrlOverride,
} from '@/lib/config';
import { loadPiHost, savePiHost } from '@/lib/storage';

export type WizardStep = 0 | 1 | 2;

type SetupWizardContextValue = {
  currentStep: WizardStep;
  setCurrentStep: (step: WizardStep) => void;
  piHost: string;
  piBaseUrl: string;
  isLoading: boolean;
  setPiHost: (host: string) => Promise<void>;
  advanceFromPiSetup: () => void;
};

const SetupWizardContext = createContext<SetupWizardContextValue | null>(null);

/** Prefer LAN. Treat empty or the old Tailscale default as “use LAN”. */
function resolveStoredPiHost(stored: string | null | undefined): string {
  const normalized = normalizePiHost(stored ?? '');
  if (!normalized || normalized === TAILSCALE_PI_HOST) {
    return DEFAULT_PI_HOST;
  }
  return normalized;
}

export function SetupWizardProvider({ children }: { children: ReactNode }) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(0);
  const [piHost, setPiHostState] = useState(DEFAULT_PI_HOST);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await loadPiHost();
        if (cancelled) return;
        const host = resolveStoredPiHost(stored);
        setPiHostState(host);
        setPiBaseUrlOverride(computePiBaseUrl(host));
        if (stored) {
          setCurrentStep(1);
          if (normalizePiHost(stored) === TAILSCALE_PI_HOST && host === DEFAULT_PI_HOST) {
            await savePiHost(host);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setPiHost = useCallback(async (host: string) => {
    const normalized = normalizePiHost(host) || DEFAULT_PI_HOST;
    setPiHostState(normalized);
    const baseUrl = computePiBaseUrl(normalized);
    setPiBaseUrlOverride(baseUrl);
    await savePiHost(normalized);
  }, []);

  const advanceFromPiSetup = useCallback(() => {
    setCurrentStep(1);
  }, []);

  const piBaseUrl = useMemo(() => computePiBaseUrl(piHost), [piHost]);

  const value = useMemo<SetupWizardContextValue>(
    () => ({
      currentStep,
      setCurrentStep,
      piHost,
      piBaseUrl,
      isLoading,
      setPiHost,
      advanceFromPiSetup,
    }),
    [currentStep, piHost, piBaseUrl, isLoading, setPiHost, advanceFromPiSetup]
  );

  return (
    <SetupWizardContext.Provider value={value}>{children}</SetupWizardContext.Provider>
  );
}

export function useSetupWizard() {
  const ctx = useContext(SetupWizardContext);
  if (!ctx) {
    throw new Error('useSetupWizard must be used within SetupWizardProvider');
  }
  return ctx;
}
