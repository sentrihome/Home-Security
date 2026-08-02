/**
 * Header — security panel hero with status readout, armed indicator, and theme toggle.
 */

"use client";

import { Shield, ShieldOff, Zap, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFlasher } from "@/hooks/use-flasher-state";
import { useTheme } from "@/components/theme-provider";
import { useEffect, useState } from "react";

type FirmwareMeta = { version: string; release: string };

export function Header() {
  const { selectors } = useFlasher();
  const { theme, setTheme } = useTheme();

  const statusLabel = selectors.isConnected
    ? "ARMED"
    : selectors.isFlashing
      ? "PROCESSING"
      : "DISARMED";

  const statusColor =
    selectors.isConnected
      ? "text-green-500"
      : selectors.isFlashing
        ? "text-amber-500"
        : "text-muted-foreground/50";

  const statusGlow =
    selectors.isConnected
      ? "glow-green"
      : selectors.isFlashing
        ? "glow-amber"
        : "";

  return (
    <div className={`relative overflow-hidden sharp-card charcoal-card card-hover status-bar-top ${statusGlow} p-6`}>
      {/* Top status bar accent line */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Shield icon — 48px box, scaled with larger header text */}
          <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-[oklch(0.16_0.005_260)] border border-border">
            {selectors.isConnected ? (
              <Shield className="h-6 w-6 text-green-500" />
            ) : (
              <ShieldOff className="h-6 w-6 text-muted-foreground/40" />
            )}
          </div>

          <div>
            <h1 className="text-xl font-bold tracking-widest uppercase text-primary-content font-heading">
              ESP Flasher
            </h1>
            <FirmwareMetaLabel />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status readout — monospace keypad style */}
          <div className="flex items-center gap-2.5 rounded-sm border border-border/60 bg-[oklch(0.095_0.005_260)] px-3 py-2">
            <span className={`relative flex h-2.5 w-2.5 ${statusColor}`}>
              {selectors.isConnected && (
                <span className="absolute inset-0 animate-pulse-red rounded-sm bg-green-500" />
              )}
              {selectors.isFlashing && (
                <span className="absolute inset-0 animate-pulse-amber rounded-sm bg-amber-500" />
              )}
              <span className={`relative block h-2.5 w-2.5 rounded-sm ${statusColor.replace("text-", "bg-")}`} />
            </span>
            <span className={`text-sm font-mono font-semibold tracking-[0.15em] uppercase ${statusColor}`}>
              {statusLabel}
            </span>
          </div>

          {/* Theme toggle — 34px compact icon button, no permanent border, subtle ring only on focus */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8.5 w-8.5 rounded-sm bg-transparent text-muted-foreground/70 hover:text-foreground hover:bg-[oklch(0.16_0.005_260)] focus-visible:ring-1 focus-visible:ring-offset-0"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <span className="icon-hover">
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
            </span>
          </Button>
        </div>
      </div>

      {/* Bottom subtitle — monospace */}
      <p className="text-sm font-mono text-secondary-content tracking-wider">
        HOME SECURITY MODULE &mdash; FIRMWARE FLASHER
      </p>
    </div>
  );
}

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
    <div className="mt-1.5 flex items-center gap-2">
      <Badge
        variant="secondary"
        className="rounded-sm font-mono text-sm tracking-wider text-secondary-content"
      >
        FW {meta.version}
      </Badge>
      <span className="text-sm font-mono text-meta">
        {meta.release}
      </span>
    </div>
  );
}
