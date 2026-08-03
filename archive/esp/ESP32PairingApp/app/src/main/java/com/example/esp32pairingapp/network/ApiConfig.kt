package com.example.esp32pairingapp.network

object ApiConfig {
    /** Device ID for cloud HLS stream/events. Must match Pi config (config.json DEVICE_ID, default "pi-1"). */
    const val DEFAULT_DEVICE_ID = "pi-1"

    // Default base URLs come from BuildConfig (set via local.properties or env vars; see app/build.gradle.kts).
    // On a real device you can still override at runtime via setCloudBaseUrlOverride() / setPiBaseUrlOverride().
    private val CLOUD_BASE_URL_DEFAULT = com.example.esp32pairingapp.BuildConfig.CLOUD_BASE_URL_DEFAULT
    private val PI_BASE_URL_DEFAULT = com.example.esp32pairingapp.BuildConfig.PI_BASE_URL_DEFAULT

    // Runtime overrides (e.g., user-entered IP/host)
    @Volatile
    private var cloudBaseUrlOverride: String? = null

    @Volatile
    private var piBaseUrlOverride: String? = null

    fun setCloudBaseUrlOverride(baseUrl: String?) {
        cloudBaseUrlOverride = baseUrl?.trim()?.removeSuffix("/")
    }

    fun setPiBaseUrlOverride(baseUrl: String?) {
        piBaseUrlOverride = baseUrl?.trim()?.removeSuffix("/")
    }

    private fun cloudBaseUrl(): String = cloudBaseUrlOverride ?: CLOUD_BASE_URL_DEFAULT
    private fun piBaseUrl(): String = piBaseUrlOverride ?: PI_BASE_URL_DEFAULT

    // Cloud Backend Endpoints (port 3001)
    object CloudEndpoints {
        const val HEALTH = "/api/health"
        const val STATUS = "/status"
        const val AUTH_ME = "/api/auth/me"
        const val AUTH_LOGOUT = "/api/auth/logout"
        const val EVENTS = "/api/events"
        const val CLIPS = "/api/clips"
        const val EVENTS_UPLOAD = "/api/events/upload"
        const val STREAM_PLAYLIST = "/api/stream/playlist"
        const val STREAM_STATUS = "/api/stream/status"
        const val CLEAR_ALL = "/api/clear-all"
        const val NEW_SSID = "/api/newssid"
        const val NEW_PASS = "/api/newpass"
        const val WIFI_STATUS = "/api/wifistatus"
        const val MOTION_LATEST = "/api/motion/latest"
        const val MOTION_STREAM = "/api/motion/stream"
        const val MOTION_ACKNOWLEDGE = "/api/motion"  // + "/{id}/acknowledge"
        const val MOTION_TEST = "/api/motion/test"
    }

    // Pi Backend Endpoints (port 4000)
    object PiEndpoints {
        const val HEALTH = "/health"
        const val START = "/start"
        const val STOP = "/stop"
        const val MOTION = "/motion"
        const val STREAM = "/stream"
        const val CLEAR_ALL = "/clear-all"
        const val STATUS = "/status"
    }

    // Cloud Backend URLs (port 3001)
    fun getHealthUrl() = "${cloudBaseUrl()}${CloudEndpoints.HEALTH}"
    fun getStatusUrl() = "${cloudBaseUrl()}${CloudEndpoints.STATUS}"

    /** GET /api/events */
    fun getEventsUrl() = "${cloudBaseUrl()}${CloudEndpoints.EVENTS}"

    /** GET /api/clips/:eventId */
    fun getClipStreamUrl(eventId: String) = "${cloudBaseUrl()}${CloudEndpoints.CLIPS}/$eventId"

    /** GET /api/clips/:eventId/thumbnail */
    fun getClipThumbnailUrl(eventId: String) = "${cloudBaseUrl()}${CloudEndpoints.CLIPS}/$eventId/thumbnail"

    // Backwards-compatible alias (older UI name)
    fun getClipsUrl() = getEventsUrl()
    fun getNewSsidUrl() = "${cloudBaseUrl()}${CloudEndpoints.NEW_SSID}"
    fun getNewPassUrl() = "${cloudBaseUrl()}${CloudEndpoints.NEW_PASS}"
    fun getWifiStatusUrl() = "${cloudBaseUrl()}${CloudEndpoints.WIFI_STATUS}"
    /** GET /api/stream/playlist/:deviceId — live HLS m3u8 */
    fun getStreamPlaylistUrl(deviceId: String) =
        "${cloudBaseUrl()}${CloudEndpoints.STREAM_PLAYLIST}/$deviceId"

    /** GET /api/stream/status/:deviceId — stream liveness check */
    fun getStreamStatusUrl(deviceId: String) =
        "${cloudBaseUrl()}${CloudEndpoints.STREAM_STATUS}/$deviceId"

    fun getClearAllUrl() = "${cloudBaseUrl()}${CloudEndpoints.CLEAR_ALL}"
    fun getAuthMeUrl() = "${cloudBaseUrl()}${CloudEndpoints.AUTH_ME}"
    fun getAuthLogoutUrl() = "${cloudBaseUrl()}${CloudEndpoints.AUTH_LOGOUT}"

    // Pi Backend URLs (port 4000)
    fun getPiHealthUrl() = "${piBaseUrl()}${PiEndpoints.HEALTH}"
    fun getStartStreamUrl() = "${piBaseUrl()}${PiEndpoints.START}"
    fun getStopStreamUrl() = "${piBaseUrl()}${PiEndpoints.STOP}"
    fun getMotionTriggerUrl() = "${piBaseUrl()}${PiEndpoints.MOTION}"
    fun getStreamUrl() = "${piBaseUrl()}${PiEndpoints.STREAM}"
    fun getPiClearAllUrl() = "${piBaseUrl()}${PiEndpoints.CLEAR_ALL}"
    fun getPiStatusUrl() = "${piBaseUrl()}${PiEndpoints.STATUS}"

    // For custom endpoints
    fun buildCloudUrl(endpoint: String) = "${cloudBaseUrl()}$endpoint"
    fun buildPiUrl(endpoint: String) = "${piBaseUrl()}$endpoint"

    /** GET /api/motion/latest — poll for newest unacknowledged motion alert (fallback) */
    fun getLatestMotionAlertUrl() = "${cloudBaseUrl()}${CloudEndpoints.MOTION_LATEST}"

    /** GET /api/motion/stream — SSE stream for instant push alerts */
    fun getMotionStreamUrl() = "${cloudBaseUrl()}${CloudEndpoints.MOTION_STREAM}"

    /** POST /api/motion/{alertId}/acknowledge */
    fun getAcknowledgeMotionUrl(alertId: String) =
        "${cloudBaseUrl()}${CloudEndpoints.MOTION_ACKNOWLEDGE}/$alertId/acknowledge"

    /** POST /api/motion/test — creates a real alert attributed to the logged-in user */
    fun getMotionTestUrl() = "${cloudBaseUrl()}${CloudEndpoints.MOTION_TEST}"

    // Get base URLs (useful for debugging)
    fun getCloudBaseUrl() = cloudBaseUrl()
    fun getPiBaseUrl() = piBaseUrl()
}