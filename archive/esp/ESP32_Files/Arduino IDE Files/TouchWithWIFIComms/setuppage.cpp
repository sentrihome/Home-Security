#include "setuppage.h"
#include <Preferences.h>

Preferences prefs;

WebServer server(80);


// ================== HTML PAGE ==================
// Paste your entire HTML file between R"====( and )====
// Keep the R"====( and )====; lines as they are.
const char INDEX_HTML[] PROGMEM = R"====(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Device Setup</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
      padding: 28px;
      width: 100%;
      max-width: 520px;
    }
    .page { display: none; }
    .page.active { display: block; }

    h1 { color: #333; margin-bottom: 14px; text-align: center; font-size: 26px; }
    h2 { color: #667eea; margin-bottom: 12px; text-align: center; font-size: 22px; }

    .sub {
      text-align: center;
      color: #666;
      font-size: 14px;
      margin-bottom: 18px;
      line-height: 1.4;
    }

    .badge-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: center;
      margin-bottom: 18px;
    }
    .badge {
      font-size: 12px;
      padding: 6px 10px;
      border-radius: 999px;
      background: #f1f3ff;
      color: #3f51b5;
      border: 1px solid #dfe4ff;
    }
    .badge.good { background: #e9fbef; border-color: #c5f2d3; color: #1b7a3b; }
    .badge.warn { background: #fff6e5; border-color: #ffe3a6; color: #9a6a00; }
    .badge.bad  { background: #ffe9ea; border-color: #ffc8cb; color: #a1121a; }

    .divider {
      height: 1px;
      background: #eee;
      margin: 18px 0;
    }

    .stepper {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin: 10px 0 18px;
    }
    .step {
      border-radius: 10px;
      padding: 10px 8px;
      text-align: center;
      font-size: 12px;
      border: 1px solid #eee;
      color: #666;
      background: #fafafa;
      line-height: 1.2;
      user-select: none;
    }
    .step.current {
      border-color: #667eea;
      background: #f1f3ff;
      color: #3f51b5;
      font-weight: bold;
    }
    .step.done {
      border-color: #c5f2d3;
      background: #e9fbef;
      color: #1b7a3b;
      font-weight: bold;
    }
    .step.locked {
      opacity: 0.55;
    }

    .form-group { margin-bottom: 14px; }
    label {
      display: block;
      margin-bottom: 6px;
      color: #555;
      font-weight: bold;
      font-size: 14px;
    }
    input[type="text"], input[type="password"], input[type="url"] {
      width: 100%;
      padding: 11px;
      border: 2px solid #ddd;
      border-radius: 8px;
      font-size: 15px;
      transition: border-color 0.2s;
    }
    input:focus { outline: none; border-color: #667eea; }

    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    @media (max-width: 520px) { .row { grid-template-columns: 1fr; } }

    .btn {
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 9px;
      font-size: 15px;
      font-weight: bold;
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
      margin-top: 8px;
    }
    .btn:hover { transform: translateY(-1px); box-shadow: 0 5px 14px rgba(102, 126, 234, 0.25); }
    .btn:active { transform: translateY(0); }
    .btn.secondary { background: #6c757d; }
    .btn.ghost {
      background: transparent;
      border: 1px solid #ddd;
      color: #444;
      font-weight: 600;
    }
    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .error {
      color: #b00020;
      text-align: center;
      margin: 10px 0;
      font-size: 13px;
      display: none;
    }
    .success {
      color: #1b7a3b;
      text-align: center;
      margin: 10px 0;
      font-size: 13px;
      display: none;
    }

    .hint {
      background: #f7f7f7;
      border: 1px solid #eee;
      padding: 12px;
      border-radius: 10px;
      font-size: 13px;
      color: #555;
      line-height: 1.45;
    }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

    .footer-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 12px;
    }

    .small {
      font-size: 12px;
      color: #666;
      margin-top: 10px;
      text-align: center;
    }

    .log {
      margin-top: 12px;
      background: #0b1020;
      color: #d7e2ff;
      border-radius: 12px;
      padding: 12px;
      font-size: 12px;
      line-height: 1.35;
      max-height: 140px;
      overflow: auto;
      display: none;
    }
    .log strong { color: #fff; }
  </style>
</head>

<body>
  <div class="container">
    <h1>Device Setup</h1>
    <div class="sub">
      Configure your ESP device first (Wi-Fi + master backend), then continue to the Security App.
    </div>

    <div class="badge-row">
      <div id="badgeEsp" class="badge warn">ESP: unknown</div>
      <div id="badgeAuth" class="badge warn">Auth: not logged in</div>
      <div id="badgeWifi" class="badge warn">Wi-Fi: not set</div>
      <div id="badgeMaster" class="badge warn">Master IP: not set</div>
    </div>

    <div class="stepper">
      <div id="s1" class="step current">1) Connect</div>
      <div id="s2" class="step locked">2) Login</div>
      <div id="s3" class="step locked">3) Wi-Fi</div>
      <div id="s4" class="step locked">4) Master</div>
    </div>

    <!-- PAGE 1: CONNECT -->
    <div id="connectPage" class="page active">
      <h2>Connect to ESP</h2>
      <div class="hint">
        <strong>Recommended flow:</strong><br/>
        1) Connect your phone/laptop Wi-Fi to <span class="mono">ESP32_Master_Config</span><br/>
        2) Open <span class="mono">http://192.168.10.1</span><br/>
        <div class="divider"></div>
        If this page is served by the ESP directly, you can just continue.
        If it’s served elsewhere, set the ESP base URL below.
      </div>

      <div class="divider"></div>

      <form id="connectForm">
        <div class="form-group">
          <label for="espBase">ESP Base URL</label>
          <input type="url" id="espBase" placeholder="http://192.168.10.1" />
          <div class="small">Tip: you can also pass <span class="mono">?esp=http://192.168.10.1</span> in the URL.</div>
        </div>
        <button type="submit" class="btn">Continue</button>
        <button type="button" class="btn ghost" onclick="pingEsp()">Test Connection</button>
      </form>

      <div id="connectErr" class="error"></div>
      <div id="connectOk" class="success"></div>

      <div id="log" class="log"></div>
    </div>

    <!-- PAGE 2: LOGIN -->
    <div id="loginPage" class="page">
      <h2>Login</h2>
      <div class="sub">This protects setup changes. (Default admin/admin)</div>

      <form id="loginForm">
        <div class="row">
          <div class="form-group">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" value="admin" required />
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" value="admin" required />
          </div>
        </div>
        <button type="submit" class="btn">Login</button>
        <button type="button" class="btn secondary" onclick="goTo('connectPage')">Back</button>
      </form>

      <div id="loginErr" class="error"></div>
      <div id="loginOk" class="success"></div>
    </div>

    <!-- PAGE 3: WIFI -->
    <div id="wifiPage" class="page">
      <h2>Set Wi-Fi</h2>
      <div class="sub">This will switch the ESP from hotspot to your home Wi-Fi.</div>

      <form id="wifiForm">
        <div class="form-group">
          <label for="ssid">SSID</label>
          <input type="text" id="ssid" name="ssid" placeholder="YourWiFiName" required />
        </div>
        <div class="form-group">
          <label for="wifiPassword">Password</label>
          <input type="password" id="wifiPassword" name="wifiPassword" placeholder="Wi-Fi password" required />
        </div>

        <button type="submit" class="btn">Save Wi-Fi</button>

        <div class="footer-actions">
          <button type="button" class="btn secondary" onclick="goTo('loginPage')">Back</button>
          <button type="button" id="wifiNextBtn" class="btn" onclick="goTo('masterPage')" disabled>Next</button>
        </div>
      </form>

      <div id="wifiErr" class="error"></div>
      <div id="wifiOk" class="success"></div>
    </div>

    <!-- PAGE 4: MASTER -->
    <div id="masterPage" class="page">
      <h2>Master / Backend</h2>
      <div class="sub">Tell the ESP where your “unifying backend” lives.</div>

      <form id="masterForm">
        <div class="form-group">
          <label for="deviceName">Device Name</label>
          <input type="text" id="deviceName" name="deviceName" placeholder="FrontDoorCam" required />
        </div>

        <div class="form-group">
          <label for="masterIP">Master Backend URL / IP</label>
          <input type="text" id="masterIP" name="masterIP" placeholder="192.168.1.73 or http://192.168.1.73:4000" required />
        </div>

        <button type="submit" class="btn">Save Master Settings</button>

        <div class="footer-actions">
          <button type="button" class="btn secondary" onclick="goTo('wifiPage')">Back</button>
          <button type="button" id="finishBtn" class="btn" onclick="finishSetup()" disabled>Finish Setup</button>
        </div>
      </form>

      <div id="masterErr" class="error"></div>
      <div id="masterOk" class="success"></div>

      <div class="divider"></div>
      <div class="hint">
        After finishing, the app can discover this device, show live stream, and fetch event clips.
      </div>
    </div>
  </div>

