package com.example.esp32pairingapp.setup

import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.animation.*
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.filled.WifiFind
import androidx.compose.material.icons.outlined.Cable
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.Shuffle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.esp32pairingapp.network.EspHttpClient
import com.example.esp32pairingapp.network.EspSetupPrefs
import com.example.esp32pairingapp.pairing.PasswordGenerator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.URLEncoder

private const val ESP_BASE = "http://192.168.10.1"
private const val HEALTH_URL = "$ESP_BASE/api/health"
private const val NEWSSID_URL = "$ESP_BASE/api/newssid"
private const val NEWPASS_URL = "$ESP_BASE/api/newpass"
private const val PERMANENTPASS_URL = "$ESP_BASE/api/permanentpass"
private const val ENCRYPTEDPASS_URL = "$ESP_BASE/api/encryptedpass"
private const val MAINCONNECTION_URL = "$ESP_BASE/api/mainconnection"

@RequiresApi(Build.VERSION_CODES.LOLLIPOP)
@Composable
fun EspMainSetupScreen(
    httpClient: EspHttpClient,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val scrollState = rememberScrollState()

    // Steps: 0=connect, 1=wifi creds, 2=permanent pass, 3=random pass, 4=module pair, 5=done
    var currentStep by remember { mutableIntStateOf(0) }
    var status by remember { mutableStateOf("") }

    // Step 0: Connection
    var connectionOk by remember { mutableStateOf(false) }

    // Step 1: Wi-Fi credentials
    var wifiSsid by remember { mutableStateOf("") }
    var wifiPassword by remember { mutableStateOf("") }
    var wifiCredsSent by remember { mutableStateOf(false) }

    // Step 2: Permanent password
    var permanentPass by remember { mutableStateOf("") }
    var permanentPassError by remember { mutableStateOf<String?>(null) }
    var permanentPassSent by remember { mutableStateOf(false) }

    // Step 3: Random password
    var randomPass by remember { mutableStateOf("") }
    var randomPassSent by remember { mutableStateOf(false) }

    // Step 4: Module pairing
    var modulePaired by remember { mutableStateOf(false) }

    var isLoading by remember { mutableStateOf(false) }

    // Load previously saved random password if it exists
    LaunchedEffect(Unit) {
        EspSetupPrefs.getSavedRandomPassword(context)?.let { saved ->
            randomPass = saved
        }
    }

    val steps = listOf(
        StepDef("Connect", Icons.Filled.Wifi),
        StepDef("Wi-Fi", Icons.Filled.WifiFind),
        StepDef("Permanent", Icons.Outlined.Shield),
        StepDef("Random", Icons.Outlined.Shuffle),
        StepDef("Module", Icons.Outlined.Cable),
        StepDef("Done", Icons.Filled.CheckCircle),
    )
    val allowedChars = ('0'..'9').toSet() + ('A'..'D').toSet() + setOf('#', '*')

    Scaffold(
        topBar = {
            @OptIn(ExperimentalMaterial3Api::class)
            TopAppBar(
                title = { Text("ESP Main Setup") },
                navigationIcon = {
                    TextButton(onClick = onBack) { Text("Back") }
                }
            )
        }
    ) { innerPadding ->
        Box(Modifier.fillMaxSize().padding(innerPadding)) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState)
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Step indicator
                StepIndicator(currentStep = currentStep, steps = steps)

                Spacer(Modifier.height(4.dp))

                // Status card
                if (status.isNotEmpty()) {
                    Card(
                        modifier = Modifier.fillMaxWidth().animateContentSize(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant
                        )
                    ) {
                        Text(
                            text = status,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(16.dp)
                        )
                    }
                }

                // ── Step 0: Connect to ESP Main ──
                StepCard(
                    stepNumber = 0,
                    title = "Connect to ESP Main",
                    subtitle = "Make sure your phone is on the same Home Wi-Fi as the ESP Main hardware, then test the connection.",
                    isActive = currentStep == 0,
                    isComplete = connectionOk
                ) {
                    Button(
                        onClick = {
                            scope.launch {
                                isLoading = true
                                status = "Testing ESP Main connection..."
                                try {
                                    withContext(Dispatchers.IO) {
                                        httpClient.get(HEALTH_URL, network = null)
                                    }
                                    delay(200)
                                    connectionOk = true
                                    status = "ESP Main connected"
                                    currentStep = 1
                                } catch (e: Exception) {
                                    connectionOk = false
                                    status = "Connection failed: ${e.message}\n\nMake sure you're on the same Wi-Fi network as the ESP."
                                }
                                isLoading = false
                            }
                        },
                        enabled = !isLoading && !connectionOk,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        if (connectionOk) {
                            Icon(Icons.Filled.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Connected")
                        } else {
                            Icon(Icons.Filled.Wifi, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Test Connection")
                        }
                    }
                }

                // ── Step 1: Send Wi-Fi Credentials ──
                StepCard(
                    stepNumber = 1,
                    title = "Send Wi-Fi Credentials",
                    subtitle = "Enter your home Wi-Fi SSID and password so the ESP can join your network.",
                    isActive = currentStep == 1,
                    isComplete = wifiCredsSent
                ) {
                    OutlinedTextField(
                        value = wifiSsid,
                        onValueChange = { wifiSsid = it },
                        label = { Text("Wi-Fi SSID") },
                        singleLine = true,
                        enabled = !wifiCredsSent,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(8.dp))

                    OutlinedTextField(
                        value = wifiPassword,
                        onValueChange = { wifiPassword = it },
                        label = { Text("Wi-Fi Password") },
                        singleLine = true,
                        enabled = !wifiCredsSent,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(8.dp))

                    Button(
                        onClick = {
                            scope.launch {
                                isLoading = true
                                status = "Sending Wi-Fi credentials..."
                                try {
                                    withContext(Dispatchers.IO) {
                                        httpClient.post(
                                            url = NEWSSID_URL,
                                            body = "SSID=${URLEncoder.encode(wifiSsid.trim(), "UTF-8")}",
                                            contentType = "application/x-www-form-urlencoded",
                                            network = null
                                        )
                                        httpClient.post(
                                            url = NEWPASS_URL,
                                            body = "pass=${URLEncoder.encode(wifiPassword.trim(), "UTF-8")}",
                                            contentType = "application/x-www-form-urlencoded",
                                            network = null
                                        )
                                    }
                                    delay(200)
                                    wifiCredsSent = true
                                    status = "Wi-Fi credentials sent"
                                    currentStep = 2
                                } catch (e: Exception) {
                                    status = "Failed to send Wi-Fi credentials: ${e.message}"
                                }
                                isLoading = false
                            }
                        },
                        enabled = !isLoading && !wifiCredsSent && wifiSsid.isNotBlank() && wifiPassword.isNotBlank(),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        if (wifiCredsSent) {
                            Icon(Icons.Filled.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Sent")
                        } else {
                            Icon(Icons.Filled.WifiFind, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Send Wi-Fi Credentials")
                        }
                    }
                }

                // ── Step 2: Set Permanent Password ──
                StepCard(
                    stepNumber = 2,
                    title = "Set Permanent Password",
                    subtitle = "Enter an 8-character password using: 0-9, A, B, C, D, #, *",
                    isActive = currentStep == 2,
                    isComplete = permanentPassSent
                ) {
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
                        label = { Text("Permanent Password") },
                        isError = permanentPassError != null,
                        supportingText = {
                            Text(permanentPassError ?: "${permanentPass.length}/8 characters")
                        },
                        singleLine = true,
                        enabled = !permanentPassSent,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(8.dp))

                    Button(
                        onClick = {
                            if (permanentPass.length != 8) {
                                permanentPassError = "Password must be exactly 8 characters"
                                return@Button
                            }
                            scope.launch {
                                isLoading = true
                                status = "Sending permanent password..."
                                try {
                                    withContext(Dispatchers.IO) {
                                        httpClient.post(
                                            url = PERMANENTPASS_URL,
                                            body = "pass=${URLEncoder.encode(permanentPass, "UTF-8")}",
                                            contentType = "application/x-www-form-urlencoded",
                                            network = null
                                        )
                                    }
                                    delay(200)
                                    permanentPassSent = true
                                    status = "Permanent password set"
                                    currentStep = 3
                                } catch (e: Exception) {
                                    status = "Failed to set permanent password: ${e.message}"
                                }
                                isLoading = false
                            }
                        },
                        enabled = !isLoading && !permanentPassSent && permanentPass.length == 8,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        if (permanentPassSent) {
                            Icon(Icons.Filled.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Saved")
                        } else {
                            Icon(Icons.Filled.Lock, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Save Permanent Password")
                        }
                    }
                }

                // ── Step 3: Generate & Send Random Password ──
                StepCard(
                    stepNumber = 3,
                    title = "Random Password",
                    subtitle = "Generate a random password, send it to the ESP, and save it to your phone for module pairing.",
                    isActive = currentStep == 3,
                    isComplete = randomPassSent
                ) {
                    if (randomPass.isNotEmpty()) {
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer
                            ),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = randomPass,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(16.dp)
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = { randomPass = PasswordGenerator.generate() },
                            enabled = !randomPassSent,
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Filled.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Generate")
                        }

                        Button(
                            onClick = {
                                scope.launch {
                                    isLoading = true
                                    status = "Sending random password to ESP..."
                                    try {
                                        withContext(Dispatchers.IO) {
                                            httpClient.post(
                                                url = ENCRYPTEDPASS_URL,
                                                body = "pass=${URLEncoder.encode(randomPass, "UTF-8")}",
                                                contentType = "application/x-www-form-urlencoded",
                                                network = null
                                            )
                                        }
                                        EspSetupPrefs.setSavedRandomPassword(context, randomPass)
                                        delay(200)
                                        randomPassSent = true
                                        status = "Random password sent & saved to phone"
                                        currentStep = 4
                                    } catch (e: Exception) {
                                        status = "Failed to send random password: ${e.message}"
                                    }
                                    isLoading = false
                                }
                            },
                            enabled = !isLoading && !randomPassSent && randomPass.isNotEmpty(),
                            modifier = Modifier.weight(1f)
                        ) {
                            if (randomPassSent) {
                                Icon(Icons.Filled.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Saved")
                            } else {
                                Icon(Icons.Outlined.Key, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Send & Save")
                            }
                        }
                    }
                }

                // ── Step 4: Pair Module ──
                StepCard(
                    stepNumber = 4,
                    title = "Pair Module",
                    subtitle = "Go to your phone's Wi-Fi settings and connect to the ESP32 Module network. Then return here and tap Start Pairing.",
                    isActive = currentStep == 4,
                    isComplete = modulePaired
                ) {
                    Button(
                        onClick = {
                            scope.launch {
                                isLoading = true
                                status = "Pairing module..."
                                try {
                                    val passToSend = EspSetupPrefs.getSavedRandomPassword(context)
                                        ?: randomPass
                                    val response = withContext(Dispatchers.IO) {
                                        httpClient.post(
                                            url = MAINCONNECTION_URL,
                                            body = "pass=${URLEncoder.encode(passToSend, "UTF-8")}",
                                            contentType = "application/x-www-form-urlencoded",
                                            network = null
                                        )
                                    }
                                    delay(200)
                                    if (response.trim().equals("OK", ignoreCase = true)) {
                                        modulePaired = true
                                        status = ""
                                        currentStep = 5
                                    } else {
                                        status = "Module responded but pairing was not confirmed.\nResponse: ${response.take(200)}"
                                    }
                                } catch (e: Exception) {
                                    status = "Module pairing failed: ${e.message}\n\nMake sure you're connected to the Module Wi-Fi."
                                }
                                isLoading = false
                            }
                        },
                        enabled = !isLoading && !modulePaired,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        if (modulePaired) {
                            Icon(Icons.Filled.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Paired")
                        } else {
                            Icon(Icons.Outlined.Cable, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Start Pairing")
                        }
                    }
                }

                // ── Step 4: Done — Success Celebration ──
                AnimatedVisibility(
                    visible = currentStep == 5,
                    enter = fadeIn() + scaleIn(
                        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy)
                    )
                ) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer
                        )
                    ) {
                        Column(
                            modifier = Modifier.padding(28.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            // Animated bouncing celebration icon
                            val scale by animateFloatAsState(
                                targetValue = if (currentStep == 5) 1f else 0f,
                                animationSpec = spring(
                                    dampingRatio = Spring.DampingRatioMediumBouncy,
                                    stiffness = Spring.StiffnessLow
                                ),
                                label = "celebrationScale"
                            )
                            Box(
                                modifier = Modifier
                                    .size(80.dp)
                                    .scale(scale)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.primary),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(text = "🎉", fontSize = 40.sp)
                            }

                            Spacer(Modifier.height(16.dp))

                            Text(
                                text = "Setup Complete!",
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.Center
                            )

                            Spacer(Modifier.height(4.dp))

                            Text(
                                text = "Everything is configured and ready to go",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                textAlign = TextAlign.Center
                            )

                            Spacer(Modifier.height(20.dp))

                            val summaryItems = listOf(
                                Triple(Icons.Filled.Wifi, "ESP Main connected", true),
                                Triple(Icons.Filled.WifiFind, "Wi-Fi credentials sent", true),
                                Triple(Icons.Outlined.Shield, "Permanent password set", true),
                                Triple(Icons.Outlined.Key, "Random password saved", true),
                                Triple(Icons.Outlined.Cable, "Module paired", true),
                            )
                            summaryItems.forEach { (icon, label, _) ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        Icons.Filled.CheckCircle,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(Modifier.width(10.dp))
                                    Icon(
                                        icon,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Text(
                                        text = label,
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                }
                            }

                            Spacer(Modifier.height(20.dp))

                            Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) {
                                Text("Back to Home")
                            }
                        }
                    }
                }

                Spacer(Modifier.height(24.dp))
            }

            // Loading overlay
            if (isLoading) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.scrim.copy(alpha = 0.3f)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Card {
                            Row(
                                modifier = Modifier.padding(24.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                CircularProgressIndicator(modifier = Modifier.size(24.dp))
                                Text(status.lines().first())
                            }
                        }
                    }
                }
            }
        }
    }
}

