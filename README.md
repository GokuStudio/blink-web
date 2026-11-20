# Blink Web — AI Eye-Health Companion

> Google Startup Buildathon MVP

Blink is an AI-powered eye-health companion that combines an expressive digital device with a companion application for real-time insights, blink-rate monitoring, fatigue nudges, and intelligent assistance.

This repository (`blink-web`) delivers a web-first implementation that works directly through a shareable URL across desktop and mobile browsers, without requiring an Android APK.

---

## 🚀 Quick Start

### Prerequisites
- Node.js `v20+` or `v22+` (Tested on `v26.13.1`)
- npm `v10+` / `v11+`

### Installation
```bash
git clone https://github.com/GokuStudio/blink-web.git
cd blink-web
npm install
```

### Local Development
```bash
# Start Vite development server at http://localhost:3000
npm run dev

# Run TypeScript typechecks
npm run typecheck

# Run smoke and contract tests
npm run test

# Production build
npm run build
```

---

## 📱 Three Application Modes & Routes

| Route | Mode | Target Device & Orientation | Purpose |
| :--- | :--- | :--- | :--- |
| `/` | Redirect | Any | Automatically redirects to `/demo` |
| `/demo` | **Desktop Integrated Demo** | Desktop / Large Screen | Two-panel presentation with physical hardware shell on the left and companion dashboard on the right. |
| `/device` | **Blink Device** | Mobile phone in **Landscape** | Fullscreen black display showing only the animated glowing cyan eyes. Hardware bezel is completely hidden. |
| `/insights` | **Blink Insights** | Mobile phone in **Portrait** | Companion dashboard displaying live blink rate, health scores, and device controls. |
| `/join/:roomCode` | **Device Pairing** | Any mobile device | Pairing interface to assign a phone as either the Device or Companion. |

---

## 🏗️ Architecture & Visual Composition

### Critical Visual Layering (Desktop Integrated Mode)
- **Layer 1**: Black display background (`#080A0C`).
- **Layer 2**: WebGL Canvas rendering animated glowing cyan eyes (`#35DFFF`).
- **Layer 3**: Static image asset representing the physical bezel with a transparent screen opening.

> **Key Rule**: The physical bezel is NEVER rendered via Three.js geometry or procedural gradients. It sits as a static asset on Layer 3 over Layer 2. In standalone phone device mode (`/device`), Layer 3 is omitted entirely.

---

## 👥 Two-Developer Workflow & Ownership

| Developer | Feature Directory | Primary Responsibilities |
| :--- | :--- | :--- |
| **Developer 1** | `src/features/blink-device/` | WebGL eye engine, shaders, expressions, bezel composition, landscape mobile performance. |
| **Developer 2** | `src/features/insights/` | Companion dashboard UI, charts, telemetry widgets, controls, portrait mobile UX. |
| **Shared** | `src/shared/`, `src/app/`, `src/pages/`, `src/features/simulator/`, Firebase rules | Contracts, router, layout, Firebase configuration, simulation engine. Coordinated changes only. |

See [Development Workflow](docs/development-workflow.md) for branch strategy and PR guidelines.

---

## 📚 Documentation Index

- [Architecture & Visual Engine](docs/architecture.md)
- [Design System & Semantic Tokens](docs/design-system.md)
- [Firebase Architecture & Emulators](docs/firebase-setup.md)
- [Two-Developer Workflow & Branching](docs/development-workflow.md)
- [Implementation Milestones (W0-W4)](docs/milestones.md)
- [Agent Operating Instructions](AGENTS.md)

---

## 🛡️ License

Private property of GokuStudio. Prepared for Google Startup Buildathon.
