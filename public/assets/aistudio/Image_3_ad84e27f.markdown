---
name: Obsidian Telemetry
colors:
  surface: '#0f131c'
  surface-dim: '#0f131c'
  surface-bright: '#353942'
  surface-container-lowest: '#0a0e16'
  surface-container-low: '#181c24'
  surface-container: '#1c2028'
  surface-container-high: '#262a33'
  surface-container-highest: '#31353e'
  on-surface: '#dfe2ee'
  on-surface-variant: '#bcc9cd'
  inverse-surface: '#dfe2ee'
  inverse-on-surface: '#2c3039'
  outline: '#869397'
  outline-variant: '#3d494c'
  surface-tint: '#4cd7f6'
  primary: '#4cd7f6'
  on-primary: '#003640'
  primary-container: '#06b6d4'
  on-primary-container: '#00424f'
  inverse-primary: '#00687a'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#ffb95f'
  on-tertiary: '#472a00'
  tertiary-container: '#e79400'
  on-tertiary-container: '#563400'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#acedff'
  primary-fixed-dim: '#4cd7f6'
  on-primary-fixed: '#001f26'
  on-primary-fixed-variant: '#004e5c'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#0f131c'
  on-background: '#dfe2ee'
  surface-variant: '#31353e'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  code-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.02em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: -0.01em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 12px
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-compact: 0.5rem
  margin: 1.5rem
  margin-mobile: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system targets DevOps architects, site reliability engineers, and infrastructure leads navigating complex cloud-native systems. It balances raw command-center utility with a tailored, modern editorial finish.

The aesthetic fuses **Modern Technical Glassmorphism** with **High-Density Developer Ergonomics**:
- Deep obsidian backdrop layers establish depth without blinding glare.
- Luminescent neon accents punctuate mission-critical states, drawing immediate focus to operational anomalies, node load spikes, and cluster health.
- Translucent frosted glass layers provide visual separation without rigid solid planes, allowing dense operational dashboards to feel airy, precise, and responsive.
- Micro-interactions leverage low-latency visual feedback: glowing terminal cursors, pulsating telemetry beacons, and sharp hairline dividers.

## Colors

The color palette is engineered specifically for deep dark mode conditions to minimize visual fatigue during prolonged incident management and active monitoring.

### Core Palette
- **Canvas Base (`#0B0F17`)**: Deep obsidian base for the overall window and primary canvas.
- **Surface Elevation 1 (`#0F172A`)**: Recessed modules, terminal panels, and baseline data containers.
- **Surface Elevation 2 (`#111827`)**: Standard cards, table headers, drawer layouts, and floating toolbars.
- **Surface Elevation 3 (`#1E293B`)**: Interactive elements, active tab fills, hover states, and popovers.

### Functional Neon Accents
- **Primary / Telemetry Active (`#06B6D4` / `#22D3EE`)**: Signifies active connection links, focus indicators, primary action triggers, and running workload instances.
- **Health / Nominal (`#10B981`)**: Nodes responding normally, sub-millisecond latencies, operational pods.
- **Warning / Degraded (`#F59E0B`)**: Memory pressure, pending rollouts, transient ingress bottlenecks.
- **Critical / Destructive (`#EF4444`)**: Container crashloops, kernel panics, revoked access tokens, quota breaches.

### Surface Transparency & Borders
- Semi-transparent fills use `rgba(15, 23, 42, 0.65)` layered with backdrop blurs.
- Borders use `rgba(30, 41, 59, 0.8)` for structural grid divisions, augmented with `rgba(6, 182, 212, 0.3)` glow rings on active or focused states.

## Typography

Typography balances clean natural language legibility with technical precision:

- **Primary Interface (Inter)**: Handles broad navigation, headlines, contextual alerts, and descriptive body copy. Crisp rendering at dense optical sizes prevents blur on multi-monitor high-DPI displays.
- **Telemetry & Infrastructure Data (JetBrains Mono)**: Handles IP addresses, CIDR blocks, SHA hashes, timestamp streams, stack traces, latency counters, and resource quotas. Tabular figures (`tnum`) ensure absolute vertical alignment down high-volume log streams.
- **Labels & Badges**: Standardized on uppercase, slightly letterspaced JetBrains Mono (`label-md` and `label-sm`) to distinguish static metadata keys from active metric values.

## Layout & Spacing

The layout is built for high information density without visual crowding. It employs a responsive 12-column dynamic fluid grid architecture paired with a consistent 4px baseline sub-grid rhythm:

