/**
 * Flasher state machine — the backbone of ESP Flasher.
 * Single React Context + useReducer with discriminated union actions.
 * All components read from this context; buttons are enabled/disabled
 * via derived selectors computed in the provider.
 */

import {
  createContext,
  useContext,
  useReducer,
  useState,
  useEffect,
} from "react";
import type { SerialPortInfo, SerialPort } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

export type FirmwarePhase =
  | "idle"
  | "checking"
  | "update-available"
  | "up-to-date"
  | "error";

export type DownloadPhase =
  | "idle"
  | "downloading"
  | "downloaded"
  | "cancelled"
  | "error";

export type DevicePhase =
  | "disconnected"
  | "selecting-port"
  | "connecting"
  | "connected"
  | "disconnecting";

export type FlashPhase =
  | "idle"
  | "connecting"
  | "erasing"
  | "writing"
  | "verifying"
  | "success"
  | "error";

export interface FirmwareVersionState {
  phase: FirmwarePhase;
  latestVersion: string | null;
  installedVersion: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  checkedAt: string | null;
}

export interface DownloadState {
  phase: DownloadPhase;
  bytesDownloaded: number;
  totalBytes: number;
  firmwareBinary: Uint8Array | null;
  error: string | null;
}

export interface DeviceState {
  phase: DevicePhase;
  portInfo: SerialPortInfo | null;
  serialPort: SerialPort | null;
  error: string | null;
}

export interface FlashOperationState {
  phase: FlashPhase;
  chipName: string | null;
  flashProgress: number;
  terminalLines: string[];
  error: string | null;
  downloadUrl: string | null;
  targetVersion: string | null;
}

export interface FlasherState {
  firmwareVersion: FirmwareVersionState;
  downloadProgress: DownloadState;
  device: DeviceState;
  flashOperation: FlashOperationState;
}

// ── Initial state ────────────────────────────────────────────────────────────

const STORED_VERSION_KEY = "espflasher-installed-version";

function getInstalledVersion(): string {
  if (typeof localStorage === "undefined") return "v0.0.0";
  return localStorage.getItem(STORED_VERSION_KEY) ?? "v0.0.0";
}

export const INITIAL_STATE: FlasherState = {
  firmwareVersion: {
    phase: "idle",
    latestVersion: null,
    installedVersion: getInstalledVersion(),
    releaseNotes: null,
    releaseDate: null,
    checkedAt: null,
  },
  downloadProgress: {
    phase: "idle",
    bytesDownloaded: 0,
    totalBytes: 0,
    firmwareBinary: null,
    error: null,
  },
  device: {
    phase: "disconnected",
    portInfo: null,
    serialPort: null,
    error: null,
  },
  flashOperation: {
    phase: "idle",
    chipName: null,
    flashProgress: 0,
    terminalLines: [],
    error: null,
    downloadUrl: null,
    targetVersion: null,
  },
};

// ── Actions (discriminated union) ────────────────────────────────────────────

export type FlasherAction =
  // Firmware check
  | { type: "CHECK_STARTED" }
  | { type: "CHECK_COMPLETE"; version: string; releaseNotes: string; releaseDate: string | null }

  // Download
  | { type: "DOWNLOAD_STARTED"; totalBytes: number }
  | { type: "DOWNLOAD_PROGRESS"; bytesDownloaded: number; totalBytes: number }
  | { type: "DOWNLOAD_COMPLETE"; firmwareBinary: Uint8Array }
  | { type: "DOWNLOAD_CANCELLED" }
  | { type: "DOWNLOAD_ERROR"; error: string }

  // Device
  | { type: "DEVICE_SELECTING_PORT" }
  | { type: "DEVICE_CONNECTING" }
  | { type: "DEVICE_CONNECTED"; portInfo: SerialPortInfo; serialPort: SerialPort }
  | { type: "DEVICE_DISCONNECTED" }
  | { type: "DEVICE_ERROR"; error: string }

  // Flash
  | { type: "FLASH_CONNECTING" }
  | { type: "FLASH_ERASING" }
  | { type: "FLASH_WRITING" }
  | { type: "FLASH_VERIFYING" }
  | { type: "FLASH_PROGRESS"; flashProgress: number; phase: string }
  | { type: "FLASH_LOG"; text: string }
  | { type: "FLASH_LOG_CLEAR" }
  | { type: "FLASH_CHIP_DETECTED"; chipName: string }
  | { type: "FLASH_SUCCESS"; targetVersion: string }
  | { type: "FLASH_ERROR"; error: string };

