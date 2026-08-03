package com.example.esp32pairingapp.alerts

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.esp32pairingapp.network.ApiConfig
import com.example.esp32pairingapp.network.CloudBackendPrefs
import com.example.esp32pairingapp.network.EspHttpClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class MotionAlertInfo(
    val id: String,
    val deviceId: String,
    val createdAtMs: Long,
)

private enum class AlertState { WAITING, WAS_ME, NOT_ME }

private val DarkRed   = Color(0xFF1A0000)
private val DeepGreen = Color(0xFF0D2B0D)
private val DeepRed   = Color(0xFF3B0000)
private val AlertRed  = Color(0xFFFF1744)
private val SafeGreen = Color(0xFF66BB6A)

@Composable
fun IntruderAlertOverlay(
    alert: MotionAlertInfo,
    httpClient: EspHttpClient,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val scope   = rememberCoroutineScope()

    var alertState     by remember { mutableStateOf(AlertState.WAITING) }
    var isLoading      by remember { mutableStateOf(false) }
    var cooldownSecs   by remember { mutableIntStateOf(30) }

    // Background color transitions between states
    val bgColor by animateColorAsState(
        targetValue = when (alertState) {
            AlertState.WAITING -> DarkRed
            AlertState.WAS_ME  -> DeepGreen
            AlertState.NOT_ME  -> DeepRed
        },
        animationSpec = tween(500),
        label = "alertBg"
    )

    // Pulsing scale for the warning icon
    val pulse = rememberInfiniteTransition(label = "pulse")
    val iconScale by pulse.animateFloat(
        initialValue = 1f,
        targetValue  = 1.25f,
        animationSpec = infiniteRepeatable(
            animation  = tween(650, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "iconScale"
    )

    // Countdown while in WAS_ME state; auto-dismiss when it hits zero
    LaunchedEffect(alertState) {
        if (alertState == AlertState.WAS_ME) {
            while (cooldownSecs > 0) {
                delay(1_000)
                cooldownSecs--
            }
            onDismiss()
        }
    }

    fun acknowledge(action: String) {
        scope.launch {
            isLoading = true
            runCatching {
                val token = CloudBackendPrefs.getAuthToken(context) ?: ""
                withContext(Dispatchers.IO) {
                    httpClient.post(
                        url         = ApiConfig.getAcknowledgeMotionUrl(alert.id),
                        body        = """{"action":"$action"}""",
                        contentType = "application/json",
                        network     = null,
                        authToken   = token
                    )
                }
            }
            // Advance state regardless of network outcome
            alertState = if (action == "was_me") AlertState.WAS_ME else AlertState.NOT_ME
            isLoading  = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(bgColor),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 32.dp, vertical = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            when (alertState) {

                // ── WAITING: ask the user ───────────────────────────────────
                AlertState.WAITING -> {
                    Box(
                        modifier = Modifier
                            .size(96.dp)
                            .scale(iconScale)
                            .clip(CircleShape)
                            .background(AlertRed.copy(alpha = 0.25f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = "Alert",
                            tint     = AlertRed,
                            modifier = Modifier.size(56.dp)
                        )
                    }

                    Text(
                        text       = "INTRUDER DETECTED",
                        fontSize   = 26.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color      = Color.White,
                        textAlign  = TextAlign.Center
                    )

                    Text(
                        text      = "Motion on: ${alert.deviceId}",
                        fontSize  = 15.sp,
                        color     = Color.White.copy(alpha = 0.75f),
                        textAlign = TextAlign.Center
                    )

                    Text(
                        text      = SimpleDateFormat("HH:mm:ss · dd MMM", Locale.getDefault())
                            .format(Date(alert.createdAtMs)),
                        fontSize  = 13.sp,
                        color     = Color.White.copy(alpha = 0.5f),
                        textAlign = TextAlign.Center
                    )

                    Spacer(Modifier.height(12.dp))

                    Text(
                        text       = "Was it you?",
                        fontSize   = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color      = Color.White
                    )

                    if (isLoading) {
                        CircularProgressIndicator(
                            color    = Color.White,
                            modifier = Modifier.size(40.dp)
                        )
                    } else {
                        Button(
                            onClick  = { acknowledge("was_me") },
                            modifier = Modifier.fillMaxWidth().height(52.dp),
                            colors   = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                        ) {
                            Text(
                                "✅  It was me — disable alarm",
                                fontSize   = 15.sp,
                                fontWeight = FontWeight.SemiBold,
                                color      = Color.White
                            )
                        }

                        Button(
                            onClick  = { acknowledge("not_me") },
                            modifier = Modifier.fillMaxWidth().height(52.dp),
                            colors   = ButtonDefaults.buttonColors(containerColor = Color(0xFFC62828))
                        ) {
                            Text(
                                "🚨  It was NOT me!",
                                fontSize   = 15.sp,
                                fontWeight = FontWeight.SemiBold,
                                color      = Color.White
                            )
                        }
                    }
                }

                // ── WAS ME: show cooldown ───────────────────────────────────
                AlertState.WAS_ME -> {
                    Text("✅", fontSize = 72.sp, textAlign = TextAlign.Center)

                    Text(
                        text       = "Alarm Disabled",
                        fontSize   = 26.sp,
                        fontWeight = FontWeight.Bold,
                        color      = SafeGreen
                    )

                    val mins = cooldownSecs / 60
                    val secs = cooldownSecs % 60
                    Text(
                        text      = "Cooldown: ${mins}m ${secs.toString().padStart(2, '0')}s",
                        fontSize  = 18.sp,
                        color     = Color.White.copy(alpha = 0.8f)
                    )

                    Spacer(Modifier.height(8.dp))

                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.fillMaxWidth(),
                        colors  = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)
                    ) {
                        Text("Dismiss")
                    }
                }

                // ── NOT ME: call 911 ────────────────────────────────────────
                AlertState.NOT_ME -> {
                    Text("🚨", fontSize = 72.sp, textAlign = TextAlign.Center)

                    Text(
                        text       = "INTRUDER ALERT",
                        fontSize   = 28.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color      = AlertRed
                    )

                    Text(
                        text      = "Alarm is active",
                        fontSize  = 15.sp,
                        color     = Color.White.copy(alpha = 0.7f)
                    )

                    Spacer(Modifier.height(8.dp))

                    Button(
                        onClick  = {
                            context.startActivity(
                                Intent(Intent.ACTION_DIAL, Uri.parse("tel:911"))
                            )
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(64.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD50000))
                    ) {
                        Text(
                            text       = "📞  CALL 911",
                            fontSize   = 20.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color      = Color.White
                        )
                    }

                    OutlinedButton(
                        onClick  = onDismiss,
                        modifier = Modifier.fillMaxWidth(),
                        colors   = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)
                    ) {
                        Text("Dismiss alert")
                    }
                }
            }
        }
    }
}
