# NADA Design System — "Vantage"
> Version 1.0 · Quiet luxury, loud privacy.

---

## Design Philosophy

NADA Vantage is built on four pillars:

1. **Restraint as identity.** One accent gradient. Zero decorative illustrations. Every pixel earns its place.
2. **Anonymity made beautiful.** Privacy isn't an asterisk — it's the hero. Masked identities, ephemeral motion, content that breathes.
3. **Tactile physicality.** Every tap has weight. Spring physics, not linear eases. Momentum, not snapping.
4. **Confident typography.** The words are the product. Type scales with intent; spacing creates silence.

---

## Color System

### Semantic Naming Convention
All tokens use the prefix `--n-` and follow `role[-variant]`.

### Midnight Theme (default dark)

| Token | Hex | RGB | Usage |
|---|---|---|---|
| `--n-base` | `#0A0B12` | `10 11 18` | Page background — cool indigo-black, never pure black |
| `--n-s1` | `#0F1019` | `15 16 25` | Primary surface (cards, panels) |
| `--n-s2` | `#14152100` | `20 21 33` | Elevated surface |
| `--n-s3` | `#1C1E2E` | `28 30 46` | Highest surface (inputs, tooltips) |
| `--n-s-glass` | `rgba(10,11,18,0.72)` | — | Frosted glass (headers, overlays) |
| `--n-tx-1` | `#E4E6F0` | `228 230 240` | Primary text — warm off-white, not pure white |
| `--n-tx-2` | `#8A91AA` | `138 145 170` | Secondary text — cool mid-grey |
| `--n-tx-3` | `#50566E` | `80 86 110` | Muted text — timestamps, captions |
| `--n-bd` | `rgba(255,255,255,0.06)` | — | Default border |
| `--n-bd-strong` | `rgba(255,255,255,0.10)` | — | Emphasized border |
| `--n-sent-bg` | `#1A1830` | `26 24 48` | Sent bubble — violet-indigo tinted dark |
| `--n-sent-bd` | `rgba(124,110,248,0.16)` | — | Sent bubble border |
| `--n-recv-bg` | `#14152100` | `20 21 33` | Received bubble — neutral dark |
| `--n-recv-bd` | `rgba(255,255,255,0.06)` | — | Received bubble border |

### Accent: Iridescent Gradient
The single signature accent — used **only** for: primary CTA, active/selected states, own message tint, focus rings, and the identity system.

```
--n-accent-start:  #7C3AED  /* electric violet */
--n-accent-mid:    #2563EB  /* deep blue */
--n-accent-end:    #10D98A  /* mint */

--n-accent-gradient: linear-gradient(135deg, #7C3AED 0%, #2563EB 50%, #10D98A 100%)
--n-accent-subtle:   linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(37,99,235,0.10) 50%, rgba(16,217,138,0.10) 100%)
--n-accent-solid:    #7C6EF8  /* single-stop fallback for borders/icons */
```

### Paper Theme (warm light)

| Token | Value |
|---|---|
| `--n-base` | `#F5F2EC` |
| `--n-s1` | `#EDE9E1` |
| `--n-s2` | `#E4DFDA` |
| `--n-s3` | `#D8D2CB` |
| `--n-tx-1` | `#1A1814` |
| `--n-tx-2` | `#6B6258` |
| `--n-tx-3` | `#9C9189` |
| `--n-sent-bg` | `#EDE8FF` |
| `--n-sent-bd` | `rgba(124,58,237,0.20)` |
| `--n-recv-bg` | `#E4DFDA` |

### Aurora Theme (power user)
Midnight base + a slow-moving iridescent ambient background.
CSS: `body::before` animated radial gradient cycling through accent stops over 20s.

### Ghost Mode
When `data-ghost="true"` is applied to `<body>`:
- `filter: saturate(0.15) brightness(0.75)` on all surfaces
- Message text: `filter: blur(4px)` until `:hover` / `:focus` removes it
- Identity orbs: transition to desaturated silhouette
- All accent colors fade to `--n-tx-3`

---

## Typography

### Font Stack

| Role | Font | Fallback | Where Used |
|---|---|---|---|
| Display | `'Inter'` (800–900 weight) | system-ui | Screen titles, thread names, large labels |
| Body | `'Inter'` (400–600 weight) | system-ui | Message text, UI labels, descriptions |
| Mono | `'JetBrains Mono'` | ui-monospace | Timestamps, fingerprints, invite codes, counts |

Inter at high weights with negative tracking reads as "display" without a second font download.

### Type Scale

