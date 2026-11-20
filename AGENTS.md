# AGENTS.md — Agent Operating Instructions & Repository Guidelines

## 1. Project Context
- **Product**: Blink AI Eye-Health Companion
- **Repository**: `blink-web`
- **Organization**: GokuStudio
- **Directory**: `D:\DineshKumar\blink-web`

---

## 2. Strict Architectural Invariants
1. **Never model the physical bezel in 3D / Three.js**:
   - The bezel is a static 2D image asset on Layer 3 over the WebGL Canvas (Layer 2) in desktop demo mode.
   - In standalone phone device mode (`/device`), the bezel is completely omitted.
2. **Feature Boundaries**:
   - Developer 1 owns `src/features/blink-device/`.
   - Developer 2 owns `src/features/insights/`.
   - `src/shared/contracts/` is locked. Modifications require architectural review.
3. **No toolchains or binary downloads in Git**:
   - Never commit JDK, Gradle, Android SDK, or Node binaries.
   - Maintain strict `.gitignore` rules at all times.
4. **Firebase Security**:
   - Never make database rules publicly open.
   - Do not deploy to production Firebase without explicit user instruction.
5. **Simulated vs Real Data**:
   - Always tag generated telemetry with `isSimulated: true`.
   - Do not present simulated blink rates as medical diagnostic claims.

---

## 3. Verification Commands
Before submitting any task or committing changes, run:
```bash
# 1. Verify TypeScript types
npm run typecheck

# 2. Run unit and smoke tests
npm run test

# 3. Verify production bundle
npm run build
```
All checks must pass with exit code `0`.
