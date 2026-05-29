# NADA — Vantage Design System v1.0

> **"Quiet luxury, loud privacy."**  
> A premium anonymous messaging experience that looks like nothing else on the market.

---

## 1. Philosophy

Vantage is built around one constraint: **restraint is the brand**. Where WhatsApp adds green, Telegram adds blue, and iMessage adds bubbles with tails, Vantage adds silence. The UI disappears; the conversation remains.

Three rules:
1. If you can remove it without losing meaning, remove it.
2. Every color token must earn its place. Only the iridescent accent gradient is allowed to shout.
3. Motion must feel physical — springs, not eases.

---

## 2. Color Tokens

All colors are CSS-variable driven. Raw values are stored as space-separated R G B triplets so Tailwind's `/ <alpha-value>` opacity modifier works natively.

### 2.1 Midnight Theme (default dark)

| Token | CSS Var | Hex | Usage |
|---|---|---|---|
| Base | `--n-base` | `#0A0B12` | Page background — cool indigo-black |
| Surface 1 | `--n-s1` | `#0F1019` | Panels, sidebars |
| Surface 2 | `--n-s2` | `#141521` | Cards, message received bg |
| Surface 3 | `--n-s3` | `#1C1E2E` | Elevated cards, context menus |
| Text Primary | `--n-tx1` | `#E4E6F0` | Body copy, message text |
| Text Secondary | `--n-tx2` | `#8A91AA` | Captions, labels, placeholder |
| Text Muted | `--n-tx3` | `#50566E` | Timestamps, disabled |
| Border | `--n-bd` | `#fff / 6%` | Hairlines (white at low alpha) |
| Border Strong | `--n-bd-strong` | `#fff / 10%` | Focused hairlines |
| Accent | `--n-accent` | `#7C6EF8` | Primary CTA fallback (single flat value) |
| Sent Bubble | `--n-sent-bg` | `#1A1830` | Outbound message background |
| Received Bubble | `--n-recv-bg` | `#141521` | Inbound message background |
| Danger | `--n-danger` | `#FF5967` | Destructive actions |
| Success | `--n-success` | `#10D98A` | Online indicator, E2E badge |
| Warning | `--n-warning` | `#F5D75A` | Expiry timers, caution states |

### 2.2 Paper Theme (warm light)

| Token | Hex | Notes |
|---|---|---|
| Base | `#F5F2EC` | Warm cream — not pure white |
| Surface 1 | `#EDE9E1` | |
| Text Primary | `#1A1814` | Very dark warm-brown |
| Sent Bubble | `#EDE8FF` | Soft violet tint |

### 2.3 Aurora Theme

Same dark tokens as Midnight. Aurora adds an animated `body::before` layer with three radial gradients (violet, blue, mint) on a 20s drift cycle. Enabled via `data-theme="aurora"`.

### 2.4 The Accent Gradient — the single visual signature

```css
linear-gradient(135deg, #7C3AED 0%, #2563EB 50%, #10D98A 100%)
```

**Electric violet → cobalt blue → emerald mint.**  
Used on: primary send button, focus rings, active nav state, identity orb glow, skeleton shimmer, reactions when selected.  
**Never** used as a background fill on any surface larger than a button.

---

## 3. Typography

### 3.1 Type Stack

| Role | Family | Weight | Usage |
|---|---|---|---|
| Display / Headlines | Inter (optical size 28+) | 700–900 | Screen titles, onboarding |
| Body | Inter (optical size 14–20) | 400–600 | Message text, UI labels |
| Monospace | JetBrains Mono | 400–500 | Timestamps, fingerprints, invite codes, E2E labels, counters |

Geist can replace Inter display when available — same metrics, slightly tighter geometric character.

### 3.2 Scale

| Name | Size | Line Height | Tracking | Usage |
|---|---|---|---|---|
| `2xs` | 11px | 1.40 | +0.01em | Badge counts, micro labels |
| `xs` | 12px | 1.45 | +0.005em | Sub-captions |
| `sm` | 13px | 1.50 | -0.003em | List item secondary text |
| `base` | 14px | 1.55 | -0.006em | Message body, UI default |
| `md` | 15px | 1.55 | -0.008em | Composer input, settings rows |
| `lg` | 17px | 1.45 | -0.012em | Section titles |
| `xl` | 20px | 1.35 | -0.016em | Thread name, screen titles |
| `2xl` | 24px | 1.25 | -0.020em | Onboarding headings |
| `3xl` | 30px | 1.15 | -0.024em | Hero numbers |
| `4xl` | 38px | 1.10 | -0.028em | Display |
| `5xl` | 48px | 1.05 | -0.032em | Full-screen hero |

Rule: **negative tracking scales with size**. The larger the type, the tighter the spacing. This is what makes headlines feel like a premium product, not a template.

---

## 4. Spacing Scale

Standard 4px base grid. Exceptions allowed at 2px and 6px for optical alignment.

```
2   4   6   8   10   12   14   16   20   24   28   32   40   48   56   64   80   96
```

