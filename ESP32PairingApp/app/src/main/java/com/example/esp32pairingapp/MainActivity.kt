package com.example.esp32pairingapp

import android.Manifest
import android.net.Network
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.example.esp32pairingapp.alerts.IntruderAlertOverlay
import com.example.esp32pairingapp.alerts.MotionAlertInfo
import com.example.esp32pairingapp.alerts.createMotionNotificationChannel
import com.example.esp32pairingapp.alerts.showMotionNotification
import com.example.esp32pairingapp.auth.LoginScreen
import com.example.esp32pairingapp.network.CloudBackendPrefs
import com.example.esp32pairingapp.network.EspHttpClient
import com.example.esp32pairingapp.clips.HlsPlayerView
import com.example.esp32pairingapp.clips.SavedClipsContent
import com.example.esp32pairingapp.pairing.OtpGenerator
import com.example.esp32pairingapp.network.PiBackendPrefs
import com.example.esp32pairingapp.ui.theme.ESP32PairingAppTheme
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import android.content.Intent
import android.net.Uri
import androidx.annotation.RequiresApi
import android.widget.Toast
import androidx.compose.material3.OutlinedTextField
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop

private const val BASE_URL = "http://192.168.10.1"
private const val HEALTH_URL = "$BASE_URL/api/health"
private const val NEWSSID_URL = "$BASE_URL/api/newssid"
private const val NEWPASS_URL = "$BASE_URL/api/newpass"
private const val ENCRYPTEDPASS_URL = "$BASE_URL/api/encryptedpass"

private const val ONETIMEPASS_URL = "$BASE_URL/api/onetimepass"
private const val PERMANENTPASS_URL = "$BASE_URL/api/permanentpass"
private const val WIFISTATUS_URL = "$BASE_URL/api/wifistatus"
private const val POLL_INTERVAL_MS = 750L
private const val POLL_TIMEOUT_MS = 60_000L
private const val ARM_URL       = "$BASE_URL/api/arm"
private const val SCHEDULE_URL  = "$BASE_URL/api/schedule"
private const val ARMSTATUS_URL = "$BASE_URL/api/armstatus"

class MainActivity : ComponentActivity() {

    private var hasLocationPermission by mutableStateOf(false)
    private var isLoggedIn by mutableStateOf(false)

    // Request permissions (keep this; some devices require it for Wi-Fi related behavior)
    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
            val locationGranted = results[Manifest.permission.ACCESS_FINE_LOCATION] == true
            val nearbyGranted = results[Manifest.permission.NEARBY_WIFI_DEVICES] == true

            hasLocationPermission =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) nearbyGranted else locationGranted
        }

    private val httpClient by lazy { EspHttpClient() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        handleAuthDeepLink(intent)

        hasLocationPermission = isLocationPermissionGranted()
        isLoggedIn = CloudBackendPrefs.isLoggedIn(this)

        createMotionNotificationChannel(this)

        setContent {
            ESP32PairingAppTheme {
                when {
                    !hasLocationPermission -> PermissionScreen(
                        hasPermission = hasLocationPermission,
                        onRequestPermission = { requestRequiredPermissions() }
                    )
                    !isLoggedIn -> LoginScreen()
                    else -> StreamPage(
                        network = null,
                        httpClient = httpClient,
                        onLogout = { isLoggedIn = false }
                    )
                }
            }
        }
    }

    private fun isLocationPermissionGranted(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(this, Manifest.permission.NEARBY_WIFI_DEVICES) ==
                    PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
                    PackageManager.PERMISSION_GRANTED
        }
    }

    private fun requestRequiredPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissionLauncher.launch(arrayOf(Manifest.permission.NEARBY_WIFI_DEVICES))
        } else {
            permissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION))
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleAuthDeepLink(intent)
    }

    private fun handleAuthDeepLink(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme != "home-security") return
        when (uri.host) {
            "auth-success" -> {
                val email = uri.getQueryParameter("email")
                val token = uri.getQueryParameter("token")
                if (!token.isNullOrBlank()) {
                    CloudBackendPrefs.setAuthToken(this, token)
                    isLoggedIn = true
                    Log.d("MainActivity", "Cloud auth token saved")
                }
                if (!email.isNullOrBlank()) {
                    CloudBackendPrefs.setDriveAccountEmail(this, email)
                    Log.d("MainActivity", "Google Drive connected as: $email")
                    Toast.makeText(this, "Signed in as $email", Toast.LENGTH_LONG).show()
                } else if (!token.isNullOrBlank()) {
                    Toast.makeText(this, "Signed in successfully", Toast.LENGTH_LONG).show()
                }
            }
            "auth-error" -> {
                val msg = uri.getQueryParameter("msg") ?: "OAuth failed"
                Toast.makeText(this, "Drive auth failed: $msg", Toast.LENGTH_LONG).show()
            }
        }
        intent.setData(null)
    }
}

