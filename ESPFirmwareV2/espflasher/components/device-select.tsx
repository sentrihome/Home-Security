/**
 * Device selection card — Web Serial port picker + authorized ports list.
 * Security panel aesthetic: sharp corners, charcoal card, lock/sensor icons.
 */

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Usb, RefreshCw, Lock, LockOpen, XCircle, Loader2 } from "lucide-react";
import { useFlasher } from "@/hooks/use-flasher-state";
import { useSerialDevice } from "@/hooks/use-serial-device";

export function DeviceSelectCard() {
  const { selectors, state } = useFlasher();
  const { isSupported, devicePhase, portInfo, serialPort, deviceError, requestPort, refreshPorts, disconnectPort } =
    useSerialDevice();

  const [authorizedPorts, setAuthorizedPorts] = useState<Array<{ usbVendorId?: number; usbProductId?: number }>>([]);

  const handleRefresh = async () => {
    const ports = await refreshPorts();
    setAuthorizedPorts(ports);
  };

  const isConnected = devicePhase === "connected";

  if (!isSupported) return null;

  const cardGlow = isConnected ? "glow-green" : "";

  return (
    <Card className={`sharp-card charcoal-card card-hover ${cardGlow}`}>
      <CardHeader className="pb-4">
        <CardTitle className="text-[15px] font-semibold tracking-[0.15em] uppercase text-primary-content flex items-center gap-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-[oklch(0.16_0.005_260)] border border-border">
            <Usb className="h-4 w-4 text-secondary-content" />
          </div>
          Device Selection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 px-7 py-7">
        {/* Connected device info */}
        {isConnected && (
          <div className="flex items-center gap-3 rounded-sm border border-green-500/20 bg-green-500/5 px-4 py-3.5">
            <div className="relative flex h-3 w-3 flex-shrink-0">
              <span className="absolute inset-0 animate-pulse-red rounded-sm bg-green-500" />
              <span className="relative block h-3 w-3 rounded-sm bg-green-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono font-semibold text-green-500 tracking-[0.15em] uppercase">
                DEVICE ARMED
              </p>
              {portInfo && (
                <p className="text-sm font-mono text-meta mt-1.5">
                  VID:0x{portInfo.usbVendorId?.toString(16).padStart(4, "0")} &nbsp;PID:0x{portInfo.usbProductId?.toString(16).padStart(4, "0")}
                </p>
              )}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={disconnectPort} className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 rounded-sm">
              <span className="icon-hover">
                <XCircle className="h-4 w-4" />
              </span>
            </Button>
          </div>
        )}

        {/* Disconnected */}
        {!isConnected && devicePhase !== "selecting-port" && (
          <div className="space-y-5">
            <p className="text-sm text-secondary-content leading-relaxed">
              Connect your ESP32/ESP8266 via USB, then select it below.
            </p>
            <Button size="sm" onClick={requestPort} className="gap-2 font-mono text-sm uppercase tracking-[0.15em] steel-btn rounded-sm py-2.5 px-5">
              <Lock className="h-4 w-4" />
              Select Device
            </Button>

            {/* Authorized ports */}
            {authorizedPorts.length > 0 && (
              <>
                <Separator className="bg-border/40" />
                <div>
                  <p className="mb-3 text-xs font-mono text-meta tracking-[0.15em] uppercase">
                    Authorized Devices
                  </p>
                  {authorizedPorts.map((info, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-sm border border-border/40 bg-[oklch(0.095_0.005_260)] px-4 py-3 hover:bg-[oklch(0.14_0.005_260)]">
                      <span className="font-mono text-sm text-secondary-content">
                        0x{info.usbVendorId?.toString(16).padStart(4, "0")} : 0x{info.usbProductId?.toString(16).padStart(4, "0")}
                      </span>
                      <Badge variant="secondary" className="font-mono text-sm tracking-wider rounded-sm">
                        <LockOpen className="h-3.5 w-3.5 mr-1" />
                        READY
                      </Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Selecting port */}
        {devicePhase === "selecting-port" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="tracking-[0.15em] uppercase font-semibold">Waiting for device selection...</span>
          </div>
        )}

        {/* Error */}
        {deviceError && (
          <Alert variant="destructive" className="sharp-card rounded-sm px-4 py-3.5">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <AlertTitle className="font-mono text-sm uppercase tracking-[0.15em] font-semibold">DEVICE ERROR</AlertTitle>
                <AlertDescription className="text-sm leading-relaxed mt-1.5">{deviceError}</AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        {/* Refresh */}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="gap-1.5 text-xs font-mono text-meta hover:text-foreground rounded-sm tracking-[0.15em] uppercase py-2 px-4">
            <span className="icon-hover">
              <RefreshCw className="h-3.5 w-3.5" />
            </span>
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
