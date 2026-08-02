/**
 * Firmware version check card — shows latest firmware info, offers download.
 * Security panel aesthetic: sharp corners, charcoal card, shield icons.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, Loader2, Shield, ShieldCheck } from "lucide-react";
import { useFlasher } from "@/hooks/use-flasher-state";
import { useFirmwareCheck } from "@/hooks/use-firmware-check";

export function FirmwareCheckCard() {
  const { selectors } = useFlasher();
  const { latestVersion, releaseNotes, releaseDate, firmwarePhase, checkForUpdates } =
    useFirmwareCheck();

  const checking = firmwarePhase === "checking";
  const isUpToDate = firmwarePhase === "up-to-date";
  const hasUpdate = firmwarePhase === "update-available";
  const error = firmwarePhase === "error" && releaseNotes?.startsWith("Error:");

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      checkForUpdates();
    }
  }, [checkForUpdates]);

  const cardGlow = isUpToDate
    ? "glow-green"
    : hasUpdate
      ? "glow-amber"
      : "";

  return (
    <Card className={`sharp-card charcoal-card card-hover ${cardGlow}`}>
      <CardHeader className="pb-4">
        <CardTitle className="text-[15px] font-semibold tracking-[0.15em] uppercase text-primary-content flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-[oklch(0.16_0.005_260)] border border-border">
            {isUpToDate ? (
              <ShieldCheck className="h-4 w-4 text-green-500" />
            ) : (
              <Shield className="h-4 w-4 text-secondary-content" />
            )}
          </div>
          Firmware Version
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 px-7 py-7">
        {checking && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
            <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
            <span className="tracking-[0.15em] uppercase font-semibold">Checking for updates...</span>
          </div>
        )}

        {!checking && !hasUpdate && !isUpToDate && !error && (
          <Alert className="sharp-card rounded-sm border-border/40 bg-[oklch(0.095_0.005_260)] px-4 py-3.5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <AlertTitle className="text-green-500 font-mono text-sm uppercase tracking-[0.15em] font-semibold">NO UPDATE</AlertTitle>
                <AlertDescription className="text-secondary-content text-sm leading-relaxed mt-1.5">
                  Firmware is current. Check back for new releases.
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        {!checking && isUpToDate && (
          <>
            {/* Version + date rows — 12px between them */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono text-meta tracking-[0.15em] uppercase">Latest version</span>
                <Badge variant="default" className="font-mono text-[15px] tracking-wider rounded-sm steel-btn !px-3 !py-1">
                  {latestVersion}
                </Badge>
              </div>
              {releaseDate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono text-meta tracking-[0.15em] uppercase">Release date</span>
                  <span className="font-mono text-sm text-primary-content">{releaseDate}</span>
                </div>
              )}
            </div>
            {/* Secure alert — 20px below version rows */}
            <Alert className="sharp-card border-green-500/30 bg-green-500/5 rounded-sm px-4 py-3.5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <AlertTitle className="text-green-500 font-mono text-sm uppercase tracking-[0.15em] font-semibold">SECURE</AlertTitle>
                  <AlertDescription className="text-green-500/70 text-sm leading-relaxed mt-1.5">
                    Running the latest firmware version.
                  </AlertDescription>
                </div>
              </div>
            </Alert>
          </>
        )}

        {!checking && hasUpdate && latestVersion && (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono text-meta tracking-[0.15em] uppercase">Latest version</span>
                <Badge variant="default" className="font-mono text-[15px] tracking-wider rounded-sm amber-btn !px-3 !py-1">
                  {latestVersion}
                </Badge>
              </div>
              {releaseDate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono text-meta tracking-[0.15em] uppercase">Release date</span>
                  <span className="font-mono text-sm text-primary-content">{releaseDate}</span>
                </div>
              )}
            </div>
            {!error && releaseNotes && (
              <p className="text-sm text-secondary-content italic leading-relaxed">{releaseNotes}</p>
            )}
            {error && (
              <Alert variant="destructive" className="sharp-card rounded-sm px-4 py-3.5">
                <AlertTitle className="font-mono text-sm uppercase tracking-[0.15em] font-semibold">ERROR</AlertTitle>
                <AlertDescription className="text-sm leading-relaxed mt-1.5">{releaseNotes}</AlertDescription>
              </Alert>
            )}
          </>
        )}

        {/* Check button row — 20px below content */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={checkForUpdates}
            disabled={!selectors.canCheckFirmware || checking}
            className="gap-2 font-mono text-sm rounded-sm py-2.5 px-5"
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="icon-hover">
                <Shield className="h-4 w-4" />
              </span>
            )}
            Check for Updates
          </Button>

          {hasUpdate && !error && (
            <span className="text-sm font-mono text-amber-500 self-center tracking-[0.15em] font-semibold">
              UPDATE AVAILABLE
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