<script>
  // =========================
  // CONFIG
  // =========================
  const DEFAULT_ESP = "http://192.168.10.1";
  const qp = new URLSearchParams(location.search);
  const espFromQuery = qp.get("esp");

  // If serving from ESP directly, ESP_BASE can be empty ("") meaning same-origin.
  let ESP_BASE = localStorage.getItem("esp_base") || (espFromQuery || "");

  // Setup state gates
  const state = {
    connected: false,
    loggedIn: false,
    wifiSaved: false,
    masterSaved: false
  };

  // =========================
  // UI helpers
  // =========================
  function $(id) { return document.getElementById(id); }

  function setMsg(okEl, errEl, okMsg, errMsg) {
    if (okMsg) { okEl.textContent = okMsg; okEl.style.display = "block"; } else okEl.style.display = "none";
    if (errMsg) { errEl.textContent = errMsg; errEl.style.display = "block"; } else errEl.style.display = "none";
  }

  function log(line) {
    const box = $("log");
    box.style.display = "block";
    const ts = new Date().toLocaleTimeString();
    box.innerHTML += `<div><strong>[${ts}]</strong> ${escapeHtml(line)}</div>`;
    box.scrollTop = box.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[m]));
  }

  function setBadge(el, text, kind) {
    el.textContent = text;
    el.className = "badge " + (kind || "warn");
  }

  function refreshBadges() {
    setBadge($("badgeEsp"), `ESP: ${ESP_BASE || "same-origin"}`, state.connected ? "good" : "warn");
    setBadge($("badgeAuth"), `Auth: ${state.loggedIn ? "logged in" : "not logged in"}`, state.loggedIn ? "good" : "warn");
    setBadge($("badgeWifi"), `Wi-Fi: ${state.wifiSaved ? "set" : "not set"}`, state.wifiSaved ? "good" : "warn");
    setBadge($("badgeMaster"), `Master IP: ${state.masterSaved ? "set" : "not set"}`, state.masterSaved ? "good" : "warn");

    setStep("s1", state.connected ? "done" : "current");
    setStep("s2", state.connected ? (state.loggedIn ? "done" : "current") : "locked");
    setStep("s3", state.loggedIn ? (state.wifiSaved ? "done" : "current") : "locked");
    setStep("s4", state.wifiSaved ? (state.masterSaved ? "done" : "current") : "locked");

    $("wifiNextBtn").disabled = !state.wifiSaved;
    $("finishBtn").disabled = !state.masterSaved;
  }

  function setStep(id, mode) {
    const el = $(id);
    el.classList.remove("current", "done", "locked");
    el.classList.add(mode);
  }

  function goTo(pageId) {
    // Gate navigation
    if (pageId === "loginPage" && !state.connected) return;
    if (pageId === "wifiPage" && !state.loggedIn) return;
    if (pageId === "masterPage" && !state.wifiSaved) return;

    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    $(pageId).classList.add("active");
    refreshBadges();
  }

  // =========================
  // Network helpers
  // =========================
  function espUrl(path) {
    // If ESP_BASE is "", it becomes same-origin. Otherwise it targets the ESP IP.
    if (!ESP_BASE) return path;
    return ESP_BASE.replace(/\/$/, "") + path;
  }

  async function postForm(path, dataObj) {
    const body = new URLSearchParams(dataObj).toString();
    const res = await fetch(espUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, text };
  }

  async function postJson(path, dataObj) {
    const res = await fetch(espUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataObj)
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, text };
  }

  async function getText(path) {
    const res = await fetch(espUrl(path), { method: "GET" });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, text };
  }

  // =========================
  // Actions
  // =========================
  async function pingEsp() {
    $("connectErr").style.display = "none";
    $("connectOk").style.display = "none";
    try {
      log("Pinging ESP…");
      // If you implement /status, this will work. If not, we just try GET /
      let r = await getText("/status");
      if (!r.ok) r = await getText("/");
      state.connected = r.ok;
      if (r.ok) {
        setMsg($("connectOk"), $("connectErr"), "ESP reachable ✅", null);
        log("ESP reachable.");
        // unlock login step
        goTo("loginPage");
      } else {
        setMsg($("connectOk"), $("connectErr"), null, `ESP not reachable (HTTP ${r.status}).`);
        log(`ESP not reachable: HTTP ${r.status}`);
      }
    } catch (e) {
      state.connected = false;
      setMsg($("connectOk"), $("connectErr"), null, `Connection failed: ${e.message}`);
      log("Connection failed: " + e.message);
    }
    refreshBadges();
  }

  async function doLogin(username, password) {
    // If you implement ESP-side auth, implement POST /login.
    // If you don't, we fall back to local admin/admin (your sample behavior). :contentReference[oaicite:1]{index=1}
    try {
      log("Trying ESP login…");
      const r = await postJson("/login", { username, password });
      if (r.ok) {
        state.loggedIn = true;
        setMsg($("loginOk"), $("loginErr"), "Logged in ✅", null);
        log("ESP login OK.");
        goTo("wifiPage");
        refreshBadges();
        return;
      }
      log(`ESP /login not available or failed (HTTP ${r.status}). Falling back to local admin/admin…`);
    } catch (e) {
      log("ESP /login error: " + e.message + " (falling back)");
    }

    // Fallback local check (same as sample)
    if (username === "admin" && password === "admin") {
      state.loggedIn = true;
      setMsg($("loginOk"), $("loginErr"), "Logged in ✅ (local fallback)", null);
      goTo("wifiPage");
    } else {
      state.loggedIn = false;
      setMsg($("loginOk"), $("loginErr"), null, "Invalid username or password");
    }
    refreshBadges();
  }

  async function saveWifi(ssid, wifiPassword) {
    // Matches your ESP route: /save-wifi with ssid + wifiPassword :contentReference[oaicite:2]{index=2}
    try {
      log("Saving Wi-Fi to ESP…");
      const r = await postForm("/save-wifi", { ssid, wifiPassword });
      if (r.ok) {
        state.wifiSaved = true;
        setMsg($("wifiOk"), $("wifiErr"), "Wi-Fi saved ✅. ESP will attempt to connect.", null);
        log("Wi-Fi saved. ESP connecting… (it may reboot or switch networks)");
      } else {
        state.wifiSaved = false;
        setMsg($("wifiOk"), $("wifiErr"), null, `Failed to save Wi-Fi (HTTP ${r.status}).`);
        log(`Failed to save Wi-Fi: HTTP ${r.status} ${r.text || ""}`);
      }
    } catch (e) {
      state.wifiSaved = false;
      setMsg($("wifiOk"), $("wifiErr"), null, `Error saving Wi-Fi: ${e.message}`);
      log("Error saving Wi-Fi: " + e.message);
    }
    refreshBadges();
  }

  async function saveMaster(deviceName, masterIP) {
    try {
      log("Saving master settings to ESP…");

      // These endpoints are placeholders you should add on ESP:
      // server.on("/set-name", HTTP_POST, ...) and server.on("/set-master-ip", HTTP_POST, ...)
      const r1 = await postForm("/set-name", { deviceName });
      const r2 = await postForm("/set-master-ip", { masterIP });

      if (r1.ok && r2.ok) {
        state.masterSaved = true;
        setMsg($("masterOk"), $("masterErr"), "Master settings saved ✅", null);
        log("Master settings saved.");
      } else {
        state.masterSaved = false;
        setMsg(
          $("masterOk"),
          $("masterErr"),
          null,
          `Failed: name(${r1.status}) master(${r2.status}). Add ESP routes /set-name and /set-master-ip.`
        );
        log(`Failed saving master: name(${r1.status}) master(${r2.status})`);
      }
    } catch (e) {
      state.masterSaved = false;
      setMsg($("masterOk"), $("masterErr"), null, `Error saving master settings: ${e.message}`);
      log("Error saving master settings: " + e.message);
    }
    refreshBadges();
  }

  function finishSetup() {
    // This page’s job is ONLY provisioning.
    // After this, your mobile/web app can take over.
    log("Setup finished.");
    alert(
      "Setup complete ✅\n\nNext:\n1) Open your Security App\n2) Add device / discover it\n3) View live feed + events\n\n(You can close this page.)"
    );
  }

  // =========================
  // Form wiring
  // =========================
  $("connectForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("espBase").value.trim();
    ESP_BASE = input || ESP_BASE || ""; // allow blank for same-origin
    localStorage.setItem("esp_base", ESP_BASE);
    setMsg($("connectOk"), $("connectErr"), null, null);
    log("ESP base set to: " + (ESP_BASE || "same-origin"));
    await pingEsp();
  });

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = $("username").value.trim();
    const password = $("password").value;
    setMsg($("loginOk"), $("loginErr"), null, null);
    await doLogin(username, password);
  });

  $("wifiForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ssid = $("ssid").value.trim();
    const wifiPassword = $("wifiPassword").value;
    setMsg($("wifiOk"), $("wifiErr"), null, null);
    await saveWifi(ssid, wifiPassword);
  });

  $("masterForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const deviceName = $("deviceName").value.trim();
    const masterIP = $("masterIP").value.trim();
    setMsg($("masterOk"), $("masterErr"), null, null);
    await saveMaster(deviceName, masterIP);
  });

  // =========================
  // Boot
  // =========================
  (function init() {
    // Pre-fill ESP base
    $("espBase").value = ESP_BASE || (espFromQuery || DEFAULT_ESP);

    // If a query param is provided, prefer it
    if (espFromQuery) {
      ESP_BASE = espFromQuery;
      localStorage.setItem("esp_base", ESP_BASE);
    }

    refreshBadges();

    // If served from ESP (same origin), try ping immediately
    // (Won't break if it fails.)
    pingEsp();
  })();
