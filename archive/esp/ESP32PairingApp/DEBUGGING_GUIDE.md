# ESP32 Pairing App - Network Debugging Guide

## Problem: WebPage doesn't load when connecting through app

### Symptom
- App connects to ESP32 WiFi successfully
- Trying to access `http://192.168.10.1` in Chrome fails
- Manually connecting through Settings → WiFi works fine

### Root cause

**Android network routing issue:**

When you use `WifiNetworkSpecifier` to connect (Android 10+):
1. Android creates a temporary network connection
2. This network is NOT set as the default system network
3. Apps (including Chrome) continue using the primary network (cellular/WiFi)
4. Chrome tries to reach `192.168.10.1` through the wrong network
5. Request fails because `192.168.10.1` is only accessible through ESP32 network

When you connect through Settings:
1. ESP32 WiFi becomes the system default network
2. All apps automatically use this network
3. Chrome can access `192.168.10.1` ✅

---

## Solution

### Fix 1: Bind process to network (implemented)

The app now calls `ConnectivityManager.setProcessDefaultNetwork(network)` after connecting.

**Code location:** `MainActivity.kt` line 126-132

```kotlin
// Bind app traffic to this network
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
    val bound = networkBinder.bindProcessToNetwork(connectedNetwork)
    if (bound) {
        status = "Connected ✅\nNetwork bound"
    }
}
```

This routes ALL app traffic (including external apps opened from this app) through the ESP32 network.

### Fix 2: Use network-specific HTTP client (implemented)

The app now uses `EspHttpClient` which explicitly routes requests through the ESP32 network.

**Code location:** `EspHttpClient.kt` line 24-48

```kotlin
val urlConnection = network.openConnection(URL(url)) as HttpURLConnection
```

This bypasses the system default network and uses the specified network directly.

---

## Testing the fix

### Test 1: Verify network binding

```kotlin
// After connecting
Button(onClick = {
    scope.launch {
        val testNetwork = network
        if (testNetwork == null) {
            status = "Error: Not connected"
            return@launch
        }
        
        try {
            // This uses the network-specific HTTP client
            val response = httpClient.get("http://192.168.10.1/", testNetwork)
            status = "HTTP test succeeded ✅\nReceived ${response.length} bytes"
        } catch (e: Exception) {
            status = "HTTP test failed ❌: ${e.message}"
        }
    }
}) {
    Text("2. Test HTTP (192.168.10.1)")
}
```

### Test 2: Chrome should work after binding

After the app binds the network, Chrome opened from within the Android system should use the ESP32 network.

However, Chrome may have its own network management. For guaranteed access, use one of these:

#### Option A: In-app WebView (recommended)

Add WebView to the app:

```kotlin
AndroidView(
    factory = { context ->
        WebView(context).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            loadUrl("http://192.168.10.1")
        }
    },
    modifier = Modifier.fillMaxSize()
)
```

WebView will use the process-bound network.

#### Option B: Custom browser intent with network binding

Keep the network bound while opening browser.

---

## Debugging steps

### Step 1: Verify WiFi connection

```kotlin
// Check if connected
val isConnected = network != null
println("Connected to ESP32: $isConnected")
```

### Step 2: Verify network binding

```kotlin
// Check if binding succeeded
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
    val bound = networkBinder.bindProcessToNetwork(network)
    println("Network bound: $bound")
}
```

### Step 3: Test HTTP directly

```kotlin
// Use the HTTP client
try {
    val response = httpClient.get("http://192.168.10.1/", network)
    println("HTTP Success: ${response.substring(0, 100)}")
} catch (e: Exception) {
    println("HTTP Failed: ${e.message}")
}
```

### Step 4: Check logcat

```bash
# Filter for network-related logs
adb logcat | grep -i "network\|wifi\|http"

# Filter for app logs
adb logcat | grep "ESP32PairingApp"
```

Look for:
- `onAvailable` - WiFi connected
- `Network bound` - Binding succeeded
- `HTTP test succeeded` - Can reach ESP32

---

## Common issues

### Issue 1: "Network binding failed"

**Cause:** Permission issue or Android limitation

**Fix:**
- Check CHANGE_NETWORK_STATE permission in manifest ✅ (already present)
- Some Android versions don't allow binding
- Use in-app WebView instead of external Chrome

### Issue 2: Chrome still can't access

**Cause:** Chrome uses its own network management, ignoring process binding

**Fix:** Use in-app WebView instead

### Issue 3: Connection timeout

**Cause:** ESP32 not responding or wrong IP

**Debug:**
```bash
# Check ESP32 logs
# Should show: "Access Point started!"
# Should show: "Open this in your browser: http://192.168.10.1"
```

**Fix:**
- Verify ESP32 hotspot is running
- Check ESP32 IP address (should be 192.168.10.1)
- Increase timeout in app

### Issue 4: Network lost after binding

**Cause:** Android drops the network connection

