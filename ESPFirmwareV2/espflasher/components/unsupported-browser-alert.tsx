/**
 * Web Serial unsupported browser alert.
 * Shown when navigator.serial is not available (Firefox, Safari, etc.)
 */

"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Cpu } from "lucide-react";

export function UnsupportedBrowserAlert() {
  return (
    <Alert variant="destructive">
      <Cpu className="h-4 w-4" />
      <AlertTitle>Web Serial Not Supported</AlertTitle>
      <AlertDescription>
        Web Serial isn&apos;t supported in this browser. Please use{" "}
        <strong>Chrome</strong> or <strong>Edge</strong> on a desktop computer.
        Flashing ESP32/ESP8266 devices requires a Chromium-based browser running
        over HTTPS or localhost.
      </AlertDescription>
    </Alert>
  );
}
