/**
 * Download card — shows real progress while downloading firmware, with cancel button.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Download, XCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useFlasher } from "@/hooks/use-flasher-state";
import { useFirmwareDownload } from "@/hooks/use-firmware-download";
import { usePythonDownload } from "@/hooks/use-python-download";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function DownloadCard() {
  const { state, selectors } = useFlasher();
  const isDownloading = state.downloadProgress.phase === "downloading";
  const isDownloaded = state.downloadProgress.phase === "downloaded";
  const downloadError = state.downloadProgress.phase === "error";
  const hasUpdate = state.firmwareVersion.phase === "update-available";

  const { downloadFirmware, cancelDownload: cancelBinary, progressPercent } = useFirmwareDownload();
  const [downloadUrl] = useState<string | null>(null);

  // Python-script-driven download with polling progress
  const pythonDl = usePythonDownload();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Download className="h-4 w-4 text-muted-foreground" />
          Firmware Download
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active: Python download progress */}
        {pythonDl.phase === "running" && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {pythonDl.message
                  ? pythonDl.message.charAt(0).toUpperCase() + pythonDl.message.slice(1)
                  : "Downloading..."}
              </span>
              <span className="font-mono">{(pythonDl.pct ?? 0).toFixed(1)}%</span>
            </div>
            <Progress value={pythonDl.pct ?? 0} className="h-2" />
            {pythonDl.speedMbs != null && pythonDl.speedMbs > 0 && (
              <p className="text-xs text-muted-foreground">{pythonDl.speedMbs.toFixed(1)} MB/s</p>
            )}
            <Button variant="outline" size="sm" onClick={pythonDl.cancel} className="gap-1">
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </>
        )}

        {/* Active: Python download complete */}
        {pythonDl.phase === "complete" && (
          <>
            <div className="flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>Firmware downloaded successfully!</span>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Select a device and click "Flash" to write this firmware.
            </p>
          </>
        )}

        {/* Active: Python download error */}
        {pythonDl.phase === "error" && (
          <Alert variant="destructive" className="text-sm">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Download failed</AlertTitle>
            <AlertDescription>{pythonDl.message}</AlertDescription>
          </Alert>
        )}

        {/* Active: Binary download progress (kept for reference) */}
        {isDownloading && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {formatBytes(state.downloadProgress.bytesDownloaded)} /{" "}
                {formatBytes(state.downloadProgress.totalBytes || state.downloadProgress.bytesDownloaded)}
              </span>
              <span className="font-mono">{progressPercent.toFixed(1)}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            <Button variant="outline" size="sm" onClick={cancelBinary} className="gap-1">
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </>
        )}

        {/* Active: Binary download complete */}
        {isDownloaded && (
          <>
            <div className="flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>Firmware downloaded successfully!</span>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Select a device and click "Flash" to write this firmware.
            </p>
          </>
        )}

        {/* Active: Binary download error */}
        {downloadError && (
          <Alert variant="destructive" className="text-sm">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Download failed</AlertTitle>
            <AlertDescription>{state.downloadProgress.error}</AlertDescription>
          </Alert>
        )}

        {/* Idle: always show download button when no active state */}
        {pythonDl.phase === "idle" && !isDownloading && !isDownloaded && !downloadError && (
          <div className="flex justify-center">
            <Button size="lg" onClick={() => pythonDl.download()} disabled={false} className="gap-2 px-8">
              <Download className="h-4 w-4" />
              Firmware Download
            </Button>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