- **Desktop (>= 1280px)**: 12-column grid, 16px gutter, collapsible fixed-width side navigation rail (64px mini / 240px expanded), and a persistent 360px contextual telemetry drawer for active node inspection.
- **Tablet (768px - 1279px)**: 8-column layout, 12px gutters, 16px outer margin. Auxiliary inspector panels reflow into bottom slide-over sheets.
- **Mobile (< 768px)**: 4-column layout, 8px gutters, 12px margins. Complex multi-metric dashboards collapse to single-metric diagnostic card stacks with lateral scroll pagination for sparklines.

## Elevation & Depth

Visual hierarchy uses tonal surface stacking, frosted glass refraction, and ambient neon glow halos instead of muddy drop shadows.

- **Base Floor**: Raw Canvas (`#0B0F17`) with an optional subtle 24px dot-matrix grid at 8% opacity to provide a technical blueprint feel.
- **Mid-Tier (Panels, Terminal Windows, Metrics Cards)**: `background: rgba(15, 23, 42, 0.70); backdrop-filter: blur(12px); border: 1px solid rgba(30, 41, 59, 0.8)`.
- **Top-Tier (Flyouts, Command Palettes, Tooltips)**: `background: rgba(17, 24, 39, 0.90); backdrop-filter: blur(16px); border: 1px solid rgba(51, 65, 85, 0.9)`.
- **Luminescent Proximity Glow**: Focused or alerting nodes cast localized colored halos using double ambient shadows:
  - Cyan Focus: `0 0 0 1px #06B6D4, 0 0 16px rgba(6, 182, 212, 0.25)`
  - Critical Alarm: `0 0 0 1px #EF4444, 0 0 20px rgba(239, 68, 68, 0.3)`
  - Nominal Pulse: `0 0 0 1px #10B981, 0 0 12px rgba(16, 185, 129, 0.2)`

## Shapes

The design system employs a disciplined, industrial corner treatment:

- **Global Baseline**: Soft radius (4px / 0.25rem). Produces crisp, engineering-grade silhouettes that honor the structural rectangularity of rack units and code blocks.
- **Internal Micro-Elements**: Chips, checkboxes, inline code tags, and micro-sparklines adopt 2px–4px radii to avoid soft toy-like visuals.
- **Status Pills**: Pill-shaped ends are strictly reserved for operational status badges (e.g., `HEALTHY`, `STABLE`, `CRASHED`) to instantly signal system state via silhouette differentiation.

## Components

### Buttons
- **Primary**: Solid Electric Cyan (`#06B6D4`) background with `#0B0F17` high-contrast typography, bold 500 weight. Subtle glow on hover (`box-shadow: 0 0 12px rgba(6, 182, 212, 0.4)`).
- **Secondary / Ghost**: `bg-slate-900/60`, border `1px solid rgba(30, 41, 59, 0.8)`, text `slate-200`. Hover state reveals cyan border transition with `bg-slate-800/80`.
- **Destructive**: Hairline border `#EF4444` with transparent background; on hover, fills with `rgba(239, 68, 68, 0.15)` and glows with red aura.

### Cards & Telemetry Panels
- Structured with translucent dark slate surfaces (`rgba(15, 23, 42, 0.65)`), backdrop blur of 12px, and 1px borders using `rgba(30, 41, 59, 0.8)`.
- Card headers incorporate an inline status beacon (6px dot with dynamic CSS ring-pulse animation for active real-time connections).

### Telemetry Sparklines & Micro-Charts
- Zero-margin inline SVG vectors with an electric stroke (`#06B6D4` or `#10B981`) and a 10% opacity vertical gradient falloff to transparent base.
- Hover crosshairs track coordinates snapping along the JetBrains Mono timestamp grid.

### Chips & Health Badges
- Built with `label-sm` monospaced uppercase typography, 4px vertical padding, 8px horizontal padding.
- Semi-transparent tinted backgrounds matching their operational status:
  - Nominal: `bg-emerald-500/10 text-emerald-400 border border-emerald-500/30`
  - Warning: `bg-amber-500/10 text-amber-400 border border-amber-500/30`
  - Critical: `bg-red-500/10 text-red-400 border border-red-500/30`

### Input Fields & Terminal Consoles
- Inputs feature `bg-slate-950/80` sunken inset panels with 1px border `rgba(30, 41, 59, 0.9)`, text in JetBrains Mono. Focus states apply a crisp cyan border with an immediate `0 0 0 1px #06B6D4` ring.
- Embedded terminal panes use pure `#070A0F` backing, custom micro scrollbars (4px wide, `rgba(51, 65, 85, 0.5)` thumb), and syntax highlighting calibrated to match the neon accent system.

### Checkboxes & Radios
- 14px compact square check targets with 2px corner radius. Inactive border `rgba(51, 65, 85, 0.8)`.
- Checked state fills with `#06B6D4` displaying an obsidian `#0B0F17` glyph mark.