Safe area insets exposed as Tailwind spacing tokens:
- `safe-top` → `env(safe-area-inset-top)`
- `safe-bottom` → `env(safe-area-inset-bottom)`

---

## 5. Border Radius

| Token | Value | Usage |
|---|---|---|
| `xs` | 4px | Inline badges, small chips |
| `sm` | 6px | Input fields (inner elements) |
| `md` | 10px | Tooltip, small cards |
| `lg` | 14px | Medium cards |
| `xl` | 18px | Large cards, sheets |
| `2xl` | 24px | Modals |
| `3xl` | 32px | Full-bottom sheet |
| `pill` | 9999px | Capsule buttons, tags |
| `orb` | 50% | Identity orbs (base shape, overridden by morph animation) |
| `bubble-sent` | 22px 22px 6px 22px | Outbound whisper bubble |
| `bubble-recv` | 22px 22px 22px 6px | Inbound whisper bubble |
| `bubble-chain` | 22px | Chained bubble (consecutive from same sender) |

**Why asymmetric bubbles?** The "pinched" corner (6px) subtly indicates message direction without a skeuomorphic tail. The shape is organic enough to feel different from every other messenger, but structured enough to never confuse.

---

## 6. Elevation / Shadow

| Token | Value | Usage |
|---|---|---|
| `e1` | `0 1px 3px #000/40, hairline` | Chat list items, inline cards |
| `e2` | `0 4px 16px #000/50, hairline` | Context menus, popovers |
| `e3` | `0 12px 40px #000/60, hairline` | Bottom sheets, modals |
| `e4` | `0 24px 80px #000/80, hairline` | Call overlays, full-screen |
| `accent` | `0 0 20px violet/25, 0 0 4px violet/40` | Send button, focused orb |
| `accent-lg` | `0 0 40px violet/30, 0 0 8px violet/50` | Call answer button |
| `hairline` | `inset 0 0 0 1px #fff/6%` | Glass panels, surfaces |
| `hairline-strong` | `inset 0 0 0 1px #fff/10%` | Active state glass |
| `ring-accent` | `0 0 0 3px violet/30, 0 0 0 1px violet/60` | Keyboard focus ring |

---

## 7. Motion Tokens

### 7.1 Spring Presets

All Framer Motion transitions use spring physics. No `ease-in`, no `ease-out`, no `linear` — ever.

| Name | Stiffness | Damping | Mass | Usage |
|---|---|---|---|---|
| `gentle` | 200 | 26 | 1 | Message bubbles appearing, sheet slides |
| `default` | 300 | 30 | 1 | Most UI interactions |
| `snappy` | 500 | 35 | 1 | Button taps, icon toggles, send/mic swap |
| `elastic` | 150 | 12 | 1 | Pull-to-refresh rubber band |
| `modal` | 350 | 32 | 1.2 | Modal entrance, call overlay |

### 7.2 Duration Scale (CSS animations — keyframe only, not Framer)

| Token | Duration | Usage |
|---|---|---|
| `instant` | 80ms | Focus ring, hover bg |
| `fast` | 150ms | Chip toggle |
| `normal` | 220ms | Fade, scale-in |
| `slow` | 380ms | Sheet slide-up |
| `ambient` | 8s | Orb morph cycle |
| `aurora` | 20s | Aurora drift |

### 7.3 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .n-orb { animation: none; border-radius: 50%; }
  /* All Framer Motion: duration: 0.01 (instant) via global config */
}
```

---

## 8. Z-Index Layers

```
0    base         — normal document flow
10   docked       — sticky headers while scrolling
20   float        — floating action buttons
50   dropdown     — menus, tooltips anchored to triggers
100  sticky       — persistent top bars
200  header       — chat thread header (above messages)
300  overlay      — sheet backdrops, radial menus
400  modal        — dialogs, incoming call notification
500  toast        — system toasts (above modals)
600  tooltip      — always on top of everything except...
700  orb-nav      — the floating navigator orb
800  call         — full-screen call overlay (top of stack)
```

---

## 9. Signature Components

### 9.1 IdentityOrb

Every user is an animated gradient blob — never initials in a circle, never a generic avatar silhouette.

- **Seed input:** any string (username, public key hash, invite code)
- **Color derivation:** 3 HSL stops using FNV-1a hash + golden-angle distribution (137°). Produces visually distinct, always-saturated palettes.
- **Shape animation:** CSS `border-radius` morphs through 4 keyframe positions on an 8s cycle. GPU-only (no JS).
- **Glow:** `box-shadow` at 50% of orb diameter radius, seeded hue at 70% saturation.
- **Group variant (GroupOrb):** 2 orbs overlap with slight opacity variation; 3 orbs form a triangular cluster.
- **Shared-element transition:** `layoutId={orb-${seed}}` in Framer Motion enables the chat-list → thread header morphing.

### 9.2 Whisper Bubble

Messages are not rectangles with tails.

- **Shape:** Asymmetric border-radius — the corner closest to the "conversation spine" is pinched to 6px; all others are 22px.
- **Sent:** Dark violet-indigo (`#1A1830`) with a subtle iridescent gradient sheen (top-left highlight only, `rgba(124,110,248,0.10) → transparent`).
- **Received:** Neutral dark (`#141521`) with a hairline border.
- **New/unread:** A faint `box-shadow` pulse (glow-pulse animation, 3s cycle) using the accent color.
- **No tails.** Direction is conveyed by position (right/left) and the pinched corner.

