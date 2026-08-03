# Backend URL configuration

The app’s **default** Cloud and Pi backend URLs can be changed in two ways (runtime overrides still work via “Edit Cloud” / “Edit Pi” in the app).

## 1. `local.properties` (recommended)

In the project root, create or edit **`local.properties`** (this file is gitignored):

```properties
# Cloud backend (port 3001). Used when user has not set "Edit Cloud" in the app.
cloud.base.url=http://192.168.1.50:3001

# Pi backend (port 4000). Used when user has not set "Edit Pi" in the app.
pi.base.url=http://192.168.1.73:4000
```

Path: **`ESP32PairingApp/local.properties`** (same directory as `build.gradle.kts`’s root, i.e. project root for the app).

- If `local.properties` doesn’t exist, copy from `local.properties.example` if present, or create it with the lines above.
- Replace the host/port with your Cloud and Pi server addresses.

## 2. Environment variables at build time

When building from the command line you can override without editing files:

```bash
export CLOUD_BASE_URL=http://192.168.1.50:3001
export PI_BASE_URL=http://192.168.1.73:4000
./gradlew assembleDebug
```

These are read in **`app/build.gradle.kts`** in `defaultConfig`; `local.properties` takes precedence over env vars.

## Where it’s used in code

- **Build:** `ESP32PairingApp/app/build.gradle.kts` — defines `BuildConfig.CLOUD_BASE_URL_DEFAULT` and `BuildConfig.PI_BASE_URL_DEFAULT`.
- **App:** `app/src/main/java/.../network/ApiConfig.kt` — uses those BuildConfig values as defaults; user overrides from “Edit Cloud” / “Edit Pi” still apply at runtime.