**Fix:**
- Keep the NetworkCallback active (don't unregister)
- Handle `onLost` callback to reconnect

---

## Recommended solution: In-app WebView

Instead of relying on Chrome, embed WebView in the app:

### Implementation

Update `MainActivity.kt`:

```kotlin
@RequiresApi(Build.VERSION_CODES.Q)
@Composable
fun WifiConnectTestScreen(connector: WifiConnector) {
    var status by remember { mutableStateOf("Idle") }
    var showWebView by remember { mutableStateOf(false) }
    var connectedNetwork by remember { mutableStateOf<Network?>(null) }
    val scope = rememberCoroutineScope()
    val networkBinder = remember { NetworkBinder() }

    if (showWebView && connectedNetwork != null) {
        // Show WebView with ESP32 setup page
        EspSetupWebView(
            network = connectedNetwork!!,
            onBack = { 
                showWebView = false
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    networkBinder.unbindProcessFromNetwork()
                }
                connector.disconnect()
                status = "Disconnected"
            }
        )
    } else {
        // Show connect button
        Column(Modifier.padding(16.dp)) {
            Button(onClick = {
                scope.launch {
                    status = "Connecting..."
                    try {
                        val network = connector.connectAndroid10Plus(
                            ssid = "ESP32_Master_Config",
                            password = "12345678",
                            timeoutMs = 30_000L
                        )
                        
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            networkBinder.bindProcessToNetwork(network)
                        }
                        
                        connectedNetwork = network
                        showWebView = true
                        status = "Connected - Opening setup page..."
                    } catch (e: Exception) {
                        status = "Failed: ${e.message}"
                    }
                }
            }) {
                Text("Connect to ESP32 & Open Setup")
            }
        }
    }
}

@Composable
fun EspSetupWebView(network: Network, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        // Back button
        Button(onClick = onBack, modifier = Modifier.padding(8.dp)) {
            Text("← Back")
        }
        
        // WebView
        AndroidView(
            factory = { context ->
                WebView(context).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    
                    webViewClient = WebViewClient()
                    
                    // WebView will use the process-bound network
                    loadUrl("http://192.168.10.1")
                }
            },
            modifier = Modifier.fillMaxSize()
        )
    }
}
```

---

## How it works now

```
┌─────────────────────────────────────────────────────────────┐
│  CORRECTED FLOW                                             │
└─────────────────────────────────────────────────────────────┘

1. User clicks "Connect to ESP32"
   ├─ App requests WiFi connection via WifiNetworkSpecifier
   └─ Android connects to ESP32_Master_Config

2. App receives Network object
   ├─ App calls bindProcessToNetwork(network)
   └─ All app traffic now routed through ESP32

3. App shows WebView
   ├─ WebView loads http://192.168.10.1
   ├─ WebView uses the bound network
   └─ ESP32 setup page loads ✅

4. User configures ESP32
   └─ All form submissions work (same network)

5. User clicks "Back"
   ├─ App unbinds network
   ├─ App disconnects from ESP32 WiFi
   └─ Returns to normal network routing
```

---

## Alternative: Fix Chrome access

If you want Chrome to work instead of WebView:

### Option 1: Make ESP32 the default network

Instead of using `WifiNetworkSpecifier`, use legacy WiFi APIs:

```kotlin
// This makes ESP32 the system default
val wifiManager = context.getSystemService(Context.WIFI_SERVICE) as WifiManager
val wifiConfig = WifiConfiguration()
wifiConfig.SSID = "\"ESP32_Master_Config\""
wifiConfig.preSharedKey = "\"12345678\""
val netId = wifiManager.addNetwork(wifiConfig)
wifiManager.enableNetwork(netId, true)
```

**Drawback:** Deprecated in Android 10+

### Option 2: Use captive portal detection

Enable captive portal on ESP32:

```cpp
// In ESP32 code
WiFi.softAP(ssid, password);
WiFi.enableDhcpCaptivePortal();  // Auto-redirects to setup page
```

Android will detect the captive portal and open it automatically.

---

## Summary

| Approach | Pros | Cons |
|----------|------|------|
| **In-app WebView** (recommended) | ✅ Works reliably<br>✅ Full control<br>✅ No external dependencies | Needs WebView implementation |
| **Network binding + Chrome** | User's preferred browser | ⚠️ Chrome may ignore binding<br>⚠️ Not reliable |
| **Legacy WiFi APIs** | Chrome works | ❌ Deprecated<br>❌ Requires CHANGE_WIFI_STATE |
| **Captive portal** | Auto-opens | Requires ESP32 changes |

---

## Testing checklist

- [ ] App connects to ESP32 WiFi
- [ ] Network binding succeeds
- [ ] HTTP test button works
- [ ] WebView loads setup page
- [ ] Can submit forms in WebView
- [ ] Can navigate back and disconnect
- [ ] App returns to normal network after disconnect

---

## Quick fix summary

The fix is already implemented:

1. **NetworkBinder.kt** - Binds app traffic to ESP32 network
2. **MainActivity.kt** - Uses NetworkBinder after connection
3. **EspHttpClient.kt** - Makes HTTP requests through specific network

To use:
1. Click "Connect to ESP32" button
2. Wait for "Connected ✅"
3. Click "Test HTTP" to verify
4. Chrome should now work (or use in-app WebView)

If Chrome still doesn't work, the WebView solution is more reliable.
