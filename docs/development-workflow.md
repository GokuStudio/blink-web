# Blink Web — Two-Developer Workflow & Collaboration

## 1. Feature Ownership

To prevent merge conflicts and maintain high velocity during the buildathon, ownership of the codebase is partitioned:

```
blink-web/
├── src/
│   ├── features/
│   │   ├── blink-device/    --> DEVELOPER 1 ONLY
│   │   │   ├── components/  (DeviceShell, WebGL Canvas)
│   │   │   ├── renderer/    (Three.js scene, R3F hooks)
│   │   │   ├── shaders/     (Custom eye GLSL shaders)
│   │   │   ├── expressions/ (Expression controllers)
│   │   │   └── state/       (Device-side store adapter)
│   │   │
│   │   ├── insights/        --> DEVELOPER 2 ONLY
│   │   │   ├── components/  (Dashboard UI, QuickStatus)
│   │   │   ├── charts/      (ECharts blink-rate graphs)
│   │   │   ├── screens/     (Historical summaries, controls)
│   │   │   └── state/       (Companion-side store adapter)
│   │   │
│   │   └── simulator/       --> SHARED (Coordinated changes)
│   │
│   ├── shared/              --> SHARED (Review required before change)
│   │   ├── contracts/       (TypeScript definitions)
│   │   ├── firebase/        (Firebase client)
│   │   └── components/      (Design system UI primitives)
│   │
│   └── app/ / pages/        --> SHARED (Integration points)
```

---

## 2. Git Branching Strategy

| Branch | Description | Rule |
| :--- | :--- | :--- |
| `main` | Production-ready integration branch | Locked. Changes only via tested pull requests. |
| `feature/blink-device` | Developer 1 feature branch | Owns `src/features/blink-device/`. |
| `feature/blink-insights` | Developer 2 feature branch | Owns `src/features/insights/`. |
| `feature/realtime` | Joint integration branch | Shared realtime Firebase synchronization. |

### PR Rules
1. Never modify `src/shared/contracts/` without verbal/written agreement from both developers.
2. Run `npm run typecheck` and `npm run test` before committing.
3. Keep commits atomic and descriptive.
4. Verify `.gitignore` before staging. Never stage `.env`, build artifacts, or downloaded JDK/Android files.
