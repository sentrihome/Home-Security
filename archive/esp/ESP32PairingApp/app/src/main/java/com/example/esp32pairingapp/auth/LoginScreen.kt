package com.example.esp32pairingapp.auth

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.esp32pairingapp.network.ApiConfig

/**
 * Full-screen login page shown when no auth token is present.
 *
 * User taps "Sign in with Google"; the browser opens the cloud backend's
 * /auth/google (default or configured via hamburger menu). OAuth deep-link
 * (home-security://auth-success) is handled by MainActivity which sets
 * isLoggedIn = true, replacing this screen with WifiManualScreen.
 */
@Composable
fun LoginScreen() {
    val context = LocalContext.current
    val scrollState = rememberScrollState()

    // Scaffold handles status-bar / navigation-bar insets (enableEdgeToEdge).
    Scaffold { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(innerPadding)
                .padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(48.dp))

            // Shield icon
            Box(
                modifier = Modifier
                    .size(96.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center
            ) {
                Text(text = "🛡️", fontSize = 48.sp)
            }

            Spacer(Modifier.height(24.dp))

            Text(
                text = "Home Security",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(8.dp))

            Text(
                text = "Sign in with your Google account to access\nyour clips, events, and live stream.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(48.dp))

            ElevatedButton(
                onClick = {
                    val baseUrl = ApiConfig.getCloudBaseUrl()
                    context.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse("$baseUrl/auth/google"))
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(12.dp),
                elevation = ButtonDefaults.elevatedButtonElevation(defaultElevation = 4.dp)
            ) {
                Text(
                    text = "🔐  Sign in with Google",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(Modifier.height(24.dp))

            Text(
                text = "Your clips and events are private to your account.\nNo data is shared without your permission.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(32.dp))
        }
    }
}