| Step | Size | Line-height | Tracking | Weight | Usage |
|---|---|---|---|---|---|
| `2xs` | 11px | 1.4 | +0.01em | 500 | Micro labels, status dots |
| `xs` | 12px | 1.45 | +0.005em | 400–500 | Captions, helper text |
| `sm` | 13px | 1.5 | -0.003em | 400–500 | Chat preview text, sub-labels |
| `base` | 14px | 1.55 | -0.006em | 400 | Message body, UI labels |
| `md` | 15px | 1.55 | -0.008em | 400–500 | Primary input, list items |
| `lg` | 17px | 1.45 | -0.012em | 500–600 | Contact names, section titles |
| `xl` | 20px | 1.35 | -0.016em | 600 | Thread header name |
| `2xl` | 24px | 1.25 | -0.020em | 700 | Screen titles |
| `3xl` | 30px | 1.15 | -0.024em | 700–800 | Onboarding display |
| `4xl` | 38px | 1.10 | -0.028em | 800 | Hero numerics |
| `5xl` | 48px | 1.05 | -0.032em | 900 | Splash / lock screen |

Rule: every step below `lg` is `font-feature-settings: "cv11","ss01"` for Inter alternates.

---

## Spacing

4px base grid. All component padding uses multiples of 4.

| Token | px | Tailwind |
|---|---|---|
| `space-0.5` | 2 | `p-0.5` |
| `space-1` | 4 | `p-1` |
| `space-1.5` | 6 | `p-1.5` |
| `space-2` | 8 | `p-2` |
| `space-3` | 12 | `p-3` |
| `space-4` | 16 | `p-4` |
| `space-5` | 20 | `p-5` |
| `space-6` | 24 | `p-6` |
| `space-8` | 32 | `p-8` |
| `space-10` | 40 | `p-10` |
| `space-12` | 48 | `p-12` |
| `space-16` | 64 | `p-16` |

Safe-area insets: `env(safe-area-inset-*)` wrapped as `--sai-top/bottom/left/right`.

---

## Border Radii

| Token | Value | Usage |
|---|---|---|
| `radius-xs` | 4px | Inline badges |
| `radius-sm` | 6px | Tags, pills, small chips |
| `radius-md` | 10px | Buttons (small), inputs |
| `radius-lg` | 14px | Buttons (default), cards |
| `radius-xl` | 18px | Large cards, sheets |
| `radius-2xl` | 24px | Dialogs, drawers |
| `radius-3xl` | 32px | Full-bleed modals |
| `radius-pill` | 9999px | Capsules, composer, orb-nav |
| `radius-orb` | 50% | Identity orbs |
| `bubble-sent` | `22px 22px 6px 22px` | Sent whisper bubble |
| `bubble-recv` | `22px 22px 22px 6px` | Received whisper bubble |
| `bubble-chain` | `22px` | Mid-chain bubble (both radii same) |

---

## Elevation / Shadows

| Level | Value | Usage |
|---|---|---|
| 0 | none | Flat (inline elements) |
| 1 | `0 1px 3px rgb(0 0 0/.40), 0 0 0 1px rgb(255 255 255/.04)` | Cards, list items |
| 2 | `0 4px 16px rgb(0 0 0/.50), 0 0 0 1px rgb(255 255 255/.06)` | Floating composer, dropdowns |
| 3 | `0 12px 40px rgb(0 0 0/.60), 0 0 0 1px rgb(255 255 255/.08)` | Sheets, drawers |
| 4 | `0 24px 80px rgb(0 0 0/.80), 0 0 0 1px rgb(255 255 255/.10)` | Full overlays, call screen |
| accent | `0 0 20px rgb(124 58 237/.25), 0 0 4px rgb(124 58 237/.40)` | Active/focused accent elements |
| orb | `0 0 30px var(--orb-glow)` | Identity orbs |

---

## Motion Tokens

### Spring Configs (Framer Motion)
| Name | Stiffness | Damping | Use |
|---|---|---|---|
| `spring-gentle` | 200 | 26 | Reveals, content slides |
| `spring-default` | 300 | 30 | Standard interactions |
| `spring-snappy` | 500 | 35 | Micro-interactions, buttons |
| `spring-bouncy` | 400 | 18 | Orb nav, call button pulse |
| `spring-modal` | 350 | 32 | Sheets, drawers, modals |

### CSS Easing Aliases
```css
--ease-spring:   cubic-bezier(0.16, 1, 0.3, 1)
--ease-snap:     cubic-bezier(0.87, 0, 0.13, 1)
--ease-in-expo:  cubic-bezier(0.76, 0, 0.24, 1)
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)
```

### Duration Scale
| Token | Value | Usage |
|---|---|---|
| `dur-instant` | 80ms | Button press response |
| `dur-fast` | 150ms | Hover states, micro |
| `dur-normal` | 250ms | Standard transitions |
| `dur-slow` | 400ms | Slides, reveals |
| `dur-glacial` | 800ms | Background drifts, orb morph step |
| `dur-orb` | 8000ms | Full orb blob cycle |

