/**
 * Flash card — real esptool-js flashing with terminal output streaming, progress bar, and result banners.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Zap, RefreshCw, CheckCircle2, XCircle, Terminal } from "lucide-react";
import { useFlasher } from "@/hooks/use-flasher-state";
import { useFlashOperation } from "@/hooks/use-flash-operation";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function FlashCard() {
  const { state, selectors } = useFlasher();
  const { flashDevice, flashPhase, flashProgress, terminalLines, chipName, flashError } = useFlashOperation();

  const isSuccess = flashPhase === "success";
  const isError = flashPhase === "error";
  const isFlashing = [
    "connecting",
    "erasing",
    "writing",
    "verifying",
  ].includes(flashPhase);

  // Scroll terminal to bottom on new lines
  const terminalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines.length]);

  // Phase label for progress bar
  const phaseLabel = isFlashing
    ? `${flashPhase.charAt(0).toUpperCase() + flashPhase.slice(1)}${isSuccess ? "" : "..."}`
    : isSuccess
      ? "Complete"
      : "";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          Flash Operation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Flash button */}
        {flashPhase === "idle" && (
          <>
            <p className="text-sm text-muted-foreground">
              Firmware and device ready. Click below to write firmware to the connected ESP32/ESP8266.
            </p>

            <Button
              size="lg"
              className="w-full gap-2 font-semibold"
              onClick={flashDevice}
              disabled={!selectors.canFlash}
            >
              <Zap className="h-5 w-5" />
              Flash Device
            </Button>
          </>
        )}

        {/* Flashing — progress + terminal */}
        {isFlashing && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{phaseLabel}</span>
              <span className="font-mono text-xs text-muted-foreground">{Math.round(flashProgress)}%</span>
            </div>
            <Progress value={flashProgress} className="h-2" />

            {chipName && (
              <Badge variant="secondary" className="text-xs font-mono">
                Target: {chipName}
              </Badge>
            )}

            {/* Terminal log */}
            <div className="rounded-lg bg-black/80 border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 text-xs text-muted-foreground">
                <Terminal className="h-3 w-3" />
                esptool.js output
              </div>
              <div
                ref={terminalRef}
                className="max-h-[240px] overflow-y-auto p-3 font-mono text-xs leading-relaxed text-green-400/90 space-y-0.5"
              >
                {terminalLines.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Success banner */}
        {isSuccess && (
          <>
            <Alert className="border-green-500/50 bg-green-500/10 dark:bg-green-500/20">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertTitle className="text-green-600 dark:text-green-400">Flash successful!</AlertTitle>
              <AlertDescription>
                Firmware flashed to the device. The chip will now boot into your new firmware.
              </AlertDescription>
            </Alert>

            <Button size="sm" onClick={() => window.location.reload()} className="gap-1">
              <RefreshCw className="h-3.5 w-3.5" />
              Flash Another Device
            </Button>
          </>
        )}

        {/* Error banner */}
        {isError && (
          <>
            <Alert variant="destructive" className="text-sm">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Flash failed</AlertTitle>
              <AlertDescription>{flashError}</AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button size="sm" onClick={flashDevice} disabled={!selectors.canFlash} className="gap-1">
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>

            {/* Show terminal output even on error */}
            {terminalLines.length > 0 && (
              <div className="rounded-lg bg-black/80 border border-border overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 text-xs text-muted-foreground">
                  <Terminal className="h-3 w-3" />
                  esptool.js output
                </div>
                <div className="max-h-[240px] overflow-y-auto p-3 font-mono text-xs leading-relaxed text-green-400/90 space-y-0.5">
                  {terminalLines.map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Not ready */}
        {(flashPhase === "idle") && (
          <>
            {!selectors.canFlash && selectors.hasFirmwareBinary && !selectors.isConnected && (
              <p className="text-xs text-muted-foreground">Connect a device to enable flashing.</p>
            )}
            {!selectors.canFlash && selectors.isConnected && !selectors.hasFirmwareBinary && (
              <p className="text-xs text-muted-foreground">Download firmware first to enable flashing.</p>
            )}
            {!selectors.canFlash && !selectors.hasFirmwareBinary && !selectors.isConnected && (
              <p className="text-xs text-muted-foreground">Download firmware and connect a device to enable flashing.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
