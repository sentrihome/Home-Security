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
import { Separator } from "@/components/ui/separator";
import { FlasherProvider, useFlasher } from "@/hooks/use-flasher-state";

export default function Home() {
  return (
    <FlasherProvider>
      <main className="mx-auto max-w-xl px-4 py-8 space-y-6">
        {/* Header */}
        <Header />

        {/* Web Serial support check — only shown in FlasherProvider context */}
        <WebSerialCheck />

        <Separator />

        {/* Stacked feature cards */}
        <FeatureCards />
      </main>
    </FlasherProvider>
  );
}

/**
 * Check Web Serial support from within the FlasherProvider context.
 * Shows the fallback alert when unsupported.
 */
function WebSerialCheck() {
  return null; // Feature detection handled in DeviceSelectCard
}

/**
 * Stacked feature cards — only rendered when Web Serial is supported.
 */
function FeatureCards() {
  const isSupported =
    typeof navigator !== "undefined" && "serial" in navigator;

  if (!isSupported) {
    return <UnsupportedBrowserAlert />;
  }

  return (
    <>
      <FirmwareCheckCard />
      <DownloadCard />
      <DeviceSelectCard />
      <FlashCard />
    </>
  );
}
