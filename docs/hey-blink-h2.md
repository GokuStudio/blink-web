# Hey Blink — Phase H2: Gemini Live Realtime Voice Architecture & Deployment Guide

## 1. Overview

Phase H2 introduces a production-ready, full-duplex **Gemini Live** conversational voice adapter (`GeminiLiveVoiceSession`) that plugs directly into Phase H1's `IVoiceSession` contract without altering H1's approved visual design, state machine, or zero-re-render 60 FPS motion pipeline.

Both providers coexist cleanly:
- **`MockVoiceSession`** (`isSimulated: true`) — Offline deterministic simulation for design, UI, and CI testing without credentials or API cost.
- **`GeminiLiveVoiceSession`** (`isSimulated: false`) — Genuine realtime audio-to-audio streaming via `@google/genai` (`ai.live.connect`), AudioWorklet 16 kHz PCM capture, and AudioWorklet 24 kHz streaming PCM playback.

---

## 2. Model Strategy

| Role | Model ID | Rationale |
| :--- | :--- | :--- |
| **Primary (Default)** | `gemini-3.1-flash-live-preview` | Low-latency native audio-to-audio Live model supporting `ThinkingLevel.MINIMAL` for fast turn-taking, automatic barge-in (`START_OF_ACTIVITY_INTERRUPTS`), 24 kHz native PCM output, session resumption, and context window compression. |
| **Verified Fallback** | `gemini-2.5-flash-native-audio-preview-12-2025` | Proven native audio Live model with affective dialog and sub-second streaming; used only when the primary model returns a model-unavailable error on the configured project. |

- Model selection is controlled **server-side** (`GEMINI_LIVE_MODEL` / `GEMINI_LIVE_FALLBACK_MODEL`) and locked into each ephemeral token via `liveConnectConstraints`.
- The client never silently falls back to `MockVoiceSession` when `GeminiLiveVoiceSession` is selected.

---

## 3. Secure Authentication & Ephemeral Token Architecture

```text
Browser (/hey-blink)
  │  1. POST /mintHeyBlinkLiveToken
  │     Authorization: Bearer <Firebase ID Token>
  │     X-Firebase-AppCheck: <App Check Token> (prod)
  ▼
Trusted Backend (Firebase Cloud Function v2 / Local Dev Token Server)
  │  2. Verifies Firebase Auth ID token + App Check
  │  3. Rejects anonymous users in production (unless dev flag set)
  │  4. Enforces per-user rate limit & concurrent session cap
  │  5. Calls ai.authTokens.create({ uses: 1, expireTime, newSessionExpireTime, liveConnectConstraints })
  │     using GEMINI_API_KEY from Google Cloud Secret Manager
  ▼
Browser receives ONLY { ephemeralToken, model, apiVersion, expiresAt }
  │  6. Opens WebSocket directly to Gemini Live via `@google/genai`
  │     GoogleGenAI({ apiKey: ephemeralToken, httpOptions: { apiVersion } })
  ▼
Gemini Live BidiGenerateContent API
```

**Security invariants:**
- `GEMINI_API_KEY` is **never** placed in React code, `VITE_*` variables, browser bundles, `localStorage`, Firebase RTDB, or Git commits.
- Ephemeral tokens are single-use (`uses: 1`), short-lived (`newSessionExpireTime: +2 min`, `expireTime: +15 min`), and lock the model, voice, and Blink system instruction server-side.
- Ephemeral tokens and user audio are never logged or persisted.

---

## 4. Realtime Audio Pipeline

### Input (Microphone -> Gemini Live)
- Captures user-selected microphone (including USB microphones via `enumerateDevices()` / `deviceId`) only after user activation (`Talk to Blink`).
- Requests browser AEC, noise suppression, and AGC (`echoCancellation`, `noiseSuppression`, `autoGainControl`) to prevent speaker echo self-interruption.
- Processes audio off the main thread in `AudioWorklet` (`blink-pcm-capture-processor`) — zero deprecated `ScriptProcessorNode`.
- Performs continuous phase-accurate linear resampling from hardware native rate (44.1 / 48 kHz) to **16 kHz mono 16-bit signed LE PCM** (`audio/pcm;rate=16000`) in bounded **32 ms** chunks (512 samples = 1024 bytes).
- Muting disables the `MediaStreamTrack`, halts worklet chunk emission, zeroes the input meter, and sends `sendRealtimeInput({ audioStreamEnd: true })`.

