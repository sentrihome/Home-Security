/**
 * Download card — firmware download with progress and cancel.
 * Security panel aesthetic: sharp corners, charcoal card, steel blue progress.
 */

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Download, XCircle, CheckCircle2 } from "lucide-react";
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

  const { downloadFirmware, cancelDownload: cancelBinary, progressPercent } = useFirmwareDownload();
  const [downloadUrl] = useState<string | null>(null);

  const pythonDl = usePythonDownload();

  const cardGlow = isDownloaded
    ? "glow-green"
    : downloadError
      ? "glow-red"
      : "";

  return (
    <Card className={`sharp-card charcoal-card card-hover ${cardGlow}`}>
      <CardHeader className="pb-4">
        <CardTitle className="text-[15px] font-semibold tracking-[0.15em] uppercase text-primary-content flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-[oklch(0.16_0.005_260)] border border-border">
            <Download className="h-4 w-4 text-secondary-content" />
          </div>
          Firmware Download
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 px-7 py-7">
        {/* Active: Python download progress */}
        {pythonDl.phase === "running" && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono text-amber-500 tracking-[0.15em] uppercase font-semibold">
                {pythonDl.message
                  ? pythonDl.message.charAt(0).toUpperCase() + pythonDl.message.slice(1)
                  : "DOWNLOADING"}
              </span>
              <span className="font-mono text-meta">{(pythonDl.pct ?? 0).toFixed(1)}%</span>
            </div>
            <Progress value={pythonDl.pct ?? 0} className="h-1.5 amber-progress sharp-card" />
            {pythonDl.speedMbs != null && pythonDl.speedMbs > 0 && (
              <p className="text-sm font-mono text-meta">{pythonDl.speedMbs.toFixed(1)} MB/s</p>
            )}
            <Button variant="outline" size="sm" onClick={pythonDl.cancel} className="gap-2 font-mono text-sm rounded-sm py-2.5 px-5">
              <span className="icon-hover">
                <XCircle className="h-4 w-4" />
              </span>
              Cancel
            </Button>
          </>
        )}

        {/* Active: Python download complete */}
        {pythonDl.phase === "complete" && (
          <>
            <div className="flex items-center gap-2 text-sm text-green-500 font-mono font-semibold">
              <CheckCircle2 className="h-5 w-5" />
              <span className="tracking-[0.15em] uppercase">Firmware downloaded</span>
            </div>
            <p className="text-sm text-secondary-content font-mono leading-relaxed">
              SELECT DEVICE AND CLICK FLASH TO WRITE
            </p>
          </>
        )}

        {/* Active: Python download error */}
        {pythonDl.phase === "error" && (
          <Alert variant="destructive" className="sharp-card rounded-sm px-4 py-3.5">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <AlertTitle className="font-mono text-sm uppercase tracking-[0.15em] font-semibold">DOWNLOAD FAILED</AlertTitle>
                <AlertDescription className="text-sm leading-relaxed mt-1.5">{pythonDl.message}</AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        {/* Active: Binary download progress */}
        {isDownloading && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono text-secondary-content">
                {formatBytes(state.downloadProgress.bytesDownloaded)} /{" "}
                {formatBytes(state.downloadProgress.totalBytes || state.downloadProgress.bytesDownloaded)}
              </span>
              <span className="font-mono text-meta">{progressPercent.toFixed(1)}%</span>
            </div>
            <Progress value={progressPercent} className="h-1.5 steel-progress sharp-card" />
            <Button variant="outline" size="sm" onClick={cancelBinary} className="gap-2 font-mono text-sm rounded-sm py-2.5 px-5">
              <span className="icon-hover">
                <XCircle className="h-4 w-4" />
              </span>
              Cancel
            </Button>
          </>
        )}

        {/* Active: Binary download complete */}
        {isDownloaded && (
          <>
            <div className="flex items-center gap-2 text-sm text-green-500 font-mono font-semibold">
              <CheckCircle2 className="h-5 w-5" />
              <span className="tracking-[0.15em] uppercase">Firmware downloaded</span>
            </div>
            <p className="text-sm text-secondary-content font-mono leading-relaxed">
              SELECT DEVICE AND CLICK FLASH TO WRITE
            </p>
          </>
        )}

        {/* Active: Binary download error */}
        {downloadError && (
          <Alert variant="destructive" className="sharp-card rounded-sm px-4 py-3.5">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <AlertTitle className="font-mono text-sm uppercase tracking-[0.15em] font-semibold">DOWNLOAD FAILED</AlertTitle>
                <AlertDescription className="text-sm leading-relaxed mt-1.5">{state.downloadProgress.error}</AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        {/* Idle */}
        {pythonDl.phase === "idle" && !isDownloading && !isDownloaded && !downloadError && (
          <div className="flex justify-center">
            <Button size="lg" onClick={() => pythonDl.download()} disabled={false} className="gap-2 font-mono text-sm uppercase tracking-[0.15em] steel-btn rounded-sm py-3.5 px-8">
              <Download className="h-4.5 w-4.5" />
              Download Firmware
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
