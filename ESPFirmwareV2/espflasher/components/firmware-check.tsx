/**
 * Firmware version check card — shows latest firmware info, offers download.
 */

"use client";

import { useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, Loader2, Cpu, RefreshCw } from "lucide-react";
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

  // Check for updates on mount
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      checkForUpdates();
    }
  }, [checkForUpdates]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          Firmware Version
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {checking && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking for updates...
          </div>
        )}

        {!checking && !hasUpdate && !isUpToDate && !error && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>No update</AlertTitle>
            <AlertDescription>
              Your firmware looks up to date. Check back later for new releases.
            </AlertDescription>
          </Alert>
        )}

        {!checking && isUpToDate && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Latest version available:</span>
                <Badge variant="default" className="font-mono">
                  {latestVersion}
                </Badge>
              </div>
            </div>
            <Alert className="border-green-500/50 bg-green-500/10 dark:bg-green-500/20">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertTitle className="text-green-600 dark:text-green-400">Up to date</AlertTitle>
              <AlertDescription>
                You are running the latest firmware version.
              </AlertDescription>
            </Alert>
          </>
        )}

        {!checking && hasUpdate && latestVersion && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Latest version available:</span>
                <Badge variant="default" className="font-mono">
                  {latestVersion}
                </Badge>
              </div>
              {releaseDate && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Release Date:</span>
                  <span className="font-mono text-sm">{releaseDate}</span>
                </div>
              )}
            </div>
            {!error && releaseNotes && (
              <p className="text-xs text-muted-foreground italic">{releaseNotes}</p>
            )}
            {error && (
              <Alert variant="destructive" className="text-sm">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{releaseNotes}</AlertDescription>
              </Alert>
            )}
          </>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={checkForUpdates}
            disabled={!selectors.canCheckFirmware || checking}
            className="gap-1"
          >
            {checking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Check for Updates
          </Button>

          {hasUpdate && !error && (
            <span className="text-xs text-muted-foreground self-center">
              Download available — see card below
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