// ── Reducer ──────────────────────────────────────────────────────────────────

export function flasherReducer(
  state: FlasherState,
  action: FlasherAction,
): FlasherState {
  switch (action.type) {
    // Firmware check
    case "CHECK_STARTED":
      return {
        ...state,
        firmwareVersion: {
          ...state.firmwareVersion,
          phase: "checking",
          latestVersion: null,
          releaseNotes: null,
        },
      };

    case "CHECK_COMPLETE":
      const isUpToDate =
        action.version === state.firmwareVersion.installedVersion;
      return {
        ...state,
        firmwareVersion: {
          ...state.firmwareVersion,
          phase: isUpToDate ? "up-to-date" : "update-available",
          latestVersion: action.version,
          releaseNotes: action.releaseNotes,
          releaseDate: action.releaseDate,
          checkedAt: new Date().toISOString(),
        },
      };

    // Download
    case "DOWNLOAD_STARTED":
      return {
        ...state,
        downloadProgress: {
          phase: "downloading",
          bytesDownloaded: 0,
          totalBytes: action.totalBytes,
          firmwareBinary: null,
          error: null,
        },
      };

    case "DOWNLOAD_PROGRESS":
      return {
        ...state,
        downloadProgress: {
          ...state.downloadProgress,
          bytesDownloaded: action.bytesDownloaded,
          totalBytes: action.totalBytes || action.bytesDownloaded,
        },
      };

    case "DOWNLOAD_COMPLETE":
      return {
        ...state,
        downloadProgress: {
          ...state.downloadProgress,
          phase: "downloaded",
          firmwareBinary: action.firmwareBinary,
        },
      };

    case "DOWNLOAD_CANCELLED":
      return {
        ...state,
        downloadProgress: {
          ...state.downloadProgress,
          phase: "cancelled",
        },
      };

    case "DOWNLOAD_ERROR":
      return {
        ...state,
        downloadProgress: {
          ...state.downloadProgress,
          phase: "error",
          error: action.error,
        },
      };

    // Device
    case "DEVICE_SELECTING_PORT":
      return { ...state, device: { ...state.device, phase: "selecting-port" } };

    case "DEVICE_CONNECTING":
      return { ...state, device: { ...state.device, phase: "connecting" } };

    case "DEVICE_CONNECTED":
      return {
        ...state,
        device: {
          phase: "connected",
          portInfo: action.portInfo,
          serialPort: action.serialPort,
          error: null,
        },
      };

    case "DEVICE_DISCONNECTED":
      return {
        ...state,
        device: {
          phase: "disconnected",
          portInfo: null,
          serialPort: null,
          error: null,
        },
      };

    case "DEVICE_ERROR":
      return {
        ...state,
        device: {
          ...state.device,
          phase: "disconnected",
          error: action.error,
        },
      };

    // Flash
    case "FLASH_CONNECTING":
      return {
        ...state,
        flashOperation: {
          ...state.flashOperation,
          phase: "connecting",
          terminalLines: [],
          error: null,
          flashProgress: 0,
        },
      };

    case "FLASH_ERASING":
      return {
        ...state,
        flashOperation: {
          ...state.flashOperation,
          phase: "erasing",
          flashProgress: 0,
        },
      };

    case "FLASH_WRITING":
      return {
        ...state,
        flashOperation: {
          ...state.flashOperation,
          phase: "writing",
          flashProgress: 0,
        },
      };

    case "FLASH_VERIFYING":
      return {
        ...state,
        flashOperation: {
          ...state.flashOperation,
          phase: "verifying",
        },
      };

    case "FLASH_PROGRESS":
      if (
        state.flashOperation.phase !== "writing" &&
        state.flashOperation.phase !== "erasing"
      ) {
        return state;
      }
      return {
        ...state,
        flashOperation: {
          ...state.flashOperation,
          flashProgress: action.flashProgress,
        },
      };

    case "FLASH_LOG":
      return {
        ...state,
        flashOperation: {
          ...state.flashOperation,
          terminalLines: [...state.flashOperation.terminalLines, action.text],
        },
      };

    case "FLASH_LOG_CLEAR":
      return {
        ...state,
        flashOperation: {
          ...state.flashOperation,
          terminalLines: [],
        },
      };

    case "FLASH_CHIP_DETECTED":
      return {
        ...state,
        flashOperation: {
          ...state.flashOperation,
          chipName: action.chipName,
        },
      };

    case "FLASH_SUCCESS":
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORED_VERSION_KEY, action.targetVersion);
      }
      return {
        ...state,
        flashOperation: {
          ...state.flashOperation,
          phase: "success",
          targetVersion: action.targetVersion,
          error: null,
        },
        firmwareVersion: {
          ...state.firmwareVersion,
          installedVersion: action.targetVersion,
        },
      };

    case "FLASH_ERROR":
      return {
        ...state,
        flashOperation: {
          ...state.flashOperation,
          phase: "error",
          error: action.error,
        },
      };

    default:
      return state;
  }
}