### Key Animations
- `whisper-in`: opacity 0→1 + translateY(4px)→0 + scale(0.97)→1 (receive)
- `bubble-send`: translateY(0)→(-3px)→0 + shimmer sweep on gradient (send)
- `orb-morph`: border-radius 8-value cycling, 8s infinite (identity orb)
- `orb-glow`: box-shadow pulse at 0.6–1.0 opacity, 4s ease-in-out infinite
- `ghost-blur`: text blur 0→4px on ghost mode toggle
- `particle-fade`: opacity 1→0 + scale 1→0.3 + random translate (dissolve)
- `aurora-drift`: background-position cycling on Aurora theme

---

## Z-Index Layers

| Layer | Value | Elements |
|---|---|---|
| `z-base` | 0 | Static content |
| `z-docked` | 10 | Sticky headers, pinned items |
| `z-float` | 20 | Floating composer, FAB |
| `z-dropdown` | 50 | Popovers, menus |
| `z-sticky` | 100 | Thread header |
| `z-overlay` | 200 | Drawers, sheets |
| `z-modal` | 300 | Dialogs, alerts |
| `z-toast` | 400 | Toasts, snackbars |
| `z-tooltip` | 500 | Tooltips |
| `z-orb-nav` | 600 | Floating orb navigator |
| `z-call` | 700 | Call overlays (always on top) |

---

## Signature Visual Elements

### 1. Identity Orb
- Generative gradient blob, seeded deterministically from user ID / public key hash
- 3 hue stops extracted from hash bytes; constant saturation (65–75%), brightness (55–65%)
- CSS `border-radius` 8-value cycling creates organic blob morph over 8s
- Ambient glow: radial box-shadow seeded to orb's dominant color
- Group chat: 2–3 orbs composited as overlapping circles with a subtle blend-mode
- Prop: `seed: string` — all rendering is deterministic, SSR-safe

### 2. Whisper Bubbles
- Asymmetric border-radius (8 independent values via CSS)
- Sent: `22px 22px 6px 22px`, violet-indigo surface tint, gradient left border `2px`
- Received: `22px 22px 22px 6px`, neutral dark surface, hairline border
- Unread/new: `animation: orb-glow` on the bubble's box-shadow for 2s after arrival
- No tails, no skeuomorphic arrows — the asymmetry implies direction

### 3. Liquid Composer
- Single floating capsule anchored to safe-area-bottom
- Text mode: rounded pill, soft surface, voice + attach icons on edges
- Voice mode: capsule widens, text area replaced by live waveform visualization
- Attach tray: capsule grows upward revealing attachment options
- All transitions: Framer Motion `layout` prop + spring physics

### 4. Time Ribbon
- 1px vertical line on the leading edge of the message scroll area
- Date/time markers as small pill labels that slide into view at scroll position changes
- Active position: a 6px orb of accent gradient that moves with scroll
- Doubles as a scrubber: drag to jump through history

### 5. Ghost Mode
- Toggle via settings → privacy → Ghost Mode
- Visual shift: `filter: saturate(0.15) brightness(0.75)` on `[data-ghost="true"]`
- Message text: `filter: blur(4px) on .ghost-blur`, removed on hover/focus
- Header shows fog particle overlay (CSS only, no canvas)
- Accent color fades to greyscale

### 6. Dissolving Timer
- Disappearing message: `counter: 3→2→1` shown as a ring around the bubble
- Final 3 seconds: particle emission CSS animation from bubble bounds
- CSS `@keyframes particle-fade` using `clip-path` and random `translate`

---

## Component Naming Conventions

- **Primitives** (in `packages/ui/src/components/`): PascalCase, single responsibility
- **Feature components** (in `apps/web/src/components/`): Feature-prefixed (e.g. `ChatThreadHero`, `ComposerLiquid`)
- **Variant prop**: always `variant` with CVA
- **Size prop**: always `size` — `xs | sm | md | lg | xl`
- **CSS classes**: BEM-style for non-Tailwind, `n-` prefix (`n-bubble`, `n-orb`, `n-ribbon`)
- **Animation variants**: co-located with component in a `variants` const

---

## API / Prop Contract Changes

The following existing components have **no prop API changes** — only the render/style layer is replaced:
- `ChatHeader` — same props, new render
- `Composer` — same props, new render (liquid capsule replaces static input)
- `ChatListItem2` — same props, new render
- `VoiceNote` — same props, waveform render updated
- `NadaMobileUI` — orb navigator replaces bottom tabs (internal only, no prop change)

One addition: `IdentityOrb` is a new export from `@nada/ui`, used everywhere `Avatar` is used. `Avatar` remains for backwards-compat but renders `IdentityOrb` internally.
