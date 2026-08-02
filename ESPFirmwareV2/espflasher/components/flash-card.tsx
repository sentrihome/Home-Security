/**
 * Flash card — esptool-js flashing with terminal output, progress bar, and result banners.
 * Security panel aesthetic: sharp corners, charcoal card, amber glow during flash.
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
  const isFlashing = ["connecting", "erasing", "writing", "verifying"].includes(flashPhase);

  const terminalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines.length]);

  const phaseLabel = isFlashing
    ? `${flashPhase.charAt(0).toUpperCase() + flashPhase.slice(1)}${isSuccess ? "" : "..."}`
    : isSuccess
      ? "COMPLETE"
      : "";

  const cardGlow = isSuccess
    ? "glow-green"
    : isError
      ? "glow-red"
      : isFlashing
        ? "glow-amber"
        : "";

  return (
    <Card className={`sharp-card charcoal-card card-hover ${cardGlow}`}>
      {/* Card header — pb-4 for larger text */}
      <CardHeader className="pb-4">
        <CardTitle className="text-[15px] font-semibold tracking-[0.15em] uppercase text-primary-content flex items-center gap-3">
          {/* Icon box — 24px to match larger header text */}
          <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-[oklch(0.16_0.005_260)] border border-border">
            <Zap className="h-4 w-4 text-secondary-content" />
          </div>
          Flash Operation
        </CardTitle>
      </CardHeader>
      {/* Card content — 28px padding, 20px between sections, 12px between related rows */}
      <CardContent className="space-y-5 px-7 py-7">
        {/* Idle state */}
        {flashPhase === "idle" && (
          <>
            <p className="text-sm text-secondary-content leading-relaxed">
              Firmware and device ready. Click below to write firmware to the connected ESP32/ESP8266.
            </p>
            <Button
              size="lg"
              className="w-full gap-2 font-mono text-sm uppercase tracking-[0.15em] steel-btn rounded-sm py-3.5 px-6"
              onClick={flashDevice}
              disabled={!selectors.canFlash}
            >
              <Zap className="h-4.5 w-4.5" />
              Flash Device
            </Button>
          </>
        )}

        {/* Flashing — progress + terminal */}
        {isFlashing && (
          <>
            {/* Phase label + percentage — 12px gap */}
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono text-amber-500 tracking-[0.15em] uppercase font-semibold">{phaseLabel}</span>
              <span className="font-mono text-meta">{Math.round(flashProgress)}%</span>
            </div>
            {/* Progress bar — 12px below label */}
            <Progress value={flashProgress} className="h-1.5 amber-progress sharp-card" />
            {/* Target badge — 12px below progress */}
            {chipName && (
              <Badge variant="secondary" className="font-mono text-sm tracking-wider rounded-sm">
                TARGET: {chipName}
              </Badge>
            )}
            {/* Terminal — 20px below content group */}
            <div className="rounded-sm border border-border/60 bg-[oklch(0.05_0.005_260)]">
              <div className="flex items-center gap-2 border-b border-border/40 bg-[oklch(0.095_0.005_260)] px-3 py-1.5 text-xs font-mono text-meta tracking-[0.15em] uppercase">
                <Terminal className="h-3.5 w-3.5" />
                esptool.js output
              </div>
              <div
                ref={terminalRef}
                className="max-h-[200px] overflow-y-auto p-3 font-mono text-sm leading-relaxed text-green-400/80 space-y-1"
              >
                {terminalLines.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Success — 20px from previous section */}
        {isSuccess && (
          <>
            <Alert className="sharp-card border-green-500/30 bg-green-500/5 rounded-sm px-4 py-3.5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <AlertTitle className="text-green-500 font-mono text-sm uppercase tracking-[0.15em] font-semibold">FLASH SUCCESSFUL</AlertTitle>
                  <AlertDescription className="text-green-500/70 text-sm leading-relaxed mt-1.5">
                    Firmware flashed to the device. The chip will now boot into your new firmware.
                  </AlertDescription>
                </div>
              </div>
            </Alert>
            <Button size="sm" onClick={() => window.location.reload()} className="gap-2 font-mono text-sm uppercase tracking-[0.15em] steel-btn rounded-sm py-2.5 px-5">
              <span className="icon-hover">
                <RefreshCw className="h-4 w-4" />
              </span>
              Flash Another Device
            </Button>
          </>
        )}

        {/* Error */}
        {isError && (
          <>
            <Alert variant="destructive" className="sharp-card rounded-sm px-4 py-3.5">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <AlertTitle className="font-mono text-sm uppercase tracking-[0.15em] font-semibold">FLASH FAILED</AlertTitle>
                  <AlertDescription className="text-sm leading-relaxed mt-1.5">{flashError}</AlertDescription>
                </div>
              </div>
            </Alert>
            <div className="flex gap-2">
              <Button size="sm" onClick={flashDevice} disabled={!selectors.canFlash} className="gap-2 font-mono text-sm uppercase tracking-[0.15em] steel-btn rounded-sm py-2.5 px-5">
                <span className="icon-hover">
                  <RefreshCw className="h-4 w-4" />
                </span>
                Retry
              </Button>
            </div>
            {terminalLines.length > 0 && (
              <div className="rounded-sm border border-border/60 bg-[oklch(0.05_0.005_260)]">
                <div className="flex items-center gap-2 border-b border-border/40 bg-[oklch(0.095_0.005_260)] px-3 py-1.5 text-xs font-mono text-meta tracking-[0.15em] uppercase">
                  <Terminal className="h-3.5 w-3.5" />
                  esptool.js output
                </div>
                <div className="max-h-[200px] overflow-y-auto p-3 font-mono text-sm leading-relaxed text-green-400/80 space-y-1">
                  {terminalLines.map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Not ready — 20px from previous section */}
        {flashPhase === "idle" && (
          <>
            {!selectors.canFlash && selectors.hasFirmwareBinary && !selectors.isConnected && (
              <p className="text-sm font-mono text-meta">CONNECT DEVICE TO ENABLE FLASH</p>
            )}
            {!selectors.canFlash && selectors.isConnected && !selectors.hasFirmwareBinary && (
              <p className="text-sm font-mono text-meta">DOWNLOAD FIRMWARE TO ENABLE FLASH</p>
            )}
            {!selectors.canFlash && !selectors.hasFirmwareBinary && !selectors.isConnected && (
              <p className="text-sm font-mono text-meta">DOWNLOAD FIRMWARE AND CONNECT DEVICE</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