private data class StepDef(val label: String, val icon: ImageVector)

@Composable
private fun StepIndicator(currentStep: Int, steps: List<StepDef>) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        steps.forEachIndexed { index, step ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Surface(
                    shape = CircleShape,
                    color = when {
                        index < currentStep -> MaterialTheme.colorScheme.primary
                        index == currentStep -> MaterialTheme.colorScheme.primaryContainer
                        else -> MaterialTheme.colorScheme.surfaceVariant
                    },
                    modifier = Modifier.size(32.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        if (index < currentStep) {
                            Icon(
                                Icons.Filled.CheckCircle,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onPrimary,
                                modifier = Modifier.size(20.dp)
                            )
                        } else {
                            Icon(
                                step.icon,
                                contentDescription = null,
                                tint = when {
                                    index == currentStep -> MaterialTheme.colorScheme.onPrimaryContainer
                                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                                },
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    text = step.label,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (index <= currentStep)
                        MaterialTheme.colorScheme.onSurface
                    else
                        MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun StepCard(
    stepNumber: Int,
    title: String,
    subtitle: String,
    isActive: Boolean,
    isComplete: Boolean,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth().animateContentSize(),
        colors = CardDefaults.cardColors(
            containerColor = when {
                isComplete -> MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f)
                isActive -> MaterialTheme.colorScheme.surface
                else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
            }
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = if (isActive) 2.dp else 0.dp
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (isComplete) {
                    Icon(
                        Icons.Filled.CheckCircle,
                        contentDescription = "Complete",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(22.dp)
                    )
                } else {
                    Surface(
                        shape = CircleShape,
                        color = if (isActive) MaterialTheme.colorScheme.primaryContainer
                        else MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.size(22.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = "${stepNumber + 1}",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = if (isActive) MaterialTheme.colorScheme.onPrimaryContainer
                                else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                Spacer(Modifier.width(10.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }

            if (isActive || isComplete) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (isActive && !isComplete) {
                    Spacer(Modifier.height(12.dp))
                    content()
                }
            }
        }
    }
}