// ── Derived selectors ────────────────────────────────────────────────────────

export interface FlasherSelectors {
  canCheckFirmware: boolean;
  canDownload: boolean;
  canFlash: boolean;
  isFlashing: boolean;
  isConnected: boolean;
  hasFirmwareBinary: boolean;
  hasLatestVersion: boolean;
}

function computeSelectors(state: FlasherState): FlasherSelectors {
  return {
    canCheckFirmware:
      state.firmwareVersion.phase === "idle" ||
      state.firmwareVersion.phase === "up-to-date" ||
      state.firmwareVersion.phase === "update-available",
    canDownload: state.firmwareVersion.phase === "update-available",
    canFlash:
      state.downloadProgress.phase === "downloaded" &&
      state.device.phase === "connected",
    isFlashing: [
      "connecting",
      "erasing",
      "writing",
      "verifying",
    ].includes(state.flashOperation.phase),
    isConnected: state.device.phase === "connected",
    hasFirmwareBinary: state.downloadProgress.firmwareBinary !== null,
    hasLatestVersion: state.firmwareVersion.latestVersion !== null,
  };
}

// ── Context & Provider ───────────────────────────────────────────────────────

interface FlasherContextValue {
  state: FlasherState;
  dispatch: React.Dispatch<FlasherAction>;
  selectors: FlasherSelectors;
}

const FlasherContext = createContext<FlasherContextValue | null>(null);

export function useFlasher(): FlasherContextValue {
  const ctx = useContext(FlasherContext);
  if (!ctx) throw new Error("useFlasher must be used within FlasherProvider");
  return ctx;
}

export function FlasherProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(flasherReducer, INITIAL_STATE);
  const [selectors, setSelectors] = useState<FlasherSelectors>(() =>
    computeSelectors(INITIAL_STATE),
  );

  useEffect(() => {
    setSelectors(computeSelectors(state));
  }, [
    state.firmwareVersion.phase,
    state.device.phase,
    state.downloadProgress.phase,
    state.flashOperation.phase,
  ]);

  return (
    <FlasherContext.Provider value={{ state, dispatch, selectors }}>
      {children}
    </FlasherContext.Provider>
  );
}
