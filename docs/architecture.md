# Blink Web — Architecture & Visual Composition

## 1. System Overview

Blink Web is a unified React application delivering two interconnected experiences within a single codebase:
1. **Blink Device Experience**: A living digital character with glowing cyan eyes communicating states and expressions.
2. **Blink Insights Experience**: A mobile-first companion dashboard providing telemetry, health scores, and remote controls.

Both experiences consume state from shared contracts and communicate in real time via Firebase and local fallback services.

```
                      ┌──────────────────────────────────────┐
                      │             Blink Web App            │
                      └──────────────────┬───────────────────┘
                                         │
                 ┌───────────────────────┼───────────────────────┐
                 ▼                       ▼                       ▼
           /demo (Desktop)        /device (Phone 1)      /insights (Phone 2)
        ┌───────────────────┐    ┌───────────────────┐  ┌───────────────────┐
        │ [Device] [Insights]│    │ Landscape Display │  │ Portrait Dashboard│
        │ Bezel + WebGL Eyes│    │ WebGL Eyes ONLY   │  │ Controls & Telemetry
        └───────────────────┘    └───────────────────┘  └───────────────────┘
                 │                       │                       │
                 └───────────────────────┼───────────────────────┘
                                         │
                                         ▼
                     ┌───────────────────────────────────────┐
                     │    Shared Contracts & Realtime Bus    │
                     │  (Firebase RTDB / Firestore / Mock)   │
                     └───────────────────────────────────────┘
```

---

## 2. Locked Visual Architecture Decision

### Desktop Integrated Demo (`/demo`)
The visual representation follows a strict 3-layer composition:
- **Layer 1 (Base)**: Solid pitch-black background (`#080A0C`).
- **Layer 2 (Canvas)**: WebGL Canvas rendering glowing cyan eyes with natural eye-spacing, signed distance field (SDF) or shader glow, and blinking animation.
- **Layer 3 (Foreground Overlap)**: Static 2D raster/SVG image representing the physical bezel with a transparent screen opening.

**Strict Constraints:**
- Do NOT model the bezel using Three.js geometry.
- Do NOT recreate the bezel with CSS gradients or procedural geometry.
- The bezel image must have a transparent center cutout (`mask` or PNG alpha).
- The animated eyes sit behind the bezel image.
- Both layers scale proportionally inside a fixed 16:10 or 16:9 container.

### Standalone Phone Device (`/device`)
- Fullscreen landscape orientation.
- Black background (`#000000`).
- The bezel image is **completely hidden**.
- The WebGL eye renderer expands to fill the viewport while preserving eye aspect ratio and normalized spacing.

---

## 3. Directory Layout & Boundaries

```
src/
├── app/                  # Application bootstrap, router, top-level providers
│   ├── App.tsx
│   ├── router.tsx
│   └── providers/
├── pages/                # Route components (DemoPage, DevicePage, InsightsPage, JoinPage)
├── features/
│   ├── blink-device/     # Developer 1 boundary (Eyes, Canvas, Bezel, Shaders)
│   ├── insights/         # Developer 2 boundary (Dashboard, Cards, Controls)
│   └── simulator/        # Shared demo data generator (Blink rates, Fatigue scenarios)
├── shared/
│   ├── contracts/        # Versioned TypeScript schemas (DeviceState, Commands, Telemetry)
│   ├── firebase/         # Firebase initialization, emulator bindings, rule mappings
│   ├── realtime/         # Realtime service abstraction (IRealtimeService)
│   ├── components/       # Reusable UI primitives (Button, Card, Badge, Navbar)
│   ├── hooks/            # Shared React hooks (useFullscreen, useMediaQuery)
│   ├── utils/            # Shared utilities (cn.ts)
│   └── styles/           # CSS tokens and Tailwind globals
├── config/               # Environment variables and configuration
└── main.tsx              # React DOM entry point
```

---

## 4. Realtime Contract Architecture

All components interact with device state through the `IRealtimeService` boundary interface rather than direct Firebase SDK calls:
- **Idempotent Commands**: Each command includes a UUID (`id`), `schemaVersion`, `targetDeviceId`, `createdAt`, and `expiresAt`.
- **State Revision Handling**: Each state transition increments `revision` for conflict detection and reconnect synchronization.
- **Separation of Real & Simulated Telemetry**: Telemetry packets carry `isSimulated: boolean` to clearly distinguish demo data from actual camera sensors.
