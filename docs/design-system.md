# Blink Web — Design System & Semantic Tokens

## 1. Visual Direction
- **Minimal Industrial Aesthetic**: Premium dark surfaces inspired by high-end consumer hardware.
- **Subtle Depth & Translucency**: Restrained borders (`#272E36`), matte surfaces, and backdrop blur.
- **Targeted Expressive Accents**: Two distinct signature accent colors:
  - **Cyan (`#35DFFF`)**: Reserved for Blink Eyes, eye animations, and device-side hardware state.
  - **Lime Green (`#9AEA3F`)**: Reserved for Companion Insights, health monitoring, positive scores, and actionable controls.

---

## 2. Core Color Palette

| Token | Hex Value | Role / Usage |
| :--- | :--- | :--- |
| `--bg-app` | `#080A0C` | Deep black background for whole application and device screen |
| `--surface-elevated` | `#171A1D` | Standard card and container surface |
| `--surface-hover` | `#22262B` | Hover states on interactive cards and inputs |
| `--border-subtle` | `#272E36` | Subtle structural dividers and card outlines |
| `--accent-lime` | `#9AEA3F` | Insights primary action, high eye-health scores, active toggles |
| `--accent-cyan` | `#35DFFF` | Blink eyes glow, device presence, eye state badges |
| `--text-primary` | `#FFFFFF` | Primary headers and high-contrast labels |
| `--text-muted` | `#94A3B8` | Secondary labels, descriptions, and metadata |

---

## 3. Typography
- **Primary Body Font**: System UI font stack (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, `Helvetica`, `Arial`, sans-serif) for instant loading and crisp mobile rendering.
- **Monospace Font**: System monospaced font for room codes, telemetry numbers, and event IDs.

---

## 4. Hardware Bezel Asset Requirements

The static bezel image sits on Layer 3 of the desktop demo.

### Specifications for Graphic Asset
- **Format**: High-resolution PNG with transparent alpha channel or clean scalable SVG.
- **Aspect Ratio**: 16:10 or 16:9 container.
- **Center Cutout**: The display window must be 100% transparent so that the WebGL eye canvas positioned in Layer 2 is fully visible without tinting.
- **Current Placeholder**: A vector SVG asset with simulated matte chassis and transparent mask is provided at `/assets/bezel/bezel-placeholder.svg`.
