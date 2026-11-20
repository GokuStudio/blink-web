# Blink Web — Implementation Milestones (W0-W4)

## Milestone Roadmap

### Phase W0 — Foundation Setup (CURRENT MILESTONE)
- [x] React + TypeScript + Vite project initialization.
- [x] Client-side routing with React Router (`/`, `/demo`, `/device`, `/insights`, `/join/:roomCode`).
- [x] Responsive layout shells for Desktop Integrated, Standalone Device, and Mobile Companion.
- [x] Global design system tokens (Dark industrial palette, `#35DFFF` cyan, `#9AEA3F` lime).
- [x] Basic reusable UI primitives (`Button`, `Card`, `Badge`, `Navbar`).
- [x] Shared TypeScript contracts with schema versioning (`DeviceState`, `DeviceCommand`, `Telemetry`, etc.).
- [x] Firebase scaffolding, emulator configuration, and secure-by-default rules.
- [x] Web App Manifest and minimal PWA shell.
- [x] Smoke tests and contract tests in Vitest.
- [x] Strict `.gitignore` protecting against toolchains and credentials.
- [x] Architecture, workflow, and milestone documentation.

---

### Phase W1 — WebGL Eye Engine & Shaders (Developer 1 Focus)
- Three.js & React Three Fiber setup in `src/features/blink-device/`.
- Custom GLSL signed distance field (SDF) shaders for organic eye shapes.
- Expression state controller (Idle, Happy, Sleepy, Alert, Thinking, Listening, Speaking, Nudging).
- Natural blinking cycle, idle breathing, and gaze tracking.
- Subtle bloom post-processing.
- Mobile GPU context recovery and performance optimization.

---

### Phase W2 — Companion Insights & Dashboard (Developer 2 Focus)
- Responsive mobile dashboard in `src/features/insights/`.
- Apache ECharts integration for blink rate and focus trends.
- Eye fatigue and eye-health score cards.
- Nudge interval configuration and alert preferences.
- Remote control triggers for Blink expressions and demo actions.

---

### Phase W3 — Realtime Firebase Pairing & Synchronization
- Realtime Database room creation and short room codes (`BLINK-XXXX`).
- Multi-device pairing handshake between Device phone and Companion phone.
- Anonymous authentication with presence heartbeat.
- Real-time command synchronization (< 100ms latency).
- Cloud Firestore persistence for completed session logs.

---

### Phase W4 — Simulator, Scenarios & Buildathon Polish
- Repeatable presentation scenarios (Prolonged Stare, Normal Workday, High Fatigue).
- Floating demo presentation toolbar.
- PWA install prompts and fullscreen fallbacks on mobile browsers.
- Production deployment to Firebase Hosting with shareable URL.