### 9.3 Liquid Composer

The message input is a floating capsule that morphs between states:

- **Text mode:** pill-shaped input, Smile + Paperclip on flanks, Mic on right
- **Voice mode:** red waveform bars animate in place of the textarea, a duration counter in JetBrains Mono appears. The capsule doesn't change size — the content inside swaps via `AnimatePresence`.
- **Send state:** Mic swaps to Send with a `scale(0.5) → scale(1)` spring pop.
- **Focus:** The capsule's hairline border brightens and gets a faint accent glow.

### 9.4 Time Ribbon

A `1px` vertical line runs along the left edge of the message area.

- Tick marks align to date/time groups.
- A glowing node (gradient orb, 8px diameter) tracks the scroll position.
- On hover (desktop) or tap (mobile), time labels fade in at each tick. They never clutter the thread at rest.
- Doubles as a scrubber — drag the node to jump to any time in the conversation.

### 9.5 Floating Orb Navigator (mobile)

Replaces the bottom tab bar.

- Single gradient orb (28px) floating at bottom-right, `z-index: 700`.
- Tap: expands into a radial menu (4 items: Chats, Calls, Contacts, Settings) using Framer Motion spring with `staggerChildren`.
- Active item gets an accent glow ring.
- The orb is the user's own identity orb — seeded from their own handle. It's personal, not generic.

---

## 10. Ghost Mode

When `data-ghost="true"` is on the root:

1. Entire UI shifts to `filter: saturate(0.14) brightness(0.76)` — a deliberate "fog".
2. Message text auto-blurs (CSS `blur(6px)`) until hover on desktop or long-press on mobile (`.n-ghost-reveal` class toggles).
3. Avatars/orbs become near-silhouettes (still morphing, just desaturated).
4. A subtle "GHOST MODE" monospace badge appears in the header area.
5. Elements explicitly opted out via `.n-ghost-reveal` bypass the filter.

---

## 11. Before / After Rationale

### What was there: Generic Messenger Clone

The previous aesthetic was indistinguishable from a Telegram/WhatsApp derivative:
- Neon mint (#1ED782) accent — the green that every messaging app uses
- Square-corner → tail-corner speech bubbles with hard direction indicators
- Standard bottom tab navigation with 5 icons
- Initials-in-circle avatars
- Material-style bottom sheets
- No motion beyond basic fade-in

### What Vantage is: Luxury Privacy Product

| Dimension | Before | After |
|---|---|---|
| Color | Neon mint — warm, friendly, generic | Violet-indigo gradient — cool, precise, memorable |
| Bubbles | Rectangles with tails | Asymmetric `border-radius` whisper shapes — no tails, organic |
| Avatars | Initials circles | Generative animated orbs seeded from identity — unique, living |
| Navigation | 5-item bottom tab bar | Single floating identity orb → radial menu |
| Motion | CSS fade transitions | Framer Motion spring physics throughout |
| Composer | Static input bar | Morphing liquid capsule |
| Thread UX | Date dividers | Vertical time ribbon with scroll-tracking node |
| Privacy signal | None | Ghost mode, disappearing timer, E2E badge in JetBrains Mono |
| Typography | System font defaults | Negative tracking at scale, monospace accents on protocol data |

**The single biggest differentiator:** Every user's identity is a living, breathing, generative shape that is uniquely theirs. This transforms "anonymous messaging" from a liability (no face, no name) into a feature — your orb IS your identity. It persists across threads, morphs gently, and has a glow color that belongs only to you.

No other app on the market does this.

---

## 12. API Contracts Changed

No prop contracts were broken. The following components had their internals replaced but their exported interfaces preserved:

| Component | Change |
|---|---|
| `ChatThreadHero` | New internal layout, same `contactSeed`, `contactName`, `ghostMode`, `className` props |
| `IdentityOrb` | Added `label` prop (optional, for aria). All other props unchanged. |
| `GroupOrb` | New component (additive, no breaking change) |
| `GlassPanel` | New component (additive) |
| `GradientText` | New component (additive) |

---

## 13. Dependency Justification

No new heavy dependencies added. All work uses the existing:

| Package | Role |
|---|---|
| `framer-motion` | Spring physics, shared element transitions, AnimatePresence |
| `lucide-react` | All icons |
| `@radix-ui/*` | Dialog, Sheet, Tooltip (accessible primitives) |
| `class-variance-authority` | Component variant management |
| `tailwind-merge` | Safe class composition |
| `wavesurfer.js` | Already in — voice note waveform rendering |

The only candidate for addition would be a canvas-based orb renderer for richer organic shapes (e.g. `@pixi/core`) — but the CSS `border-radius` morph approach is GPU-native and zero-bundle-cost. We can upgrade later.