</script>
</body>
</html>


)====";
// ============== END OF HTML PAGE ===============


void handleRoot() {
  // Send the HTML page to the browser
  server.send(200, "text/html", INDEX_HTML);
}

String wifiSSID = "";
String wifiPASS = "";

void handleSaveWifi() {

  // ⬇️ This is where your lines go
  wifiSSID = server.arg("ssid");
  wifiPASS = server.arg("wifiPassword");

  Serial.println("Received WiFi credentials:");
  Serial.println("SSID: " + wifiSSID);
  Serial.println("PASS: " + wifiPASS);

  server.send(200, "text/plain", "WiFi credentials saved");

  prefs.begin("wificreds", false);   // read/write
  prefs.putString("ssid", wifiSSID);
  prefs.putString("password", wifiPASS);
  prefs.end();

  WiFi.begin(wifiSSID.c_str(), wifiPASS.c_str());

}

void setuppage_init() {
  delay(1000);

  // -------- Start Wi-Fi Hotspot (Access Point) --------
  const char* apSsid = "ESP32_Master_Config";   // <-- hotspot name
  const char* apPass = "12345678";              // <-- hotspot password (min 8 chars)

  prefs.begin("wificreds", true);  // read-only
  wifiSSID = prefs.getString("ssid", "");
  wifiPASS = prefs.getString("password", "");
  prefs.end();

  // If credentials exist, try connecting first
  if (wifiSSID.length() > 0 && wifiPASS.length() > 0) {
    Serial.println("Found saved WiFi credentials, attempting connection...");
    WiFi.mode(WIFI_AP_STA);
    WiFi.begin(wifiSSID.c_str(), wifiPASS.c_str());
    // Wait a bit for connection, then fall back to AP if needed
  }
  
  IPAddress apIP(192,168,10,1);
  IPAddress gateway(192,168,10,1);
  IPAddress subnet(255,255,255,0);

  WiFi.softAPConfig(apIP, gateway, subnet);  // apply IP settings
  WiFi.softAP(apSsid, apPass);               // start hotspot
  
  Serial.println();
  Serial.println("Access Point started!");
  Serial.print("SSID: ");
  Serial.println(apSsid);
  Serial.print("Password: ");
  Serial.println(apPass);
  Serial.print("Open this in your browser: http://");
  Serial.println(WiFi.softAPIP());           // or Serial.println(apIP);

  // -------- Web server routes --------
  server.on("/", HTTP_GET, handleRoot);
  server.on("/save-wifi", HTTP_POST, handleSaveWifi);

  // server.begin();
  Serial.println("Web server started");
}

void setuppage_func() {
  server.handleClient();
}