### Output (Gemini Live -> Speaker)
- Inspects `inlineData.mimeType` dynamically (`parsePcmMimeType`) rather than hardcoding 24 kHz.
- Decodes 16-bit LE PCM to Float32, resamples to DAC sample rate if needed, and transfers zero-copy to `AudioWorklet` (`blink-pcm-playback-processor`).
- Uses a bounded ring buffer with a **45 ms jitter prebuffer** and generation-ID filtering.
- Computes actual audible DAC RMS energy at ~60 Hz inside the worklet -> feeds `DualChannelAudioMeter.output` -> drives `BlinkVoiceGlow` strictly from audible assistant playback.

### Barge-In (Full-Duplex Interruption)
- Enabled via `ActivityHandling.START_OF_ACTIVITY_INTERRUPTS`.
- On server `interrupted: true` OR manual **Interrupt** tap:
  1. Immediately flushes the playback worklet (2 ms clickless fade-out) and increments `generationId`.
  2. Rejects any late-arriving audio chunks from the old `generationId`.
  3. Zeroes output meter immediately.
  4. Transitions `speaking/thinking -> interrupted -> listening` without closing the WebSocket or microphone.

---

## 5. Running Live Gemini Voice Locally (Safe Dev Setup)

1. **Install dependencies** (already installed in `E:\hey\blink-voice`):
   ```powershell
   cd E:\hey\blink-voice
   npm install
   ```
2. **Start the local loopback-only token server** (reads `GEMINI_API_KEY` from process environment only — never committed or exposed to Vite):
   ```powershell
   $env:GEMINI_API_KEY="YOUR_SERVER_SIDE_GEMINI_API_KEY"
   node scripts/hey-blink-token-dev-server.mjs
   ```
3. **Configure `.env.local`** (gitignored):
   ```env
   VITE_HEY_BLINK_PROVIDER=gemini-live
   VITE_HEY_BLINK_TOKEN_ENDPOINT=http://127.0.0.1:8787/api/hey-blink/token
   ```
4. **Start Vite** and open `http://localhost:3000/hey-blink`:
   ```powershell
   npm run dev
   ```
5. Open the **`DEV`** drawer to select your USB microphone (if multiple mics are attached), inspect real-time latency telemetry, or switch between `Mock (Simulated)` and `Gemini Live`.

---

## 6. Production Deployment Checklist (User-Authorized Only)

Do **not** deploy publicly until every item below is verified by the project owner:

- [ ] **Firebase Blaze Plan & Cloud Functions v2 enabled** on project `blink-web-demo-32e0e`.
- [ ] **Store `GEMINI_API_KEY` in Google Cloud Secret Manager**:
  ```bash
  firebase functions:secrets:set GEMINI_API_KEY --project blink-web-demo-32e0e
  ```
- [ ] **Configure Non-Anonymous Authentication**: Enable Google Sign-In or Email/Password in Firebase Auth (`mintHeyBlinkLiveToken` rejects anonymous users unless `ALLOW_ANONYMOUS_VOICE_DEV=true` is explicitly set).
- [ ] **Enable Firebase App Check** (reCAPTCHA Enterprise / Web) and set `ENFORCE_APP_CHECK=true` on the function environment.
- [ ] **Set Budget Alerts & API Quotas**: Configure Google Cloud Billing budget alerts and Gemini API RPM/TPM limits for project `blink-web-demo-32e0e`.
- [ ] **Scale Rate Limiting (Multi-Instance)**: Replace the per-instance in-memory rate map in `functions/src/heyBlinkToken.ts` with Firestore transactions or Redis/Memorystore before high-traffic public launch.
- [ ] **Configure Production CORS**: Restrict `cors` in `functions/src/heyBlinkToken.ts` to your exact Firebase Hosting origin(s).
- [ ] **Register Functions in `firebase.json` & Deploy**:
  ```bash
  cd functions && npm install && npm run build
  firebase deploy --only functions:mintHeyBlinkLiveToken --project blink-web-demo-32e0e
  ```
- [ ] **Set `VITE_HEY_BLINK_TOKEN_ENDPOINT`** in the production web build environment to the deployed Cloud Function URL.
- [ ] **Verify Model Availability**: Confirm `gemini-3.1-flash-live-preview` (or configured `GEMINI_LIVE_MODEL`) is enabled on the billing account.
