"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Download, Cpu, CheckCircle2, AlertCircle, Loader2, Zap, ArrowLeft } from "lucide-react"

type FlashStatus = "idle" | "downloading" | "success" | "selecting-port" | "flashing" | "flash-complete" | "error"

interface FlashResult {
  output: string
  error: string
  returncode: number | string
}

const BASE_URL = "http://127.0.0.1:8000"

export function EspFlasher() {
  const [device, setDevice] = useState<string>("")
  const [status, setStatus] = useState<FlashStatus>("idle")
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState("")
  const [healthOk, setHealthOk] = useState(false)
  const [ports, setPorts] = useState<string[]>([])
  const [selectedPort, setSelectedPort] = useState<string>("")
  const [transitioning, setTransitioning] = useState(false)
  const [flashResult, setFlashResult] = useState<FlashResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const allGoodReceivedRef = useRef(false)
  const healthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Health check polling every 5 seconds
  useEffect(() => {
    let cancelled = false

    async function checkHealth() {
      try {
        const resp = await fetch(`${BASE_URL}/health`)
        const data = await resp.json()
        if (!cancelled) {
          if (data.health === "ok") {
            setHealthOk(true)
          } else {
            setHealthOk(false)
          }
        }
      } catch {
        if (!cancelled) {
          setHealthOk(false)
        }
      }
    }

    checkHealth()
    healthIntervalRef.current = setInterval(checkHealth, 5000)

    return () => {
      cancelled = true
      if (healthIntervalRef.current) {
        clearInterval(healthIntervalRef.current)
        healthIntervalRef.current = null
      }
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  // When device changes after a successful download or port selection, revert to idle
  const handleDeviceChange = useCallback((value: string) => {
    setDevice(value)
    if (status === "success" || status === "selecting-port" || status === "flashing" || status === "flash-complete") {
      setStatus("idle")
      setProgress(0)
      setPorts([])
      setSelectedPort("")
      setFlashResult(null)
      allGoodReceivedRef.current = false
    }
  }, [status])

  const handleDownload = useCallback(async () => {
    if (!device) return

    setStatus("downloading")
    setProgress(0)
    setErrorMessage("")
    allGoodReceivedRef.current = false

    const deviceValue = device === "wroom" ? "wroom" : "s3"
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch(`${BASE_URL}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: deviceValue, action: "download", options: "none" }),
        signal: controller.signal,
      })

      if (!response.body) {
        throw new Error("No response body")
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Backend streams with \r as delimiter: yield f"\r{percent:.2f}"
        // Split on \r, \n, or both to handle all cases
        const chunks = buffer.split(/[\r\n]+/)
        buffer = chunks.pop() || "" // Keep incomplete last chunk in buffer

        for (const chunk of chunks) {
          const trimmed = chunk.trim()
          if (!trimmed) continue

          // Check for the allgood JSON response
          if (trimmed.startsWith("{")) {
            try {
              const json = JSON.parse(trimmed)
              if (json.status === "allgood") {
                allGoodReceivedRef.current = true
                setProgress(100)
                setStatus("success")
                return
              }
            } catch {
              // Not valid JSON, continue
            }
          }

          // Try parsing as a progress number (e.g. "42.57")
          const num = parseFloat(trimmed)
          if (!isNaN(num) && !allGoodReceivedRef.current) {
            setProgress(Math.min(num, 100))
          }
        }
      }

      // Process any remaining buffer after stream ends
      const remaining = buffer.trim()
      if (remaining) {
        if (remaining.startsWith("{")) {
          try {
            const json = JSON.parse(remaining)
            if (json.status === "allgood") {
              allGoodReceivedRef.current = true
              setProgress(100)
              setStatus("success")
              return
            }
          } catch {
            // ignore
          }
        }
        const num = parseFloat(remaining)
        if (!isNaN(num) && !allGoodReceivedRef.current) {
          setProgress(Math.min(num, 100))
        }
      }

      // If stream ended without allgood, stay at current progress
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return
      setErrorMessage("Download failed. Retrying...")
      setStatus("error")
    }
  }, [device])

  const handleGoBack = useCallback(() => {
    setTransitioning(true)
    setTimeout(() => {
      setStatus("idle")
      setProgress(0)
      setPorts([])
      setSelectedPort("")
      setFlashResult(null)
      allGoodReceivedRef.current = false
      setTransitioning(false)
    }, 300)
  }, [])

  const handleFlashNow = useCallback(async () => {
    if (!device) return

    const deviceValue = device === "wroom" ? "wroom" : "s3"

    try {
      const response = await fetch(`${BASE_URL}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: deviceValue, action: "status", options: "none" }),
      })

      const data = await response.json()

      if (data.result && Array.isArray(data.result)) {
        setPorts(data.result)
        setSelectedPort("")
        setStatus("selecting-port")
      }
    } catch {
      setErrorMessage("Failed to get device ports")
      setStatus("error")
    }
  }, [device])

  const handleProceed = useCallback(async () => {
    if (!selectedPort) return

    setStatus("flashing")
    setFlashResult(null)

    try {
      const response = await fetch(`${BASE_URL}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: device === "wroom" ? "wroom" : "s3", action: "flash", options: selectedPort }),
      })

      const data = await response.json()
      setFlashResult({
        output: data.output ?? "",
        error: data.error ?? "",
        returncode: data.returncode ?? "",
      })
      setStatus("flash-complete")
    } catch {
      setErrorMessage("Failed to flash device")
      setStatus("error")
    }
  }, [selectedPort, device])

  const isDownloading = status === "downloading"
  const canDownload = !!device && healthOk && !isDownloading

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 border border-primary/20">
            <Cpu className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground font-mono tracking-tight">
              ESP Flasher
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              Firmware Download Tool
            </p>
          </div>
        </div>

        {/* Main Card */}
        <div
          className={`rounded-lg border border-border bg-card p-6 space-y-6 transition-opacity duration-300 ${
            transitioning ? "opacity-0" : "opacity-100"
          }`}
        >
          {/* Device Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground font-mono">
              Target Device
            </label>
            <Select
              value={device}
              onValueChange={handleDeviceChange}
              disabled={isDownloading || status === "flashing"}
            >
              <SelectTrigger className="w-full h-11 bg-secondary border-border text-foreground font-mono text-sm">
                <SelectValue placeholder="Select a module..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wroom">
                  <span className="font-mono">ESP 32 Wroom Module</span>
                </SelectItem>
                <SelectItem value="s3">
                  <span className="font-mono">ESP 32 S3 Module</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Action Buttons / Views */}
          {status === "selecting-port" ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <label className="text-sm font-medium text-muted-foreground font-mono">
                Select Port
              </label>
              <div className="space-y-2">
                {ports.map((port) => (
                  <button
                    key={port}
                    onClick={() => setSelectedPort(port)}
                    className={`w-full text-left px-4 py-3 rounded-md border font-mono text-sm transition-all ${
                      selectedPort === port
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary text-foreground hover:border-muted-foreground/40"
                    }`}
                  >
                    {port}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={handleGoBack}
                  variant="secondary"
                  className="flex-1 h-11 font-mono text-sm font-medium"
                  size="lg"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Go Back
                </Button>
                <Button
                  onClick={handleProceed}
                  disabled={!selectedPort}
                  className="flex-1 h-11 font-mono text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                  size="lg"
                >
                  <Zap className="w-4 h-4" />
                  Proceed
                </Button>
              </div>
            </div>
          ) : status === "flashing" ? (
            <div className="flex items-center gap-3 p-4 rounded-md bg-primary/10 border border-primary/20 animate-in fade-in duration-300">
              <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
              <div>
                <p className="text-sm font-mono text-primary font-medium">
                  Flashing device...
                </p>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">
                  {selectedPort}
                </p>
              </div>
            </div>
          ) : status === "flash-complete" && flashResult ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                <span className="text-sm font-mono text-primary font-medium">
                  Flash Complete
                </span>
              </div>

              {/* Return Code */}
              <div className="space-y-1">
                <span className="text-xs font-mono text-muted-foreground">Return Code</span>
                <div className={`px-3 py-2 rounded-md border font-mono text-sm ${
                  String(flashResult.returncode) === "0"
                    ? "border-primary/30 bg-primary/5 text-primary"
                    : "border-destructive/30 bg-destructive/5 text-destructive"
                }`}>
                  {String(flashResult.returncode)}
                </div>
              </div>

              {/* Output */}
              {flashResult.output && (
                <div className="space-y-1">
                  <span className="text-xs font-mono text-muted-foreground">Output</span>
                  <pre className="px-3 py-2 rounded-md border border-border bg-secondary text-foreground font-mono text-xs leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                    {flashResult.output}
                  </pre>
                </div>
              )}

              {/* Error */}
              {flashResult.error && (
                <div className="space-y-1">
                  <span className="text-xs font-mono text-destructive">Error</span>
                  <pre className="px-3 py-2 rounded-md border border-destructive/30 bg-destructive/5 text-destructive font-mono text-xs leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                    {flashResult.error}
                  </pre>
                </div>
              )}

              <Button
                onClick={handleGoBack}
                variant="secondary"
                className="w-full h-11 font-mono text-sm font-medium"
                size="lg"
              >
                <ArrowLeft className="w-4 h-4" />
                Go Back
              </Button>
            </div>
          ) : status === "success" ? (
            <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <Button
                onClick={handleGoBack}
                variant="secondary"
                className="flex-1 h-11 font-mono text-sm font-medium"
                size="lg"
              >
                <ArrowLeft className="w-4 h-4" />
                Go Back
              </Button>
              <Button
                onClick={handleFlashNow}
                className="flex-1 h-11 font-mono text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
                size="lg"
              >
                <Zap className="w-4 h-4" />
                Flash Now
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleDownload}
              disabled={!canDownload}
              className={`w-full h-11 font-mono text-sm font-medium transition-all ${
                status === "error"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }`}
              size="lg"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Downloading...
                </>
              ) : status === "error" ? (
                <>
                  <AlertCircle className="w-4 h-4" />
                  Retry
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download Firmware
                </>
              )}
            </Button>
          )}

          {/* Progress Section */}
          {(isDownloading || status === "success") && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground">
                  {status === "success"
                    ? "Download Successful"
                    : "Downloading firmware..."}
                </span>
                <span className="text-xs font-mono text-foreground tabular-nums">
                  {progress.toFixed(2)}%
                </span>
              </div>

              <Progress
                value={progress}
                className="h-2 [&>div]:bg-primary"
              />

              {status === "success" && (
                <div className="flex items-center gap-2 mt-2 p-3 rounded-md bg-primary/10 border border-primary/20 animate-in fade-in duration-500">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-sm font-mono text-primary font-medium">
                    Download Successful
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Error message */}
          {status === "error" && errorMessage && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 animate-in fade-in duration-300">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              <span className="text-sm font-mono text-destructive">
                {errorMessage}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground font-mono">
            {device
              ? `Target: ${device === "wroom" ? "ESP32 Wroom" : "ESP32 S3"}`
              : "No device selected"}
          </p>
          <div className="flex items-center gap-1.5">
            {healthOk ? (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-[11px] text-primary font-mono font-medium">
                  Ready
                </span>
              </>
            ) : (
              <>
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
                <span className="text-[11px] text-muted-foreground font-mono">
                  Connecting...
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
