# Home Security — React Native (Expo)

Mobile client framework for the Home Security stack. Mirrors the main flows from `ESP32PairingApp` against `cloud-backend` (port 3001) and the Pi backend (port 4000).

## Stack

- Expo SDK 57 + Expo Router (file-based navigation)
- TypeScript
- Secure session storage (`expo-secure-store` / AsyncStorage on web)

## App map

| Area | Route | Notes |
|------|--------|--------|
| Live stream | `(tabs)/index` | Pi start/stop/motion + cloud status stubs |
| Clips | `(tabs)/clips` | `GET /api/events` + thumbnail URLs |
| Setup | `(tabs)/setup` | Device link stub; ESP32 SoftAP/BLE TBD |
| Settings | `(tabs)/settings` | Cloud URL + account |
| Sign in | `/login` | Token paste until OAuth deep links are wired |

## Framework layout

```
mobile/
  app/                 # Expo Router screens
  components/ui/       # Shared UI primitives
  context/             # AuthProvider
  lib/api.ts           # cloudApi + piApi clients
  lib/config.ts        # Default backend URLs
  lib/storage.ts       # Session + URL persistence
  types/               # Shared TypeScript types
```

## Run

```bash
cd mobile
npm start
# then press i / a / w, or:
npm run ios
npm run android
```

Optional env overrides (create `mobile/.env`):

```
EXPO_PUBLIC_CLOUD_URL=https://your-ngrok.ngrok-free.app
EXPO_PUBLIC_PI_URL=http://192.168.x.x:4000
```

### Device URL tips

- **Android emulator → host:** `http://10.0.2.2:3001`
- **iOS simulator → host:** `http://localhost:3001`
- **Physical device:** LAN IP or ngrok (same URL as Google OAuth redirect / `credentials.json`)

## Next wiring targets

1. Complete Google OAuth via `homesecurity://` deep link after `/auth/google/callback`
2. HLS player for `cloudApi.playlistUrl(deviceId, token)`
3. Port ESP32 SoftAP / BLE pairing from `ESP32PairingApp`
4. Clip video playback using `cloudApi.clipUrl(eventId, token)`