@Composable
fun StreamPage(
    network: Network?,
    httpClient: com.example.esp32pairingapp.network.EspHttpClient,
    onBack: () -> Unit = {},
    onLogout: () -> Unit = {}
) {
    val deviceId = com.example.esp32pairingapp.network.ApiConfig.DEFAULT_DEVICE_ID
    var isLoadingStream by remember { mutableStateOf(false) }
    var isStreaming by remember { mutableStateOf(false) }
    var userStopped by remember { mutableStateOf(false) }
    var streamUrl by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var hlsLive by remember { mutableStateOf<Boolean?>(null) }
    var driveAccountEmail by remember { mutableStateOf<String?>(null) }
    val errorLogs = remember { mutableStateListOf<String>() }

    // Drawer + dialogs state
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    var showOtpDialog by remember { mutableStateOf(false) }
    var pendingOtp by remember { mutableStateOf("") }
    var showScheduleDialog by remember { mutableStateOf(false) }
    var showErrorLogsDialog by remember { mutableStateOf(false) }
    // ESP32 setup
    var showEspSetupWizard by remember { mutableStateOf(false) }
    var showWifiDialog by remember { mutableStateOf(false) }
    var showPermanentPassDialog by remember { mutableStateOf(false) }
    var permanentPass by remember { mutableStateOf("") }
    var permanentPassError by remember { mutableStateOf<String?>(null) }

    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    // Motion alert state
    var activeMotionAlert  by remember { mutableStateOf<MotionAlertInfo?>(null) }
    var lastShownAlertId   by remember { mutableStateOf<String?>(null) }

    // Request POST_NOTIFICATIONS permission on Android 13+
    val notifPermLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* granted or denied — notification will show if granted */ }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    // Always poll cloud HLS status every 3s regardless of whether Start was pressed.
    LaunchedEffect(deviceId) {
        while (true) {
            try {
                val statusUrl = com.example.esp32pairingapp.network.ApiConfig.getStreamStatusUrl(deviceId)
                val response = withContext(Dispatchers.IO) { httpClient.get(statusUrl, null) }
                val json = JSONObject(response)
                val live = json.optBoolean("live", false)
                hlsLive = live
                if (live && !isStreaming && !userStopped) isStreaming = true
                if (!live && isStreaming) {
                    isStreaming = false
                    hlsLive = false
                }
            } catch (e: Exception) {
                Log.d("StreamPage", "HLS status poll failed: ${e.message}")
            }
            delay(3000)
        }
    }

    // Cloud and Pi backend config (persisted).
    var showCloudDialog by remember { mutableStateOf(false) }
    var showPiDialog by remember { mutableStateOf(false) }
    var cloudHostInput by remember {
        mutableStateOf(
            CloudBackendPrefs.getRawHostInput(context)
                ?: com.example.esp32pairingapp.network.ApiConfig.getCloudBaseUrl()
        )
    }
    var piHostInput by remember {
        mutableStateOf(PiBackendPrefs.getRawHostInput(context) ?: "")
    }

    // Apply saved URLs and check connectivity when screen is shown.
    LaunchedEffect(Unit) {
        val cloudSaved = CloudBackendPrefs.getRawHostInput(context)
        val piSaved = PiBackendPrefs.getRawHostInput(context)

        if (!cloudSaved.isNullOrBlank()) {
            runCatching {
                val baseUrl = CloudBackendPrefs.computeCloudBaseUrl(cloudSaved)
                com.example.esp32pairingapp.network.ApiConfig.setCloudBaseUrlOverride(baseUrl)
            }
        }
        if (!piSaved.isNullOrBlank()) {
            runCatching {
                val baseUrl = PiBackendPrefs.computePiBaseUrl(piSaved)
                com.example.esp32pairingapp.network.ApiConfig.setPiBaseUrlOverride(baseUrl)
            }
        }
        if (piSaved.isNullOrBlank()) showPiDialog = true
        else if (cloudSaved.isNullOrBlank()) showCloudDialog = true

        scope.launch {
            try {
                val piUrl = com.example.esp32pairingapp.network.ApiConfig.getPiHealthUrl()
                Log.d("StreamPage", "Checking Pi at: $piUrl")
                withContext(Dispatchers.IO) { httpClient.get(piUrl, null) }
            } catch (e: Exception) {
                errorLogs.add("Pi unreachable: ${e.message ?: "unknown error"}")
                Log.e("StreamPage", "Pi check failed", e)
            }
        }

        driveAccountEmail = CloudBackendPrefs.getDriveAccountEmail(context)
        val token = CloudBackendPrefs.getAuthToken(context)
        if (!token.isNullOrBlank()) {
            try {
                val response = withContext(Dispatchers.IO) {
                    httpClient.get(com.example.esp32pairingapp.network.ApiConfig.getAuthMeUrl(), null, token)
                }
                val json = org.json.JSONObject(response)
                val email = json.optString("email", "").takeIf { it.isNotBlank() }
                if (email != null) {
                    driveAccountEmail = email
                    CloudBackendPrefs.setDriveAccountEmail(context, email)
                }
            } catch (_: Exception) { }
        }
    }

    // SSE connection for instant motion alerts — reconnects automatically on drop.
    // Falls back to a 15 s poll if SSE fails repeatedly.
    LaunchedEffect(Unit) {
        var backoffMs = 2_000L
        while (true) {
            var connected = false
            try {
                withContext(Dispatchers.IO) {
                    val url = java.net.URL(
                        com.example.esp32pairingapp.network.ApiConfig.getMotionStreamUrl()
                    )
                    val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
                        setRequestProperty("Accept", "text/event-stream")
                        setRequestProperty("Cache-Control", "no-cache")
                        setRequestProperty("ngrok-skip-browser-warning", "true")
                        connectTimeout = 10_000
                        readTimeout    = 0          // infinite — SSE is a long-lived stream
                    }
                    conn.connect()
                    connected = true
                    backoffMs = 2_000L              // reset on successful connect

                    conn.inputStream.bufferedReader().use { reader ->
                        var line: String?
                        while (reader.readLine().also { line = it } != null) {
                            val l = line ?: continue
                            // SSE heartbeat comments start with ':' — ignore them
                            if (!l.startsWith("data:")) continue
                            val jsonStr = l.removePrefix("data:").trim()
                            if (jsonStr.isEmpty()) continue
                            val json = org.json.JSONObject(jsonStr)
                            val alertId = json.optString("id")
                            if (alertId.isNotBlank() && alertId != lastShownAlertId) {
                                val newAlert = MotionAlertInfo(
                                    id          = alertId,
                                    deviceId    = json.optString("deviceId", "unknown"),
                                    createdAtMs = json.optLong("createdAtMs", System.currentTimeMillis()),
                                )
                                withContext(Dispatchers.Main) {
                                    activeMotionAlert = newAlert
                                    lastShownAlertId  = alertId
                                    showMotionNotification(context, newAlert.deviceId)
                                }
                            }
                        }
                    }
                }
            } catch (_: Exception) { /* connection dropped — will reconnect below */ }

            // Exponential backoff; cap at 30 s
            delay(backoffMs)
            if (connected) backoffMs = 2_000L else backoffMs = (backoffMs * 2).coerceAtMost(30_000L)
        }
    }

    // Full-screen ESP setup wizard overlay
    if (showEspSetupWizard) {
        com.example.esp32pairingapp.setup.EspMainSetupScreen(
            httpClient = httpClient,
            onBack = { showEspSetupWizard = false }
        )
        return
    }

    Box(modifier = Modifier.fillMaxSize()) {
    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                Spacer(Modifier.height(24.dp))
                Text(
                    "Options",
                    style = MaterialTheme.typography.titleLarge,
                    modifier = androidx.compose.ui.Modifier.padding(horizontal = 16.dp)
                )
                Spacer(Modifier.height(16.dp))
                HorizontalDivider()
                Spacer(Modifier.height(8.dp))

                // Generate OTP
                NavigationDrawerItem(
                    label = { Text("Generate OTP") },
                    selected = false,
                    onClick = {
                        pendingOtp = com.example.esp32pairingapp.pairing.OtpGenerator.generate()
                        showOtpDialog = true
                        scope.launch { drawerState.close() }
                    }
                )

                // Change cloud backend URL
                NavigationDrawerItem(
                    label = { Text("Change cloud backend URL") },
                    selected = false,
                    onClick = {
                        showCloudDialog = true
                        scope.launch { drawerState.close() }
                    }
                )

                // Edit Pi IP
                NavigationDrawerItem(
                    label = { Text("Edit Pi IP") },
                    selected = false,
                    onClick = {
                        showPiDialog = true
                        scope.launch { drawerState.close() }
                    }
                )

                // Connect Google Drive
                NavigationDrawerItem(
                    label = { Text("Connect Google Drive") },
                    selected = false,
                    onClick = {
                        val authUrl = com.example.esp32pairingapp.network.ApiConfig.getCloudBaseUrl() + "/auth/google"
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(authUrl)))
                        scope.launch { drawerState.close() }
                    }
                )

                // Disconnect Google Drive
                NavigationDrawerItem(
                    label = { Text("Disconnect Google Drive") },
                    selected = false,
                    onClick = {
                        scope.launch {
                            drawerState.close()
                            try {
                                val token = CloudBackendPrefs.getAuthToken(context)
                                if (!token.isNullOrBlank()) {
                                    withContext(Dispatchers.IO) {
                                        httpClient.post(
                                            com.example.esp32pairingapp.network.ApiConfig.getAuthLogoutUrl(),
                                            "",
                                            "application/json",
                                            null,
                                            token
                                        )
                                    }
                                }
                                CloudBackendPrefs.setAuthToken(context, null)
                                CloudBackendPrefs.setDriveAccountEmail(context, null)
                                driveAccountEmail = null
                                Log.d("StreamPage", "Logged out from Drive")
                                errorMessage = "Logged out from Google Drive"
                            } catch (e: Exception) {
                                errorMessage = "Log out failed: ${e.message}"
                            }
                        }
                    }
                )

                // Set Schedule
                NavigationDrawerItem(
                    label = { Text("Set Schedule") },
                    selected = false,
                    onClick = {
                        showScheduleDialog = true
                        scope.launch { drawerState.close() }
                    }
                )

                // Error Logs
                NavigationDrawerItem(
                    label = {
                        Text(
                            if (errorLogs.isNotEmpty()) "Error Logs (${errorLogs.size})"
                            else "Error Logs"
                        )
                    },
                    icon = {
                        Icon(
                            imageVector = Icons.Default.ErrorOutline,
                            contentDescription = "Error Logs",
                            tint = if (errorLogs.isNotEmpty()) MaterialTheme.colorScheme.error
                                   else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    selected = false,
                    onClick = {
                        showErrorLogsDialog = true
                        scope.launch { drawerState.close() }
                    }
                )

                HorizontalDivider()
                Spacer(Modifier.height(8.dp))
                Text(
                    "ESP32 Setup",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = androidx.compose.ui.Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                )

                // Full step-by-step ESP setup wizard
                NavigationDrawerItem(
                    label = { Text("ESP Setup Wizard") },
                    selected = false,
                    onClick = {
                        showEspSetupWizard = true
                        scope.launch { drawerState.close() }
                    }
                )

                // Quick: Test ESP32 Connection
                NavigationDrawerItem(
                    label = { Text("Test ESP32 Connection") },
                    selected = false,
                    onClick = {
                        scope.launch {
                            drawerState.close()
                            errorMessage = "Testing ESP32 connection…"
                            try {
                                val resp = withContext(Dispatchers.IO) {
                                    httpClient.get(HEALTH_URL, network = null)
                                }
                                errorMessage = "✅ ESP32 reachable: ${resp.take(80)}"
                            } catch (e: Exception) {
                                errorMessage = "❌ ESP32 unreachable: ${e.message}"
                            }
                        }
                    }
                )

                HorizontalDivider()
                Spacer(Modifier.height(8.dp))
                Text(
                    "Testing",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = androidx.compose.ui.Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                )

                // Fires a real alert via the backend (uses your auth token → guaranteed to match your account)
                NavigationDrawerItem(
                    label = { Text("🔔  Fire Real Motion Alert") },
                    selected = false,
                    onClick = {
                        scope.launch {
                            drawerState.close()
                            try {
                                val resp = withContext(Dispatchers.IO) {
                                    httpClient.post(
                                        url         = com.example.esp32pairingapp.network.ApiConfig.getMotionTestUrl(),
                                        body        = "{}",
                                        contentType = "application/json",
                                        network     = null
                                    )
                                }
                                val json = org.json.JSONObject(resp)
                                errorMessage = "✅ Alert created (id: ${json.optString("alertId")}) — wait up to 15 s"
                            } catch (e: Exception) {
                                errorMessage = "❌ Could not fire test alert: ${e.message}"
                            }
                        }
                    }
                )

                // Instant local UI preview — no network needed
                NavigationDrawerItem(
                    label = { Text("👁  Preview Alert UI (local)") },
                    selected = false,
                    onClick = {
                        scope.launch { drawerState.close() }
                        activeMotionAlert = com.example.esp32pairingapp.alerts.MotionAlertInfo(
                            id          = "preview-${System.currentTimeMillis()}",
                            deviceId    = "pi-1 (preview)",
                            createdAtMs = System.currentTimeMillis(),
                        )
                    }
                )

                // Account info
                Spacer(Modifier.height(8.dp))
                HorizontalDivider()
                Spacer(Modifier.height(8.dp))
                if (!driveAccountEmail.isNullOrBlank()) {
                    Text(
                        "✅ Signed in as:",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = androidx.compose.ui.Modifier.padding(horizontal = 16.dp)
                    )
                    Text(
                        driveAccountEmail!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = androidx.compose.ui.Modifier.padding(horizontal = 16.dp, vertical = 2.dp)
                    )
                } else {
                    Text(
                        "⚠️ Not signed in — alerts won't arrive",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = androidx.compose.ui.Modifier.padding(horizontal = 16.dp)
                    )
                }
            }
        }
    ) {
        Column(
            modifier = androidx.compose.ui.Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 16.dp)
                .verticalScroll(scrollState)
        ) {
            // ── Header row: hamburger | title | Add (+) ────────────────────
            Row(
                modifier = androidx.compose.ui.Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = { scope.launch { drawerState.open() } }) {
                    Icon(
                        imageVector = Icons.Default.Menu,
                        contentDescription = "Open options menu"
                    )
                }
                Text("SentriHome", style = MaterialTheme.typography.titleLarge)
                IconButton(onClick = { /* Add Device — coming soon */ }) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = "Add Device"
                    )
                }
            }

            Spacer(Modifier.height(8.dp))

            // Player area — edge-to-edge: the layout modifier breaks out of the
            // Column's 16dp horizontal padding so the player spans the full screen width.
            Box(
                modifier = androidx.compose.ui.Modifier
                    .height(220.dp)
                    .layout { measurable, constraints ->
                        val sidePadding = 16.dp.roundToPx()
                        val fullWidth = constraints.maxWidth + sidePadding * 2
                        val placeable = measurable.measure(
                            constraints.copy(minWidth = fullWidth, maxWidth = fullWidth)
                        )
                        layout(constraints.maxWidth, placeable.height) {
                            placeable.place(-sidePadding, 0)
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                when {
                    isStreaming && hlsLive == true -> {
                        HlsPlayerView(
                            playlistUrl = com.example.esp32pairingapp.network.ApiConfig.getStreamPlaylistUrl(deviceId),
                            modifier = androidx.compose.ui.Modifier.fillMaxSize()
                        )
                    }
                    isStreaming -> {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator()
                            Spacer(Modifier.height(12.dp))
                            Text(
                                "Waiting for stream...",
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Text(
                                "Ensure Pi can reach Cloud",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                            )
                        }
                    }
                    else -> {
                        androidx.compose.foundation.Canvas(
                            modifier = androidx.compose.ui.Modifier.fillMaxSize()
                        ) {
                            drawRect(color = androidx.compose.ui.graphics.Color.Black)
                        }
                        Text(
                            "Stream offline",
                            color = androidx.compose.ui.graphics.Color.White,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))

            // ── Stream control icon buttons ─────────────────────────────────
            Row(
                modifier = androidx.compose.ui.Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                // Start Cam
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    FilledIconButton(
                        onClick = {
                            scope.launch {
                                isLoadingStream = true
                                errorMessage = null
                                try {
                                    val url = com.example.esp32pairingapp.network.ApiConfig.getStartStreamUrl()
                                    Log.d("StreamPage", "Start stream POST to: $url")
                                    val response = withContext(Dispatchers.IO) {
                                        httpClient.post(
                                            url,
                                            """{"type":"webcam","value":""}""",
                                            "application/json",
                                            null
                                        )
                                    }
                                    Log.d("StreamPage", "Start response: $response")
                                    val json = JSONObject(response)
                                    val status = json.optString("status", "error")
                                    if (status == "ok" || status == "success") {
                                        userStopped = false
                                        isStreaming = true
                                        hlsLive = null
                                        streamUrl = com.example.esp32pairingapp.network.ApiConfig.getStreamPlaylistUrl(deviceId)
                                        errorMessage = "✅ Stream started. Waiting for segments..."
                                    } else {
                                        errorMessage = "⚠️ Start failed: ${json.optString("message", "Unknown error")}"
                                    }
                                } catch (e: Exception) {
                                    val errMsg = e.message ?: ""
                                    if (errMsg.contains("409") || errMsg.contains("already running", ignoreCase = true)) {
                                        userStopped = false
                                        isStreaming = true
                                        errorMessage = "✅ Stream already running. Waiting for cloud segments..."
                                    } else {
                                        errorLogs.add("Start stream failed: ${e.message ?: "unknown"}")
                                        errorMessage = formatConnectionError(e, "Pi", com.example.esp32pairingapp.network.ApiConfig.getStartStreamUrl())
                                    }
                                    Log.e("StreamPage", "Start stream error", e)
                                } finally {
                                    isLoadingStream = false
                                }
                            }
                        },
                        enabled = !isLoadingStream && !isStreaming,
                        modifier = androidx.compose.ui.Modifier.size(56.dp)
                    ) {
                        if (isLoadingStream && !isStreaming) {
                            CircularProgressIndicator(
                                modifier = androidx.compose.ui.Modifier.size(24.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.PlayArrow,
                                contentDescription = "Start Cam",
                                modifier = androidx.compose.ui.Modifier.size(28.dp)
                            )
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Text("Start Cam", style = MaterialTheme.typography.labelMedium)
                }

                // Stop Cam
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    FilledIconButton(
                        onClick = {
                            scope.launch {
                                isLoadingStream = true
                                errorMessage = null
                                try {
                                    val response = withContext(Dispatchers.IO) {
                                        httpClient.post(
                                            com.example.esp32pairingapp.network.ApiConfig.getStopStreamUrl(),
                                            "",
                                            "application/json",
                                            null
                                        )
                                    }
                                    Log.d("StreamPage", "Stop response: $response")
                                    userStopped = true
                                    isStreaming = false
                                    hlsLive = false
                                    streamUrl = null
                                    errorMessage = "Stream stopped"
                                } catch (e: Exception) {
                                    errorLogs.add("Stop stream failed: ${e.message ?: "unknown"}")
                                    errorMessage = formatConnectionError(e, "Pi", com.example.esp32pairingapp.network.ApiConfig.getStopStreamUrl())
                                    Log.e("StreamPage", "Stop stream error", e)
                                } finally {
                                    isLoadingStream = false
                                }
                            }
                        },
                        enabled = !isLoadingStream && isStreaming,
                        modifier = androidx.compose.ui.Modifier.size(56.dp),
                        colors = IconButtonDefaults.filledIconButtonColors(
                            containerColor = MaterialTheme.colorScheme.error
                        )
                    ) {
                        Icon(
                            imageVector = Icons.Default.Stop,
                            contentDescription = "Stop Cam",
                            modifier = androidx.compose.ui.Modifier.size(28.dp)
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Text("Stop Cam", style = MaterialTheme.typography.labelMedium)
                }

            }

            // ── Saved Clips section ─────────────────────────────────────────
            Spacer(Modifier.height(28.dp))
            Text("Saved Clips", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            SavedClipsContent(
                httpClient = httpClient,
                onError = { errorMessage = it.ifBlank { null } },
                showTitle = false,
                onRecentClipDetected = { clip ->
                    // Fallback: if SSE was missed but a fresh clip appeared, show the alert.
                    val syntheticId = "clip-fallback-${clip.id}"
                    if (syntheticId != lastShownAlertId) {
                        activeMotionAlert = com.example.esp32pairingapp.alerts.MotionAlertInfo(
                            id          = syntheticId,
                            deviceId    = clip.deviceId,
                            createdAtMs = System.currentTimeMillis(),
                        )
                        lastShownAlertId = syntheticId
                        showMotionNotification(context, clip.deviceId)
                    }
                }
            )

            // ── Motion Sensors section ──────────────────────────────────────
            Spacer(Modifier.height(28.dp))
            Text("Motion Sensors", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = androidx.compose.ui.Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                // Arm System
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    FilledIconButton(
                        onClick = { /* Arm System — coming soon */ },
                        modifier = androidx.compose.ui.Modifier.size(56.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Lock,
                            contentDescription = "Arm System",
                            modifier = androidx.compose.ui.Modifier.size(28.dp)
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Text("Arm System", style = MaterialTheme.typography.labelMedium)
                }

                // Disarm System
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    FilledIconButton(
                        onClick = { /* Disarm System — coming soon */ },
                        modifier = androidx.compose.ui.Modifier.size(56.dp),
                        colors = IconButtonDefaults.filledIconButtonColors(
                            containerColor = MaterialTheme.colorScheme.secondary
                        )
                    ) {
                        Icon(
                            imageVector = Icons.Default.LockOpen,
                            contentDescription = "Disarm System",
                            modifier = androidx.compose.ui.Modifier.size(28.dp)
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Text("Disarm System", style = MaterialTheme.typography.labelMedium)
                }
            }

            // ── Status / error message ──────────────────────────────────────
            if (errorMessage != null) {
                Spacer(Modifier.height(16.dp))
                Card(
                    modifier = androidx.compose.ui.Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = when {
                            errorMessage!!.startsWith("✅") -> MaterialTheme.colorScheme.primaryContainer
                            errorMessage!!.startsWith("⚠️") -> MaterialTheme.colorScheme.tertiaryContainer
                            errorMessage!!.startsWith("❌") -> MaterialTheme.colorScheme.errorContainer
                            else -> MaterialTheme.colorScheme.surfaceVariant
                        }
                    )
                ) {
                    Text(
                        text = errorMessage!!,
                        modifier = androidx.compose.ui.Modifier.padding(16.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 10,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Spacer(Modifier.height(24.dp))
        }
    }

    // ── Dialogs ─────────────────────────────────────────────────────────────

    // OTP dialog (triggered from Options drawer)
    if (showOtpDialog && pendingOtp.isNotEmpty()) {
        AlertDialog(
            onDismissRequest = { /* prevent accidental dismiss */ },
            title = { Text("SET OTP") },
            text = {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Your One-Time Password:", style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = pendingOtp,
                        style = MaterialTheme.typography.displaySmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.height(12.dp))
                    Text("Send this OTP to the ESP32?", style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = {
                Button(onClick = {
                    val otpToSend = pendingOtp
                    showOtpDialog = false
                    pendingOtp = ""
                    scope.launch {
                        try {
                            withContext(Dispatchers.IO) {
                                httpClient.post(
                                    url = ONETIMEPASS_URL,
                                    body = "otp=${URLEncoder.encode(otpToSend, "UTF-8")}",
                                    contentType = "application/x-www-form-urlencoded",
                                    network = null
                                )
                            }
                            errorMessage = "OTP sent successfully ✅"
                        } catch (e: Exception) {
                            errorMessage = "Failed to send OTP ❌: ${e.message}"
                        }
                    }
                }) { Text("Yes") }
            },
            dismissButton = {
                Button(onClick = {
                    showOtpDialog = false
                    pendingOtp = ""
                }) { Text("No") }
            }
        )
    }

    // Schedule dialog
    if (showScheduleDialog) {
        AlertDialog(
            onDismissRequest = { showScheduleDialog = false },
            title = { Text("Set Schedule") },
            text = {
                ScheduleSection(
                    httpClient = httpClient,
                    onStatus = {
                        errorMessage = it
                        showScheduleDialog = false
                    }
                )
            },
            confirmButton = {},
            dismissButton = {
                Button(onClick = { showScheduleDialog = false }) {
                    Text("Close")
                }
            }
        )
    }

    // Error Logs dialog
    if (showErrorLogsDialog) {
        AlertDialog(
            onDismissRequest = { showErrorLogsDialog = false },
            title = { Text("Error Logs") },
            text = {
                Column(
                    modifier = androidx.compose.ui.Modifier
                        .fillMaxWidth()
                        .heightIn(max = 320.dp)
                        .verticalScroll(rememberScrollState())
                ) {
                    if (errorLogs.isEmpty()) {
                        Text(
                            "No errors logged.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        errorLogs.forEachIndexed { index, log ->
                            Text(
                                text = "${index + 1}. $log",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                modifier = androidx.compose.ui.Modifier.padding(vertical = 4.dp)
                            )
                            if (index < errorLogs.lastIndex) {
                                HorizontalDivider()
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        errorLogs.clear()
                        showErrorLogsDialog = false
                    }
                ) {
                    Text("Clear All")
                }
            },
            dismissButton = {
                Button(onClick = { showErrorLogsDialog = false }) {
                    Text("Close")
                }
            }
        )
    }

    // Change cloud backend URL dialog (from hamburger menu)
    if (showCloudDialog) {
        AlertDialog(
            onDismissRequest = { showCloudDialog = false },
            title = { Text("Cloud backend URL") },
            text = {
                Column {
                    Text(
                        "Enter the Cloud backend URL. For https (e.g. ngrok) no port is added; for http or a bare IP, port 3001 is used.\n\nExamples: https://xxx.ngrok-free.dev or 192.168.1.50",
                        style = MaterialTheme.typography.bodySmall
                    )
                    Spacer(Modifier.height(12.dp))
                    TextField(
                        value = cloudHostInput,
                        onValueChange = { cloudHostInput = it },
                        label = { Text("Cloud URL or IP") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        modifier = androidx.compose.ui.Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Result: " + runCatching { CloudBackendPrefs.computeCloudBaseUrl(cloudHostInput) }
                            .getOrElse { "(invalid)" },
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        try {
                            val baseUrl = CloudBackendPrefs.computeCloudBaseUrl(cloudHostInput)
                            CloudBackendPrefs.setRawHostInput(context, cloudHostInput)
                            com.example.esp32pairingapp.network.ApiConfig.setCloudBaseUrlOverride(baseUrl)
                            errorMessage = "✅ Cloud backend set to $baseUrl"
                            showCloudDialog = false
                        } catch (e: Exception) {
                            errorMessage = "❌ Invalid cloud address: ${e.message}"
                        }
                    },
                    enabled = cloudHostInput.isNotBlank()
                ) { Text("Save") }
            },
            dismissButton = {
                Button(onClick = { showCloudDialog = false }) { Text("Cancel") }
            }
        )
    }

    // Edit Pi dialog
    if (showPiDialog) {
        AlertDialog(
            onDismissRequest = { showPiDialog = false },
            title = { Text("Raspberry Pi IP / Host") },
            text = {
                Column {
                    Text(
                        "Enter the Raspberry Pi's IP or hostname. Port 4000 is used automatically.\n\nExamples: 192.168.1.73 or raspberrypi.local",
                        style = MaterialTheme.typography.bodySmall
                    )
                    Spacer(Modifier.height(12.dp))
                    TextField(
                        value = piHostInput,
                        onValueChange = { piHostInput = it },
                        label = { Text("Pi host or IP") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        modifier = androidx.compose.ui.Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Result: " + runCatching { PiBackendPrefs.computePiBaseUrl(piHostInput) }
                            .getOrElse { "(invalid)" },
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        try {
                            val baseUrl = PiBackendPrefs.computePiBaseUrl(piHostInput)
                            PiBackendPrefs.setRawHostInput(context, piHostInput)
                            com.example.esp32pairingapp.network.ApiConfig.setPiBaseUrlOverride(baseUrl)
                            errorMessage = "✅ Pi backend set to $baseUrl"
                            showPiDialog = false
                            if (CloudBackendPrefs.getRawHostInput(context).isNullOrBlank()) {
                                showCloudDialog = true
                            }
                        } catch (e: Exception) {
                            errorMessage = "❌ Invalid Pi address: ${e.message}"
                        }
                    },
                    enabled = piHostInput.isNotBlank()
                ) { Text("Save") }
            },
            dismissButton = {
                Button(onClick = { showPiDialog = false }) { Text("Cancel") }
            }
        )
    }

    // Send WiFi Credentials dialog (ESP32 setup)
    if (showWifiDialog) {
        WifiCredentialsDialog(
            onDismiss = { showWifiDialog = false },
            onSubmit = { ssid, password ->
                scope.launch {
                    showWifiDialog = false
                    errorMessage = "Sending WiFi credentials…"
                    try {
                        val cleanedSsid = ssid.trim().replace(Regex("\\p{C}"), "")
                        val cleanedPass = password.trim().replace(Regex("\\p{C}"), "")
                        val encodedSsid = URLEncoder.encode(cleanedSsid, "UTF-8")
                        val encodedPass = URLEncoder.encode(cleanedPass, "UTF-8")
                        withContext(Dispatchers.IO) {
                            httpClient.post(
                                url = NEWSSID_URL,
                                body = "SSID=$encodedSsid",
                                contentType = "application/x-www-form-urlencoded",
                                network = null
                            )
                            httpClient.post(
                                url = NEWPASS_URL,
                                body = "pass=$encodedPass",
                                contentType = "application/x-www-form-urlencoded",
                                network = null
                            )
                            val generatedPass = com.example.esp32pairingapp.pairing.PasswordGenerator.generate()
                            httpClient.post(
                                url = ENCRYPTEDPASS_URL,
                                body = "pass=${URLEncoder.encode(generatedPass, "UTF-8")}",
                                contentType = "application/x-www-form-urlencoded",
                                network = null
                            )
                        }
                        errorMessage = "✅ WiFi credentials sent"
                    } catch (e: Exception) {
                        errorMessage = "❌ Failed to send credentials: ${e.message}"
                    }
                }
            }
        )
    }

    // Set Permanent Password dialog (ESP32 setup)
    if (showPermanentPassDialog) {
        val allowedChars = ('0'..'9').toSet() + ('A'..'D').toSet() + setOf('#', '*')
        AlertDialog(
            onDismissRequest = { showPermanentPassDialog = false },
            title = { Text("Set Permanent Password") },
            text = {
                Column {
                    Text(
                        text = "Allowed characters: 0-9, A, B, C, D, #, *",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = permanentPass,
                        onValueChange = { newValue ->
                            val upper = newValue.uppercase()
                            if (upper.length > 8) {
                                permanentPassError = "Password must be exactly 8 characters"
                            } else if (upper.all { ch -> ch in allowedChars }) {
                                permanentPass = upper
                                permanentPassError = null
                            } else {
                                permanentPassError = "Only 0-9, A-D, # and * are allowed"
                            }
                        },
                        label = { Text("Password") },
                        isError = permanentPassError != null,
                        supportingText = permanentPassError?.let { err -> { Text(err) } },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (permanentPass.length != 8) {
                            permanentPassError = "Password must be exactly 8 characters"
                            return@Button
                        }
                        val passToSend = permanentPass
                        showPermanentPassDialog = false
                        scope.launch {
                            try {
                                withContext(Dispatchers.IO) {
                                    httpClient.post(
                                        url = PERMANENTPASS_URL,
                                        body = "pass=${URLEncoder.encode(passToSend, "UTF-8")}",
                                        contentType = "application/x-www-form-urlencoded",
                                        network = null
                                    )
                                }
                                errorMessage = "✅ Permanent password set"
                            } catch (e: Exception) {
                                errorMessage = "❌ Failed to set permanent password: ${e.message}"
                            }
                        }
                    }
                ) { Text("Save") }
            },
            dismissButton = {
                Button(onClick = {
                    showPermanentPassDialog = false
                    permanentPass = ""
                    permanentPassError = null
                }) { Text("Cancel") }
            }
        )
    }

    // Intruder alert overlay — floats above everything when motion is detected
    activeMotionAlert?.let { alert ->
        IntruderAlertOverlay(
            alert      = alert,
            httpClient = httpClient,
            onDismiss  = { activeMotionAlert = null }
        )
    }

    } // end Box
}


@Composable
fun WifiCredentialsDialog(
    onDismiss: () -> Unit,
    onSubmit: (String, String) -> Unit
) {
    var ssid by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Enter WiFi Credentials") },
        text = {
            Column {
                TextField(
                    value = ssid,
                    onValueChange = { ssid = it },
                    label = { Text("SSID") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                TextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (ssid.isNotBlank() && password.isNotBlank()) {
                        onSubmit(ssid, password)
                    }
                },
                enabled = ssid.isNotBlank() && password.isNotBlank()
            ) {
                Text("Submit")
            }
        },
        dismissButton = {
            Button(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

/**
 * Converts connection exceptions into clear, actionable error messages.
 */
private fun formatConnectionError(e: Exception, target: String, url: String): String {
    val msg = (e.message ?: "").lowercase()
    val hint = when {
        msg.contains("failed to connect") || msg.contains("connection refused") ->
            "Check: 1) Phone on same WiFi as $target. 2) $target backend running. 3) Tap Edit ${if (target == "Pi") "Pi" else "Cloud"} to verify IP."
        msg.contains("network is unreachable") || msg.contains("no route to host") ->
            "Phone can't reach $target. Ensure phone is on same WiFi (e.g. 192.168.1.x)."
        msg.contains("timeout") || msg.contains("timed out") ->
            "Connection timed out. Is $target running? Check firewall allows port."
        msg.contains("unknown host") || msg.contains("unable to resolve") ->
            "Invalid host. Tap Edit ${if (target == "Pi") "Pi" else "Cloud"} and enter correct IP (e.g. 192.168.1.66)."
        else ->
            "Tap Edit ${if (target == "Pi") "Pi" else "Cloud"} to verify IP. Use IP only (no slash), e.g. 192.168.1.66."
    }
    return "❌ Can't reach $target at $url\n\n$hint"
}

@Composable
fun PermissionScreen(
    hasPermission: Boolean,
    onRequestPermission: () -> Unit
) {
    Scaffold { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = if (hasPermission) "Permission Granted"
                    else "Permission Required",
                    style = MaterialTheme.typography.headlineSmall
                )

                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    text = "This permission helps Wi-Fi operations on some Android versions/devices.",
                    style = MaterialTheme.typography.bodyMedium
                )

                Spacer(modifier = Modifier.height(20.dp))

                Button(onClick = onRequestPermission) {
                    Text(text = if (hasPermission) "Permission OK" else "Grant Permission")
                }
            }
        }
    }
}

@Composable
fun ScheduleSection(
    httpClient: EspHttpClient,
    onStatus: (String) -> Unit
) {
    var armTime by remember { mutableStateOf("") }
    var disarmTime by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {

            Text("Schedule", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(12.dp))

            // Arm time input
            OutlinedTextField(
                value = armTime,
                onValueChange = { armTime = it },
                label = { Text("Arm Time (HH:MM)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(8.dp))

            // Disarm time input
            OutlinedTextField(
                value = disarmTime,
                onValueChange = { disarmTime = it },
                label = { Text("Disarm Time (HH:MM)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(12.dp))

            // Send schedule button
            Button(
                onClick = {
                    if (armTime.isBlank() || disarmTime.isBlank()) {
                        onStatus("Please enter both arm and disarm times.")
                        return@Button
                    }
                    scope.launch {
                        try {
                            withContext(Dispatchers.IO) {
                                httpClient.post(
                                    url = SCHEDULE_URL,
                                    body = "start=${URLEncoder.encode(armTime, "UTF-8")}" +
                                            "&stop=${URLEncoder.encode(disarmTime, "UTF-8")}",
                                    contentType = "application/x-www-form-urlencoded",
                                    network = null
                                )
                            }
                            onStatus("Schedule set ✅\nStart: $armTime | Stop: $disarmTime")
                        } catch (e: Exception) {
                            onStatus("Failed to set schedule ❌: ${e.message}")
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Send Schedule to ESP32")
            }
        }
    }
}

/**
 * Polls /api/wifistatus every ~750ms until ESP32 returns connected=true.
 * Stops on success, timeout, or coroutine cancellation.
 * When connected is true, calls onConnected (e.g. to send encrypted pass) then onStatus(true, ...).
 */
private suspend fun pollWifiStatus(
    httpClient: EspHttpClient,
    onStatus: (isConnected: Boolean, status: String) -> Unit,
    onConnected: suspend () -> Unit = {}
) {
    val startTime = System.currentTimeMillis()

    fun secondsElapsed(): Long = (System.currentTimeMillis() - startTime) / 1000

    while (currentCoroutineContext().isActive &&
        (System.currentTimeMillis() - startTime) < POLL_TIMEOUT_MS
    ) {
        try {
            val response = withContext(Dispatchers.IO) {
                httpClient.get(WIFISTATUS_URL, network = null)
            }

            val json = runCatching { JSONObject(response) }.getOrNull()

            if (json != null) {
                val connected = json.optBoolean("connected", false)
                val state = json.optString("state", "")
                val reason = json.optString("reason", "")
                val ip = json.optString("ip", "")

                if (connected) {
                    onConnected()
                    val extra = if (ip.isNotBlank()) "\nIP: $ip" else ""
                    onStatus(true, "Connected to home Wi-Fi ✅$extra")
                    return
                }

                val detail = when {
                    state.isNotBlank() -> state
                    reason.isNotBlank() -> "Error: $reason"
                    else -> "Connecting…"
                }

                onStatus(false, "Waiting for ESP32… ($detail)\nElapsed: ${secondsElapsed()}s")
            } else {
                val shortRaw = response.trim().take(80)
                onStatus(
                    false,
                    "Waiting for ESP32…\nStatus: $shortRaw\nElapsed: ${secondsElapsed()}s"
                )
            }

        } catch (_: Exception) {
            onStatus(false, "Waiting for ESP32…\nElapsed: ${secondsElapsed()}s")
        }

        delay(POLL_INTERVAL_MS)
    }

    onStatus(
        false,
        "Timeout ❌\nESP32 did not confirm home Wi-Fi within ${POLL_TIMEOUT_MS / 1000}s."
    )
}
