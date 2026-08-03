/**
 * Web Serial unsupported browser alert.
 * Shown when navigator.serial is not available (Firefox, Safari, etc.)
 * Alarm red aesthetic — sharp corners, deep charcoal.
 */

"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldOff } from "lucide-react";

export function UnsupportedBrowserAlert() {
  return (
    <Alert variant="destructive" className="sharp-card rounded-sm glow-red">
      <ShieldOff className="h-4 w-4 text-red-500" />
      <AlertTitle className="font-mono text-xs uppercase tracking-wider text-red-500">Web Serial Not Supported</AlertTitle>
      <AlertDescription className="text-xs">
        Web Serial isn&apos;t supported in this browser. Please use{" "}
        <strong>Chrome</strong> or <strong>Edge</strong> on a desktop computer.
        Flashing ESP32/ESP8266 devices requires a Chromium-based browser running
        over HTTPS or localhost.
      </AlertDescription>
    </Alert>
  );
}
