package com.example.esp32pairingapp.network

import android.content.Context

/**
 * SharedPreferences-backed config for the Raspberry Pi backend address.
 * User can enter IP/host (e.g. 192.168.1.73). Port 4000 is used automatically.
 */
object PiBackendPrefs {
    private const val PREFS_NAME = "pi_backend_prefs"
    private const val KEY_PI_HOST_INPUT = "pi_host_input"

    fun getRawHostInput(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_PI_HOST_INPUT, null)
    }

    fun setRawHostInput(context: Context, raw: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_PI_HOST_INPUT, raw.trim()).apply()
    }

    /** Returns a normalized base URL like http://192.168.1.73:4000 */
    fun computePiBaseUrl(rawInput: String): String {
        val trimmed = rawInput.trim()
        require(trimmed.isNotEmpty()) { "Pi backend host/IP is empty" }

        val withScheme = if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            trimmed
        } else {
            "http://$trimmed"
        }

        val noTrailingSlash = withScheme.removeSuffix("/")
        val schemeSplit = noTrailingSlash.split("://", limit = 2)
        val scheme = schemeSplit[0]
        val hostAndMaybePort = schemeSplit.getOrNull(1) ?: ""
        val hostPort = hostAndMaybePort.split("/", limit = 2)[0]
        val hostOnly = hostPort.substringBefore(":")
        require(hostOnly.isNotBlank()) { "Invalid host/IP" }

        return "$scheme://$hostOnly:4000"
    }
}
