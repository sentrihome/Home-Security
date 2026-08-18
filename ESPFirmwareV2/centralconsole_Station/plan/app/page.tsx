"use client"

import { useState } from "react"
import { Shield, Settings, Activity, ChevronRight, ChevronLeft } from "lucide-react"

export default function TFTDisplay() {
  const [motionArmed, setMotionArmed] = useState(false)
  const [view, setView] = useState<"main" | "settings" | "setup">("main")

  return (
    <div className="flex items-center justify-center min-h-screen bg-neutral-900 p-4">
      {/* TFT Display Container - 480x320 */}
      <div
        className="relative bg-neutral-950 rounded-lg overflow-hidden border border-neutral-800"
        style={{ width: 480, height: 320 }}
      >
        {/* Status Bar */}
        <div className="absolute top-0 left-0 right-0 h-8 flex items-center justify-between px-4 bg-neutral-900 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${motionArmed ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-600'}`} />
            <span className="text-xs text-neutral-400">
              {motionArmed ? 'System Armed' : 'System Disarmed'}
            </span>
          </div>
          <span className="text-xs text-neutral-500 font-mono">12:34</span>
        </div>

        {/* Main Content */}
        <div className="absolute top-8 left-0 right-0 bottom-9 p-4">
          {view === "main" ? (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-500/10 rounded-xl">
                  <Shield className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white tracking-tight">Home Security</h1>
                  <p className="text-xs text-neutral-500">Control Panel</p>
                </div>
              </div>

              {/* Menu Items */}
              <div className="space-y-2.5">
                {/* Arm Motion Toggle */}
                <div className="flex items-center justify-between p-3 bg-neutral-900/80 rounded-xl border border-neutral-800">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${motionArmed ? 'bg-emerald-500/20' : 'bg-neutral-800'}`}>
                      <Activity className={`w-5 h-5 ${motionArmed ? 'text-emerald-400' : 'text-neutral-500'}`} />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-white">Arm Motion</span>
                      <p className="text-xs text-neutral-500">Motion detection sensor</p>
                    </div>
                  </div>

                  {/* Custom Switch */}
                  <button
                    onClick={() => setMotionArmed(!motionArmed)}
                    className={`relative w-12 h-7 rounded-full transition-all duration-300 ${
                      motionArmed
                        ? 'bg-emerald-500'
                        : 'bg-neutral-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${
                        motionArmed ? 'left-6' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Settings Button */}
                <button
                  onClick={() => setView("settings")}
                  className="w-full flex items-center justify-between p-3 bg-neutral-900/80 rounded-xl border border-neutral-800 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-neutral-800 rounded-lg">
                      <Settings className="w-5 h-5 text-neutral-400" />
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-medium text-white">Settings</span>
                      <p className="text-xs text-neutral-500">System configuration</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-neutral-600" />
                </button>
              </div>
            </>
          ) : view === "settings" ? (
            <>
              {/* Settings Page */}
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setView("main")}
                  className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800"
                >
                  <ChevronLeft className="w-4 h-4 text-neutral-400" />
                </button>
                <h1 className="text-lg font-bold text-white tracking-tight">Settings</h1>
              </div>

              <div className="space-y-2.5">
                {/* Setup Option */}
                <button
                  onClick={() => setView("setup")}
                  className="w-full flex items-center justify-between p-3 bg-neutral-900/80 rounded-xl border border-neutral-800 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-neutral-800 rounded-lg">
                      <Shield className="w-5 h-5 text-neutral-400" />
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-medium text-white">Setup</span>
                      <p className="text-xs text-neutral-500">Configure network credentials</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-neutral-600 group-hover:text-neutral-400 transition-colors" />
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Setup Page */}
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setView("settings")}
                  className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800"
                >
                  <ChevronLeft className="w-4 h-4 text-neutral-400" />
                </button>
                <h1 className="text-lg font-bold text-white tracking-tight">Setup</h1>
              </div>

              <div className="p-3 bg-neutral-900/80 rounded-xl border border-neutral-800">
                <p className="text-xs text-neutral-400">Connect to this network and continue in the app</p>
                <p className="text-sm text-white mt-2">SSID: xxxxxxxxxx</p>
                <p className="text-sm text-white">PASSWORD: xxxxxxxxxxx</p>
              </div>
            </>
          )}
        </div>

        {/* Bottom Status Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-9 flex items-center justify-center gap-6 px-4 bg-neutral-900/50 border-t border-neutral-800/50">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-neutral-500">WiFi</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-neutral-500">Sensors</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span className="text-xs text-neutral-500">Battery</span>
          </div>
        </div>
      </div>
    </div>
  )
}
