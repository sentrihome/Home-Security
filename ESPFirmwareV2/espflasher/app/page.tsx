/**
 * Main page — orchestrator for ESP Flasher.
 * Wires all hooks and components together via the FlasherProvider context.
 */

"use client";

import { Header } from "@/components/header";
import { UnsupportedBrowserAlert } from "@/components/unsupported-browser-alert";
import { FirmwareCheckCard } from "@/components/firmware-check";
import { DownloadCard } from "@/components/download-card";
import { DeviceSelectCard } from "@/components/device-select";
import { FlashCard } from "@/components/flash-card";
import { FlasherProvider } from "@/hooks/use-flasher-state";

export default function Home() {
  return (
    <FlasherProvider>
      <main className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        <HeroHeader />
        <WebSerialCheck />
        <FeatureCards />
      </main>
    </FlasherProvider>
  );
}

function HeroHeader() {
  const isSupported =
    typeof navigator !== "undefined" && "serial" in navigator;
  if (!isSupported) return null;
  return <Header />;
}

function WebSerialCheck() {
  return null;
}

function FeatureCards() {
  const isSupported =
    typeof navigator !== "undefined" && "serial" in navigator;

  if (!isSupported) {
    return <UnsupportedBrowserAlert />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FirmwareCheckCard />
      <DeviceSelectCard />
      <DownloadCard />
      <FlashCard />
    </div>
  );
}
