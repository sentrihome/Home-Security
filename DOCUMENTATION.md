# Home Security — implementation guides

System design (D1–D19, §1–§23) lives in **[README.md](README.md)**. This file is for
people picking up a slice of work.

| Guide | Who | Status |
|---|---|---|
| [Phone: Google Drive OAuth](#phone-google-drive-oauth-and-token-handoff) | mobile app | **ready to implement** — Pi side is live |
| [Legacy cloud-backend testing](#legacy-cloud-backend-testing-guide) | retired path (D10) | do not extend |

---

## Phone: Google Drive OAuth and token handoff

**Owner:** whoever is on the mobile app (`mobile/`).
**Pi owner does not need to wait** — `pi_hub/drive.py` already records clips and
uploads them once this handoff succeeds.

Architecture: [README.md §17](README.md#17-clips-pi-cache--google-drive) (pipeline)
and [§18](README.md#18-google-token-handoff) (security rules). This section is the
copy-paste contract + Expo template.

### What the Pi needs from the phone

The Pi never talks to Google as "the user" until the phone finishes OAuth and
hands credentials over. One `POST` on the home LAN or Tailscale — never a public
URL.

`POST http://<pi-host>:4000/auth/drive`

The refresh token is **bound to the OAuth client that issued it**. The Pi
therefore needs that client's id and secret so it can mint access tokens later,
when a clip is ready and the phone is not around.

Send **exactly one** of the two shapes below. `client_id` + `client_secret` are
required in both.

#### Shape A — phone already has a refresh token (preferred)

```json
{
  "refresh_token": "1//0e…",
  "email": "user@gmail.com",
  "client_id": "xxxx.apps.googleusercontent.com",
  "client_secret": "GOCSPX-…"
}
```

`email` can be omitted: the Pi will call Google userinfo after refreshing. Send
it anyway so the Settings UI can show "Drive linked as …" without a round trip.

#### Shape B — phone has an auth code (Expo AuthSession default)

Expo `AuthSession` returns an **authorization code** plus a PKCE
`code_verifier`. Forward both; the Pi exchanges them for the refresh token.

```json
{
  "auth_code": "4/0Aan…",
  "code_verifier": "the PKCE verifier from AuthRequest",
  "redirect_uri": "homesecurity://oauth",
  "client_id": "xxxx.apps.googleusercontent.com",
  "client_secret": "GOCSPX-…",
  "email": "user@gmail.com"
}
```

`server_auth_code` is accepted as an alias of `auth_code` (Google Sign-In
Android/iOS). If that library used PKCE, still send `code_verifier`.

#### Success / failure

```json
{ "ok": true, "email": "user@gmail.com", "folder_name": "SentriHome", "linked": true }
```

```json
{ "ok": false, "error": "…", "hint": "Need access_type=offline and prompt=consent …" }
```

If `hint` mentions `prompt=consent`, Google did not issue a refresh token.
That is almost always a missing `access_type=offline` or a silent re-auth that
skipped the consent screen.

### Other Pi endpoints the phone uses

| Method | Path | Why |
|---|---|---|
| `GET` | `/auth/drive` | `{ linked, email, folder_name, last_upload, error }` — no secrets |
| `DELETE` | `/auth/drive` | User tapped Disconnect. Pi forgets the token. |
| `GET` | `/health` | `drive.linked` / `drive.error` (and legacy `drive_token`: bool) |
| `POST` | `/motion` | Optional: force a clip so you can verify upload during Settings QA |

Helpers already exist in `mobile/lib/api.ts`: `piApi.authDrive`, `piApi.driveStatus`.
Pi host comes from the setup wizard / Settings (`getPiBaseUrl()`, port 4000).

Do **not** list clips via `GET /clips/cache` in the product UI. That is a Pi-local
debug listing. Playback is the user's own Drive session (cellular, Tailscale off)
— that is a follow-up on the Clips tab, not this handoff.

### Google Cloud Console (once, shared by phone + Pi)

1. Create (or reuse) a Google Cloud project.
2. Enable **Google Drive API**.
3. OAuth consent screen: External, test users = the Gmail accounts you use.
4. Scopes:
   - `https://www.googleapis.com/auth/drive.file` (files this app creates only)
   - `https://www.googleapis.com/auth/userinfo.email`
5. Create an OAuth client, type **Web application** (not iOS/Android — native
   clients do not give the Pi a refreshable token).
6. Authorized redirect URIs, all of these:
   - `homesecurity://oauth`  (dev client, `app.json` scheme)
   - the URI `AuthSession.makeRedirectUri({ scheme: 'homesecurity', path: 'oauth' })` prints on device
7. Copy **Client ID** and **Client secret** into the app env (below). The same
   pair is what `POST /auth/drive` sends to the Pi.

Desktop-app clients also work; Web is the one Expo documents. Do not create a
separate Pi-only client — a refresh token from client A cannot be refreshed by
client B.

### App env (`mobile/.env`)

```
EXPO_PUBLIC_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_SECRET=GOCSPX-…
```

These are "installed app" secrets: they ship in the binary. That is expected.
The **refresh token** is the real secret — store it in SecureStore if the phone
keeps a copy, and never log it. The Pi encrypts its copy at rest.

### Packages to add

```bash
cd mobile
npx expo install expo-auth-session expo-crypto
```

`expo-web-browser` is already a dependency.

### Template — drop into `mobile/lib/driveAuth.ts`

This is a starting file, not production-polished UX. Wire a Settings button to
`connectGoogleDrive()`, show `driveStatus().email`, and a Disconnect that calls
`DELETE /auth/drive` plus `signOut` of the Google session.

```ts
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { piApi } from '@/lib/api';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_SECRET ?? '';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

export function googleRedirectUri(): string {
  return AuthSession.makeRedirectUri({ scheme: 'homesecurity', path: 'oauth' });
}

/** Run from a Settings "Connect Google Drive" button. Must reach the Pi. */
export async function connectGoogleDrive(): Promise<{ email: string }> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Set EXPO_PUBLIC_GOOGLE_CLIENT_ID and _CLIENT_SECRET in mobile/.env');
  }

  const redirectUri = googleRedirectUri();
  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID,
    scopes: SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: {
      access_type: 'offline',
      prompt: 'consent', // required or Google omits refresh_token on the second login
    },
  });

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) {
    throw new Error(result.type === 'cancel' ? 'Sign-in cancelled' : 'Google sign-in failed');
  }

  const handed = await piApi.authDrive({
    auth_code: result.params.code,
    code_verifier: request.codeVerifier,
    redirect_uri: redirectUri,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  if (!handed.ok) {
    throw new Error(handed.error || 'Pi rejected Drive credentials');
  }
  return { email: handed.email || '' };
}

export async function driveLinkStatus() {
  return piApi.driveStatus();
}
```

Settings UX (minimum):

1. Button **Connect Google Drive** → `connectGoogleDrive()`.
2. After success, show `Drive linked as {email}`. Confirm with `piApi.driveStatus()`.
3. Button **Disconnect Drive** → `piApi.unlinkDrive()`.
4. If `driveStatus().error` contains `invalid_grant`, show **Reconnect Google Drive**
   (token revoked in Google Account settings). Do not fail silently.

Keep the existing cloud-backend "paste a Bearer token" login (`/login`) alone —
that is the retired S3 clips path (D10). Drive linking is a **separate** control
on Settings, talking to the Pi, not to port 3001.

### Local smoke test (phone person, no firmware)

On a laptop on the same LAN / Tailscale as the Pi, after you have a real
`refresh_token` from Google's OAuth Playground (scope `drive.file`, offline):

```bash
curl -s -X POST http://192.168.0.236:4000/auth/drive \
  -H 'Content-Type: application/json' \
  -d '{"refresh_token":"1//…","email":"you@gmail.com","client_id":"….apps.googleusercontent.com","client_secret":"GOCSPX-…"}'

curl -s http://192.168.0.236:4000/auth/drive   # linked: true, no token in body
curl -s -X POST http://192.168.0.236:4000/motion
# Drive: a SentriHome folder appears; clip-YYYYMMDD-HHMMSS.mp4 inside it
```

Replace the LAN IP with the Tailscale IP (`100.66.51.106`) when testing off-LAN.

### Phone-side checklist (Phase 8, handoff only)

- [ ] Google Cloud Web client + Drive API + test users
- [ ] `expo-auth-session` + env client id/secret
- [ ] `access_type=offline` **and** `prompt=consent` on every connect
- [ ] Scope limited to `drive.file` + email — not `drive` / `drive.readonly`
- [ ] `POST /auth/drive` only while on LAN or Tailscale
- [ ] SecureStore if the app keeps `refresh_token`; never `console.log` it
- [ ] Settings: linked email, disconnect, reconnect-on-revoked
- [ ] Confirm `GET /health` → `drive.linked: true` after connect
- [ ] Confirm a `POST /motion` clip lands in Drive **SentriHome**
- [ ] Later (not this ticket): Clips tab lists/plays from Drive with Tailscale off

### Out of scope for the phone person (already on the Pi)

Clip record from MediaMTX, encrypted token file, folder create, multipart
upload, `invalid_grant` surfaced on `GET /auth/drive`. Local cache retention
after a successful upload is still TBD (README §22 #9).

---

## Legacy: cloud-backend testing guide

Run automated tests and manual checks before pushing. Covers **retired**
cloud-backend auth and API, and the old frontend (Android app) flows. Product
clips are Pi → Drive (above), not S3.

---

## 1. Backend: automated tests (no server needed)

From repo root:

```bash
cd cloud-backend
npm test
```

- Runs unit tests for the **auth** module (token create/lookup/invalidate, `requireAuth`, `requireAuthOrQueryToken`, `optionalAuth`).
- Expect: **all tests pass** (16 tests).

---

## 2. Backend: smoke test (server + MongoDB running)

1. Start the cloud backend (and ensure MongoDB is reachable):

   ```bash
   cd cloud-backend
   npm start
   ```

2. In another terminal, run the smoke script:

   ```bash
   cd cloud-backend
   chmod +x scripts/smoke-test.sh
   ./scripts/smoke-test.sh http://localhost:3001
   ```

   Or with ngrok base URL:

   ```bash
   ./scripts/smoke-test.sh https://YOUR-NGROK-URL
   ```

- Checks: **GET /status** returns 200; **GET /api/events** and **GET /api/auth/me** return **401** when no token.

---

## 3. Frontend (Android app): how to test

Use a device or emulator with the app installed. Cloud backend must be running and reachable (localhost for emulator, or ngrok URL for a real device).

### 3.1 Setup

- **Emulator:** Set `cloud.base.url` in `ESP32PairingApp/local.properties` to your backend (e.g. `http://10.0.2.2:3001` for Android emulator → host machine).
- **Real device:** Use your ngrok URL (e.g. `https://xxxx.ngrok-free.app`) and the same in **Google Cloud Console** redirect URIs and in **cloud-backend/credentials.json** `redirect_uris`.
- In the app, open **Edit Cloud** and confirm the base URL matches (or leave default from `local.properties`).

### 3.2 Login (Google OAuth)

1. Open the app → go to **Stream & Clips** (or the screen with “Connect Google Drive”).
2. Tap **Connect Google Drive**.
3. Browser should open; sign in with Google and allow access.
4. You should be redirected back to the app and see a toast like “Google Drive connected as your@gmail.com”.
5. **Check:** The same screen should show “Drive: logged in as your@gmail.com”.

**If redirect fails:** Confirm redirect URI in Google Cloud Console and in `credentials.json` exactly matches the URL the browser is sent to (e.g. `https://your-ngrok/auth/google/callback`).

### 3.3 Auth-only requests (after login)

1. Stay on **Stream & Clips** (logged in).
2. **Check:** “Drive: logged in as …” is visible.
3. Tap **Log out**.
4. **Check:** The Drive line disappears and you can log in again.

### 3.4 Load clips (private data)

1. Log in with **Connect Google Drive** (see 3.2).
2. Go to **Watch saved clips** (or the section with “Load Clips from Drive”).
3. **Check:** You see “Load Clips from Drive” enabled (not “Sign in with Google Drive to view your clips”).
4. Tap **Load Clips from Drive**.
5. **Check:** Either a list of your clips appears or “Loaded 0 events” (no errors). No 401/403 in the message.
6. If you have clips: **Check** thumbnails load and **Play** opens the video (URL includes token for backend).

### 3.5 Not logged in

1. Log out (or clear app data / reinstall so there is no stored token).
2. Open **Watch saved clips**.
3. **Check:** Message “Sign in with Google Drive to view your clips.” and **Load Clips from Drive** is disabled.
4. **Check:** Tapping Load does nothing (button disabled).

### 3.6 Device linking (optional)

If you use Pi uploads and device linking:

1. Log in in the app.
2. Call **POST /api/devices/link** with your backend auth token and body `{ "deviceId": "your-pi-device-id" }` (e.g. with curl or Postman).
3. Upload a clip from the Pi with that `deviceId`.
4. **Check:** In the app, after “Load Clips from Drive”, the new clip appears under your account.

---

## 4. Quick checklist before push

- [ ] `cd cloud-backend && npm test` — all tests pass.
- [ ] Backend starts: `npm start` (MongoDB up).
- [ ] Smoke test: `./scripts/smoke-test.sh http://localhost:3001` passes.
- [ ] Frontend: Login with Google → see “logged in as …”.
- [ ] Frontend: Logout → Drive line disappears.
- [ ] Frontend: When logged in, “Load Clips from Drive” works (list or 0 events, no 401).
- [ ] Frontend: When not logged in, clips section shows sign-in message and Load is disabled.

---

## 5. Troubleshooting

| Issue | What to check |
|-------|----------------|
| 401 on /api/events or /api/auth/me | App must send `Authorization: Bearer <token>`. Token is stored after OAuth redirect; if you never completed “Connect Google Drive” or cleared data, token is missing. |
| redirect_uri_mismatch | Redirect URI in Google Console and in `credentials.json` must match the URL used for the callback (scheme, host, path `/auth/google/callback`). |
| No clips / empty list | Events are per-user; only events with `ownerEmail` matching your logged-in email are returned. New uploads from Pi need device linking so `ownerEmail` is set. |
| Thumbnails or Play don’t load | Clip/thumbnail URLs must include `?token=...` (app adds this when logged in). If you open the same URL in a browser without the token, backend returns 401. |

# Integration summary: main + feature/frontend-auth

This doc describes what was merged from `main` into `feature/frontend-auth`, how it was integrated, and what is still missing or recommended.

---

## What came from main

- **HLS livestream**: Pi pushes segments to cloud; backend stores them in S3 and serves playlists.
  - `POST /api/stream/segment` — Pi uploads `.ts` segments.
  - `GET /api/stream/playlist/:deviceId` — returns HLS m3u8 with presigned S3 URLs.
  - `GET /api/stream/status/:deviceId` — stream liveness check.
- **S3 for event clips**: Event uploads (video + thumbnail) go to S3, not Google Drive.
  - `Event` model: `s3Key`, `thumbnailS3Key` (and existing fields).
  - `POST /api/events/upload` — uploads file to S3, creates/updates Event in MongoDB.
  - Clips/thumbnails served via presigned S3 URLs (redirect).
- **New/updated files**: `cloud-backend/hlsCache.js`, `cloud-backend/s3Client.js`, `cloud-backend/lifecycle.json`; `ESP32PairingApp/.../clips/HlsPlayerView.kt`; OTP/pairing changes in app.

---

## How it was integrated with auth

- **Auth and multi-user** (from feature/frontend-auth) are kept:
  - **Backend**: `auth.js` (Bearer token store), `requireAuth` / `requireAuthOrQueryToken`, per-user Google tokens in `googleAuth.js`, `Device` model and `POST /api/devices/link`, `Event.ownerEmail`.
  - **App**: Token and email stored after OAuth; `Authorization: Bearer` (or `?token=`) on cloud requests; clips/events only when logged in.
- **Event upload** (`POST /api/events/upload`):
  - Still uses **S3** (main’s flow): upload to S3, create/update Event with `s3Key` / `thumbnailS3Key`.
  - **Added**: Device lookup to set `ownerEmail` on the created/updated Event (from `Device` collection).
- **GET /api/events**:
  - **Auth**: `requireAuth`.
  - **Filter**: `Event.find({ ownerEmail: req.user.email })`.
  - **Response**: Same shape as main (`_id`, `id`, `deviceId`, `filename`, `createdAt`, `timestamp`, `status`, `hasVideo`, `hasThumbnail`).
- **GET /api/clips/:eventId** and **GET /api/clips/:eventId/thumbnail**:
  - **Auth**: `requireAuthOrQueryToken` (header or `?token=`).
  - **Access**: Only if `event.ownerEmail` is missing or equals `req.user.email`.
  - **Behavior**: Unchanged from main — redirect to presigned S3 URL.
- **Google Drive**: No longer used for **event clip storage**. OAuth is still used for **login only** (email + backend-issued Bearer token). Per-user Google tokens remain in `googleAuth.js` for possible future use (e.g. Drive export).

---

## What’s missing or optional

1. **Device linking in the app**  
   Backend has `POST /api/devices/link` (auth required, body `{ deviceId }`). The Android app does not yet call it. So Pi uploads have no linked user and `ownerEmail` is only set if you link the device via another client (e.g. curl/Postman). **Todo**: In the app, add a way to “link this device” (e.g. on Stream/Setup) that calls `/api/devices/link` with the Pi’s device ID and the current auth token.

2. **Events without owner**  
   Events created before linking (or without a linked device) have no `ownerEmail`. They are excluded from `GET /api/events` (filter is `ownerEmail: req.user.email`). So old or unlinked events won’t show in the app until you either backfill `ownerEmail` or add a separate “unassigned” flow. **Optional**: Backfill script or admin endpoint to set `ownerEmail` for existing events by deviceId.

3. **HLS stream auth**  
   `GET /api/stream/playlist/:deviceId` and `GET /api/stream/status/:deviceId` are **not** protected. Anyone with the deviceId can get the playlist. If you want stream access to be per-user, add `requireAuth` or `requireAuthOrQueryToken` and optionally restrict by linked device.

4. **S3 and env**  
   Main’s backend expects S3 (and possibly env vars for AWS). Ensure `s3Client.js` is configured (e.g. bucket, region, credentials) and that the app’s cloud URL points at this backend. See main’s docs or `.env.example` if present.

5. **driveUploader and Google Drive**  
   `driveUploader.js` and Drive-based clip serving were removed from the **merged** server (clips are S3-only). The file `driveUploader.js` still exists and is unchanged from our branch; it’s simply not imported in `server.js`. If you want to support **both** S3 and Drive (e.g. some events from S3, some from Drive), you’d need to extend the Event model and the clip/thumbnail routes to handle both (e.g. `s3Key` vs `driveFileId`).

6. **TESTING.md and new files**  
   `TESTING.md`, `cloud-backend/auth.js`, `cloud-backend/models/Device.js`, `cloud-backend/scripts/`, `cloud-backend/tests/` are currently untracked. Add and commit them if you want them in the repo.

---

## Quick checklist before push

- [ ] Run `cd cloud-backend && npm test` (auth tests pass).
- [ ] Backend starts with MongoDB and S3 (or mocks) configured.
- [ ] In the app: log in with Google → see “logged in as …”; load clips (only your events); log out.
- [ ] Optional: Link a device via `POST /api/devices/link`, then upload from Pi and confirm the new event appears for that user in the app.
- [ ] Optional: Test HLS stream in the app (playlist + status endpoints).

---

## File-level summary

| Area | From main | From feature/frontend-auth | Resolved / notes |
|------|-----------|----------------------------|-------------------|
| **server.js** | S3 upload, HLS routes, S3 clip redirect | Auth middleware, Device, ownerEmail, OAuth callback with token | Merged: S3 + HLS kept; auth and ownerEmail added to events and clip/thumbnail routes. |
| **Event model** | s3Key, thumbnailS3Key | ownerEmail | Already merged (ownerEmail + S3 fields). |
| **MainActivity.kt** | HLS, aspectRatio, stream state | rememberScrollState, driveAccountEmail | Both kept. |
| **ApiConfig.kt** | STREAM_PLAYLIST, STREAM_STATUS, getStreamPlaylistUrl, getStreamStatusUrl | (none conflicting) | Auto-merged. |
| **rasberry_pi_app/backend/package-lock.json** | (main version) | (stash version) | Conflict resolved using main’s version. |

