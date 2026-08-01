/**
 * Header — app name, firmware metadata, status pill, and dark mode toggle.
 */

"use client";

import { Cpu, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFlasher } from "@/hooks/use-flasher-state";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/** Minimal firmware metadata shape from /api/firmware/latest. */
type FirmwareMeta = { version: string; release: string };

export function Header() {
  const { selectors } = useFlasher();
  const { theme, setTheme } = useTheme();

  const statusLabel = selectors.isConnected
    ? "Device Connected"
    : selectors.isFlashing
      ? "Flashing..."
      : "Not Connected";

  const statusVariant: "default" | "secondary" | "destructive" =
    selectors.isConnected
      ? "default"
      : selectors.isFlashing
        ? "secondary"
        : "secondary";

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Cpu className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">ESP Flasher</h1>
          <FirmwareMetaLabel />
          <p className="text-lg text-muted-foreground">
            Update your home security modules
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant={statusVariant} className="gap-1 font-mono text-xs">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              selectors.isConnected ? "bg-green-400" : "bg-muted-foreground/50"
            }`}
          />
          {statusLabel}
        </Badge>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle dark mode"
        >
          <Zap className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Fetches firmware metadata from the local API and renders
 * a version badge + release-date label row.
 */
function FirmwareMetaLabel() {
  const [meta, setMeta] = useState<FirmwareMeta | null>(null);

  useEffect(() => {
    fetch("/api/firmware/latest")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMeta)
      .catch(() => null);
  }, []);

  if (!meta) return null;

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="font-mono text-sm">{meta.version}</Badge>
      <span className="text-xs text-muted-foreground/50">&middot;</span>
      <p className="text-sm font-mono text-muted-foreground">{meta.release}</p>
    </div>
  );
}
