/**
 * Device selection card — Web Serial port picker + authorized ports list.
 */

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Usb, RefreshCw, Plug, PlugZap, XCircle, Loader2 } from "lucide-react";
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

  if (!isSupported) return null; // UnsupportedBrowserAlert shown elsewhere

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Usb className="h-4 w-4 text-muted-foreground" />
          Device Selection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connected device info */}
        {isConnected && (
          <>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-600 dark:text-green-400">Connected</p>
                {portInfo && (
                  <p className="text-xs font-mono text-muted-foreground truncate">
                    Vendor: 0x{portInfo.usbVendorId?.toString(16).padStart(4, "0")}{" "}
                    Product: 0x{portInfo.usbProductId?.toString(16).padStart(4, "0")}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={disconnectPort} className="h-7 w-7 p-0">
                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          </>
        )}

        {/* Disconnected — show port picker */}
        {!isConnected && devicePhase !== "selecting-port" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your ESP32/ESP8266 via USB, then select it below.
            </p>

            <Button size="sm" onClick={requestPort} className="gap-1">
              <Plug className="h-3.5 w-3.5" />
              Select Device
            </Button>

            {/* Show already-authorized ports */}
            {authorizedPorts.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Authorized devices:</p>
                  {authorizedPorts.map((info, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                      <span className="text-xs font-mono text-muted-foreground">
                        0x{info.usbVendorId?.toString(16).padStart(4, "0")} : 0x{info.usbProductId?.toString(16).padStart(4, "0")}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        Plug + Connect
                      </Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Selecting port — show spinner */}
        {devicePhase === "selecting-port" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for device selection...
          </div>
        )}

        {/* Error */}
        {deviceError && (
          <Alert variant="destructive" className="text-sm">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Device error</AlertTitle>
            <AlertDescription>{deviceError}</AlertDescription>
          </Alert>
        )}

        {/* Refresh button */}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="gap-1 text-xs">
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
