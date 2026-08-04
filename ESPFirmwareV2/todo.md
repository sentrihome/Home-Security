# Home Security System — Implementation TODO

Companion to `architecture.md`. This is an *ordering* document — it tells you what to do first, second, third, and why, based on what blocks what. Section references (§N) point to `architecture.md`.

**Rule of thumb used throughout: resolve a design decision before writing code against it.** Several phases below start with "decide X" specifically because building against an undecided spec is the fastest way to end up rewriting firmware.

---

## Phase 0 — Close the remaining blocking decisions

Nothing in Phase 1+ should start until these are answered — they change API shapes, hardware BOM, and firmware structure, so getting them late is expensive.

- [ ] **§16 — Pi↔S3 transport.** Pick static IP / mDNS / hybrid. This is the single highest-priority open item in the doc (§22 #1) and blocks: PSK backup, the PIN-set flow, and the entire motion-alert pipeline.

- [ ] **§9/§20 — does arm/disarm state reach individual sensors, or is gating centralized?** Answer before finalizing the UART command set (§9) or sensor firmware's power model. (§22 #2)

- [ ] **§13 — PSK backup auth.** Confirm whether the planned "paired device token" also authenticates the PSK backup push, or if that needs its own scheme. (§22 #3)

- [ ] **Re-provisioning vs. factory reset UX** — explicitly deferred (TBD) in the doc; fine to punt, but note it so nobody assumes it's designed. (§22 #4)

**Exit criteria for Phase 0:** §16's transport is chosen and written up, and the sensor arm-state question has an answer. Everything else in Phase 0 can trail into Phase 1 without blocking hardware work.

---

## Phase 1 — ESP32 firmware: provisioning core

Build the part of the system that has zero external dependencies (no Pi, no app, no cloud) — just the two console-side ESP32s talking to each other and to a phone.

1. [x] Implement the UART frame format (§9): `SYNC | CMD | LEN | PAYLOAD | CRC`. Write this before any of the commands that use it — get framing, checksum validation, and buffer-split handling solid first, since a bug here silently corrupts every message type built on top of it.

2. [ ] Implement the confirmed command set (§9): home WiFi creds, connection result, sensor event relay, status/heartbeat. Leave the two Phase-0-dependent commands (motion-relay tagging, arm/disarm-to-sensor) until Phase 0 lands.
   - [x] `MOBILE_PAIRING` — cmd_s enum, dispatch switch, frame send/receive with CMD param, async response queue (esp2)
   - [ ] `CONNECTION_RESULT` — S3 → WROOM WiFi join ack
   - [ ] `SENSOR_EVENT` — WROOM → S3 ongoing telemetry
   - [ ] `STATUS_HEARTBEAT` — S3 → WROOM liveness ping

3. [ ] Implement per-unit setup AP credential derivation (§6): `HMAC(batch_secret, MAC_address)`, or hardcode batch-unique creds as an MVP fallback. Get the label/QR generation pipeline working in parallel — manufacturing will need it before units ship regardless of firmware readiness.

4. [ ] Implement the console provisioning flow end-to-end (§4): phone → WROOM setup AP → UART → S3 → home WiFi join → PSK generation → PSK back to phone.

5. [ ] Implement failure handling (§8): reason-code-based error surfacing, retry cap, physical-button re-entry to setup mode. Don't treat this as polish — it's the difference between a returnable product and a support-ticket generator.

6. [ ] Implement credential storage per §7's table exactly: home WiFi creds and disarm PIN both live in S3 NVS only; sensor PSK and `sensor_key`s live in WROOM NVS. Double-check nothing leaks into the wrong device's flash.

**Test against:** the pairing/provisioning steps in §4 and the failure table in §8, manually, before writing any automated test harness — you want to feel the actual UX friction first.

---

## Phase 2 — Sensor pairing and network

1. [ ] Implement sensor-side setup AP with the same per-unit credential derivation as Phase 1 step 3.

2. [ ] Implement the pairing flow (§5): phone → sensor setup AP → SSID+PSK handoff → sensor joins WROOM AP as station → `sensor_key` handshake → WROOM marks paired.

3. [ ] Implement the 10-sensor SoftAP cap check and the "AP at capacity" UX prompt (§5, §22 #8 — UX detail still open, but the cap check itself isn't).

4. [ ] Implement reboot/reconnect behavior (§12): WROOM NVS-persisted AP credentials on reboot, sensor MAC-based reconnect with exponential backoff, **no AP-mode fallback** — this last one is a deliberate security decision (D12), don't "fix" it later without revisiting that call.

5. [ ] Implement the bounded sensor-event buffer on the WROOM (§12) — cap it, drop-oldest on overflow, and actually test the overflow path, not just the happy path.

**Test against:** pair 10 sensors, reboot the console mid-operation, reboot a sensor mid-operation, and confirm no sensor requires re-pairing after either reboot.

---

## Phase 3 — Pi baseline (SoftAP shipping; hub barebones in tree)

Per D20 / README §13: SoftAP is the boot gate; `pi_hub` is one Flask process after home Wi‑Fi (live + clips + Drive stubs). Old Node `rasberry_pi_app` is **not** the product path.

- [x] SoftAP wizard + static IP + boot handoff → `pi_hub` (`rasberry-pi-setup/`)
- [ ] Confirm the Pi setup flow matches §13's test protocol — run it fresh after deploy.
- [ ] Confirm Pi initializes **before** console provisioning in the app onboarding UI (§4, §13).
- [ ] Implement Tailscale install/pairing instructions and verify MagicDNS/`100.x` (§13 test 13.4).
- [ ] Fill in real ffmpeg HLS (`pi_hub.live`) and Drive upload (`pi_hub.drive`) — stubs exist.
- [ ] Build the "paired device token" API auth (§13 step 6) — dependency for PSK-backup-auth.

---

## Phase 4 — Pi ↔ S3 link (the big one)

This is gated entirely on Phase 0's transport decision. Once that's made:

1. [ ] Implement the chosen discovery/transport mechanism (§16).

2. [ ] Implement auth on this link — reuse the Phase 3 paired-device-token mechanism rather than building a second scheme (§16, §22 #1).

3. [ ] Implement the PIN-set flow (§20): `Phone App → Pi → Console S3`, PIN stored in S3 NVS, acknowledgment back through the same path.

4. [ ] Implement the motion-alert relay: `Sensor → WROOM → S3 (UART) → Pi (§16) → FCM/ntfy` (§19, §20).

5. [ ] Implement the PSK backup push: WROOM generates PSK → UART to S3 → S3 pushes to Pi (§11) — note the direction, S3 is the only thing that can reach the Pi, not the WROOM.

6. [ ] **Latency-test the full alert chain end to end against the ≤15s budget (§14, §16)** before considering this phase done. Test each hop's latency individually too — if the budget is blown, you need to know which hop is the problem, not just that the total is over.

**This phase is also where the Phase 0 sensor-arm-state decision gets implemented** — whichever answer you picked (sensor-side gating vs. centralized gating at the S3/Pi) gets built here.

---

## Phase 5 — Arm / disarm

Can start in parallel with Phase 4 once the PIN-set flow (Phase 4 step 3) exists, since disarm validation depends on the PIN already being in S3 NVS.

1. [ ] Implement console keypad hardware + firmware input handling (§2, §20).

2. [ ] Implement local PIN validation on the S3 (§20) — confirmed to be fast/local, not round-tripped through the Pi.

3. [ ] Implement arm (no PIN) and disarm (PIN required) from both the app and the console (§20).

4. [ ] Implement the app-side arm/disarm UI, wired through the Pi to the S3 via the Phase 4 link.

5. [ ] Confirm no entry/exit delay is implemented anywhere (§20) — i.e., don't accidentally build a grace-period feature nobody asked for.

6. [ ] Confirm disarmed-state sensors produce **no relay and no logging** (§20) — test this explicitly, since "no logging" is an easy thing to get wrong by default (most systems log everything unless told not to).

---

## Phase 6 — Alerts (FCM / ntfy)

Mostly Storyboard-side work; cross-check against §14.

- [ ] Android: Firebase project, `google-services.json`, `expo-notifications` in a dev/prod build (**not** Expo Go — confirmed unreliable, D-level decision).

- [ ] iOS: generate and store the high-entropy ntfy.sh topic; surface it once in app Settings; document the ntfy iOS app subscribe step for v1.

- [ ] Wire both to the Phase 4 motion-relay pipeline.

- [ ] Test against §14's failure modes explicitly (revoked FCM token, notifications disabled in OS, topic never subscribed) — these are easy to skip in a happy-path demo and then discover in the field.

---

## Phase 7 — Live view (Tailscale)

- [ ] Implement Pi-side HLS streaming endpoint (if not already built) and app-side player.

- [ ] Implement Pi base URL resolution: Tailscale host when off-LAN, saved LAN IP otherwise (§15).

- [ ] Implement stream start/stop tied to the Live screen's foreground/background state — confirm no persistent streaming when the app isn't actively open (§15, D5's "no persistent connection" principle applies here too).

- [ ] Test the Tailscale-off failure mode explicitly (§15 test 4.4) — clear error, not an infinite spinner.

---

## Phase 8 — Clips (Drive)

- [ ] Implement Google OAuth in the app (`access_type=offline`, `drive.file` scope) and the token handoff to the Pi (§18) — LAN/Tailscale only, encrypted at rest on the Pi, never logged.

- [ ] Implement Pi-side cache-then-upload pipeline (§17).

- [ ] Implement app-side clip listing/playback directly from Drive (not via Tailscale — confirmed this path must work on cellular with Tailscale off).

- [ ] Implement revoke/re-auth UX for when uploads start failing loudly (§17, §18).

- [ ] **Decide and implement clip retention policy** (§22 #9 — currently unspecified) before this ships, or the Pi's local storage will fill up silently.

---

## Phase 9 — Integration testing

Run these only after Phases 1–8 are individually working — this phase is about the seams between them, not re-testing each phase in isolation.

- [ ] Full onboarding: unbox → Pi setup → console setup → sensor pairing → arm → trigger a sensor → confirm push notification lands within budget → disarm via app → disarm via console keypad.

- [ ] Full outage scenarios: kill the Pi mid-operation (does the console still locally disarm via keypad? per §20, it should), kill home internet (per §22 #11, this is an **undesigned** gap — expect this test to fail until that item is picked up), kill Tailscale while away (live should fail cleanly, clips should still work).

- [ ] Multi-sensor stress: pair all 10 sensors, trigger several in quick succession, confirm the WROOM's bounded event buffer (§12) doesn't drop or corrupt anything under load.

- [ ] Reboot matrix: reboot each device (Pi, S3, WROOM, individual sensors) independently and in combination, confirm the system recovers per §12's documented behavior in each case.

---

## Phase 10 — Manufacturing / physical

Can run in parallel with software phases once Phase 1 step 3's credential derivation is finalized — this doesn't block or get blocked by most software work, but needs to be ready before the first physical batch ships.

- [ ] Label/QR printing pipeline for setup AP credentials — confirm it's placed inside packaging or under a peel-back sticker, never on the outer box (§23).

- [ ] Enclosure design sign-off confirming the UART lines aren't exposed via any accessible debug header (§23) — this is a stated trust assumption in the security model (D18), not just a nice-to-have.

- [ ] Confirm keypad hardware spec (§2, §20) — including whether it has any dedicated audio output, since that's still a small open question even though no beep hardware is planned for v1.

---

## Explicitly not in this TODO (post-launch roadmap — §21)

Don't let these creep into v1 scope:

- Bluetooth speaker pairing as a local siren
- Camera-based motion detection
- Partial/zone arming ("stay" vs. "away" modes)
- Auto-arm/auto-disarm via schedule or geofencing
- OTA update mechanism (§22 #7 — needed before wide field deployment, but not for a first working unit)

---

## Known gaps this TODO can't resolve for you

These are documented as open in `architecture.md` §22 and don't have an implementation path yet because the design isn't finished:

- Internet-outage alert fallback (item 11) — if home internet is down, there is currently **no alert path at all**. Worth deciding whether this blocks v1 launch or ships as a known limitation.
- Tamper detection, multi-user/multi-phone pairing, general event history/log, full Pi API auth coverage (item 11) — none of these have a phase above because none have a design yet. Route them through Phase 0-style design work before they get their own implementation phase.