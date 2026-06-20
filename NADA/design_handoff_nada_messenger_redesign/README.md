# Handoff: NADA Encrypted Desktop Messenger Redesign

## Overview

Visual redesign of the desktop UI for **NADA** — an encrypted, anonymous,
peer-to-peer messaging platform. The goal is a premium, native-feeling desktop
messenger that surpasses Telegram in polish and feels purpose-built for
privacy: clean charcoal surfaces, a single mint-green accent, hairline borders,
no clutter.

The redesign covers the desktop split-pane shell: icon rail → chat list →
chat arena (header, messages, composer). Mobile is out of scope.

## About the Design Files

The files in this bundle are **design references created in HTML/JSX** —
working prototypes that show intended look and behavior, not production code
to copy verbatim. The HTML version uses React + Babel + Tailwind via CDN and
mock data; it exists so you can run it in a browser to inspect every state,
hover, and animation.

Your task is to **recreate these designs inside the existing NADA Next.js
codebase** (`apps/web/`) using its established conventions:

- TSX with strict typing
- Tailwind config from `apps/web/tailwind.config.ts`
- Design tokens from `apps/web/app/globals.css` (the `--nada-*` CSS variables)
- `lucide-react` for icons
- `framer-motion` for animations
- `cn` helper from `@nada/ui`

This bundle also contains **four already-converted TSX components** + a CSS
patch (see "Pre-converted Code" below) that have been written against the
real codebase conventions. Those are drop-in ready. The remaining work — the
chat-arena header and the composer — is the part you'll implement, because
each is tightly coupled to ~20 production features and needs careful
preservation.

## Fidelity

**High-fidelity.** Colors, spacing, typography, border radii, animation
timings are final. The HTML prototype is pixel-precise; the TSX components
in `pre_converted/` are typed and match the codebase's prop signatures
exactly. Recreate any remaining JSX using the exact values from the "Design
Tokens" section below.

---

## Screens / Views

The desktop UI is a single, full-bleed three-pane shell. There are no
distinct routes — navigation flips the right panes via state.

### 1. Icon Rail (far-left)

- **Name**: Icon Rail
- **Purpose**: Global nav + brand mark + user identity
- **Layout**: Fixed 68px wide, full height, flex column, `border-right: 1px
  solid rgba(255,255,255,0.05)`, background `#08090B`
- **Components**:
  - **Brand mark** (top): 40×40, `border-radius: 12px`, NADA logo on a green
    accent-gradient with inset white highlight + green glow shadow. Margin-bottom 20px.
  - **Nav buttons** (5): Chats, Status, Groups, Community, Settings
    - 44×44, `border-radius: 12px`, centered icon (Lucide React)
    - Idle: `text-nada-secondary/65`, no background
    - Hover: `bg-white/[0.04]`, `text-nada-primary`
    - Active: `text-nada-accent`, `background: rgb(var(--nada-accent) / 0.10)`
    - Active also gets a 3px wide × 20px tall green pill at `-left-2` with
      `box-shadow: 0 0 12px rgb(var(--nada-accent) / 0.65)`, animated with
      framer-motion `layoutId="rail-active-indicator"`
  - **Tooltip on hover**: Floats `left: calc(100% + 10px)`, 11.5px font,
    surface-elevated bg, hairline border
  - **Unread badge** (Chats button only when `unreadCount > 0`):
    - Position: `-top-0.5 -right-0.5`
    - 16×16 min, mint green bg `#1ED782`, ink black text `#051A11`, font 9px black
    - Ring: `box-shadow: 0 0 0 2px rgb(var(--nada-bg)), 0 0 12px rgb(var(--nada-accent) / 0.55)`
- **Pre-converted**: `pre_converted/IconRail.tsx`

### 2. Chat List Pane

- **Name**: Chat List
- **Purpose**: Browse, search, and switch between chats
- **Layout**: 340px fixed width (in the prototype it's 340px; in the real
  codebase the existing chat-list container already has its width — keep
  whatever is there), flex column, `background: #101113`, hairline right border
- **Components**:
  - **Header** (`padding: 20px 16px 8px`): "Chats" title 20px font-bold + 11px
    mono subtitle "{N} ghosts · all encrypted" + "New chat" pencil icon button
  - **Search field** (`padding: 12px`): Pill input with `IconSearch` left,
    "Secure" pulsing-dot pill right. The pulse dot is `width:7px; height:7px;
    background: var(--nada-accent); box-shadow: 0 0 10px rgb(var(--nada-accent)
    / 0.4); animation: nada-secure-pulse 2.2s ease-in-out infinite`. Pulse
    keyframe: `0%,100%: scale(1) opacity(1); 50%: scale(1.25) opacity(0.55)`.
  - **Filter pills** (All / Unread / Vanish / Groups): 11.5px font-semibold,
    rounded-full. Active = mint bg + ink text + `box-shadow: 0 2px 10px
    var(--accent-glow)`. Idle = `text-nada-secondary/85`, hover `bg-white/[0.04]`.
  - **Section labels** (PINNED / RECENT): 10px font-bold uppercase
    `letter-spacing: 0.12em`, color `text-nada-secondary/55`. Pinned section
    also has a pin icon next to the label.
  - **Chat rows** — see ChatListItem detail below
  - **Footer** (`padding: 12px 16px`, hairline top border): spinner ring +
    "relay: eu-04 · 2 hops" mono text + green "↑ 42 KB/s" right-aligned
- **Pre-converted**: row is `pre_converted/ChatListItem2.tsx` (drop-in for
  existing `ChatListItem`)

#### Chat row (`ChatListItem2.tsx`) — detail

- 42px round avatar (gradient placeholder), online-dot bottom-right (10px
  diameter, mint green, `box-shadow: 0 0 0 2px rgb(var(--nada-bg)), 0 0 10px
  rgb(var(--nada-accent) / 0.65)`)
- Name (14px font-semibold) + verified-key `ShieldCheck` icon 11px mint
- If muted: VolumeX icon. If pinned: rotated Pin icon
- Timestamp: 11px font-mono, right-aligned
- Preview line: 12.5px, truncated. If user is typing: 3 animated mint
  typing dots + "typing…" in mint.
- Unread badge: 18×18 min, mint bg, ink text, 10.5px font-extrabold
- Active state: `nada-row-active` class adds `background: rgb(var(--nada-surface-3) / 0.72)`
  + 3px mint left rail (`::before` pseudo) with mint glow shadow
- Mobile: swipe-to-archive (left swipe reveals mint Archive layer; right swipe
  reveals red Delete layer) — preserved from the existing implementation
- Desktop: on hover, Archive/Trash icons appear in top-right corner of row

### 3. Chat Arena Header

- **Name**: Chat Header
- **Purpose**: Identify the current chat + offer search/call/video/more actions
- **Layout**: Full width of the arena, `min-height: 72px`, `padding: 16px 24px`,
  `background: rgb(var(--nada-bg) / 0.82)`, `backdrop-filter: blur(22px)
  saturate(145%)`, hairline bottom border
- **Components** (left → right):
  - 40px round avatar + online dot (same pattern as chat list)
  - Title 15px font-semibold + verified `ShieldCheck` 12px mint
  - Subtitle 11.5px font-mono, color `text-nada-secondary/65`. Examples:
    "online · end-to-end", "12 members · 3 online", "last seen recently"
  - **Security pill** (right-aligned, before action buttons): rounded-full,
    `background: rgb(var(--nada-accent) / 0.08)`, `border: 1px solid rgb(var(--nada-accent) / 0.20)`,
    contents: `Lock` icon 11px mint + "E2E · CURVE25519" 10.5px font-bold
    uppercase letter-spacing 0.10em
  - **Action buttons** (Search, Phone, Video, MoreVertical): 36×36 round
    ghost buttons, `text-nada-secondary/85`, hover `bg-white/[0.05] text-nada-primary`
- **In existing codebase**: This is *already* implemented at NadaApp.tsx
  ~line 5887. It uses NADA tokens; visually it's ~90% aligned. **DO NOT replace
  it** unless you preserve every feature: search-in-chat dropdown,
  copy-invite, delete-group, view-profile, mute toggle, privacy-shield
  toggle, clear-chat, wallpaper picker, vanish banner, disappearing-timer
  dropdown. The cleaner approach is to make CSS-only nudges to the existing
  JSX to match the prototype exactly.
- **Reference**: `pre_converted/ChatHeader.tsx` (simpler standalone version —
  use as visual spec, not a replacement)

### 4. Vanish Banner (optional, below header)

When the active chat has a disappearing-timer set, render a thin banner above
the messages:

- Background: `linear-gradient(90deg, rgb(var(--nada-accent) / 0.10) 0%, transparent 100%)`
- Border-bottom: `1px solid rgb(var(--nada-accent) / 0.18)`
- Color: `var(--nada-accent)`
- Contents: Ghost icon 13px + "Vanish mode" font-semibold + meta in
  `text-nada-secondary` + "2 messages pending burn" right-aligned

### 5. Messages Area

- **Layout**: Scrollable, `max-width: 760px` centered, `padding: 0 32px`
- **Background**: `chat-bg` class — base `#0C0D10` + two radial ambient mint glows
- **Components**:

#### Date separator pill
- Inline, centered, `padding: 4px 12px`, rounded-full, 10.5px font-semibold
  uppercase letter-spacing 0.10em, color `text-nada-secondary/85`,
  `background: rgb(var(--nada-surface-elevated) / 0.78)`, backdrop blur 10px,
  hairline border

#### Bubble — received
- `background: rgb(var(--nada-surface-elevated) / 0.92)`
- `border: 1px solid rgb(var(--nada-border) / 0.05)`
- `padding: 8px 14px`
- `border-radius: 18px`
- Last bubble in a sequence: `border-bottom-left-radius: 6px` (the tail)
- Text: 14px line-height 1.45, color `text-nada-primary` `#F5F7FA`

#### Bubble — sent
- `background: linear-gradient(150deg, hsl(152 65% 32%) 0%, hsl(152 63% 26%) 100%)`
- `border: 1px solid hsl(152 75% 50% / 0.18)`
- `padding: 8px 14px`
- `border-radius: 18px`
- Last bubble in a sequence: `border-bottom-right-radius: 6px`
- Text: 14px, color `#F2FBF6`
- **Critical**: sent bubbles must NOT touch the right edge of the viewport.
  Enforce `max-width: 68%` of the message-list lane.

#### Reply quote (inside bubble)
- `border-left: 3px solid var(--nada-accent)` (or `rgba(255,255,255,0.92)` inside sent bubble)
- `background: rgba(255,255,255,0.045)` (or `rgba(0,0,0,0.30)` inside sent bubble)
- `border-radius: 6px`, `padding: 6px 10px`
- Sender label: 11.5px font-semibold mint (or white inside sent bubble)
- Preview: 12.5px, color `text-nada-secondary` (or `rgba(255,255,255,0.85)` inside sent bubble)

#### Status ticks (sent bubbles only)
- Bottom-right of bubble, aligned with timestamp
- `IconClock` (sending) → `IconCheck` (sent) → `IconCheckDouble` (delivered) → `IconCheckDouble` mint (read)
- 12-13px, `opacity: 0.65` for non-read, full opacity + mint color for read

#### Reaction chips
- Below bubble, aligned to the bubble's side
- 11.5px, `padding: 2px 8px`, rounded-full, `bg-surface-elevated/88`, hairline border
- Self-reaction: mint-soft bg + mint border + mint text
- Hover: `transform: translateY(-1px)`

#### Voice note bubble
**Already implemented** in `apps/web/src/components/VoiceNote.tsx` and
already uses `--nada-accent` tokens. **Do not rewrite.** It has:
- Round play/pause button on the left, mint gradient bg
- Wavesurfer.js waveform with played/unplayed coloring
- Draggable playhead dot (white for sent, mint for received)
- Speed pill (1× / 1.5× / 2×)
- Duration + status ticks
- Loading/fallback states with synthetic bars

#### File bubble
- 240px min width
- Left: 40×40 rounded-[12px] icon container with `Lock` icon (mint-soft bg
  for received, black/30 for sent)
- Middle: filename 13.5px font-semibold + size + "encrypted vault" mono caption
- Right: 32×32 round download button
- Footer: optional "burns in 5m" ghost-icon + timestamp + ticks

#### Typing indicator
- Received-style bubble shell (tail bottom-left)
- "{name} typing" mono text + 3 animated mint dots (5px diameter, `nada-typing` 1.2s keyframes)

### 6. Composer

- **Layout**: Full arena width, `padding: 12px 24px 20px`, `background:
  linear-gradient(to top, rgb(var(--nada-bg) / 0.98) 0%, rgb(var(--nada-bg) / 0.85) 100%)`,
  backdrop blur 22px, hairline top border
- **Composer shell** (`padding: 8px`, `border-radius: 18px`):
  - `background: rgb(var(--nada-input-bg) / 0.94)`
  - `border: 1px solid rgb(var(--nada-border) / 0.06)`
  - Focus-within: border mint at 0.55 + 4px `box-shadow` ring at 0.10
  - Contents (flex row): Attach (Paperclip 17px) | textarea autosize | Vanish-timer (Timer 16px) | Emoji (Smile 17px) | Send/Mic
- **Send button** (when text non-empty): 36×36 round, mint gradient, ink text, `inset 0 1px 0 rgba(255,255,255,0.25)` + `0 6px 18px var(--accent-glow)`. Hover lifts +1px scale 1.02.
- **Mic button** (when text empty): same shape, ghost text. While recording: `composer-recording` class — solid mint bg, ink text, pulsing ring keyframe `nada-rec-pulse` 1.6s.
- **Hint row** below shell: 10.5px font-mono `text-nada-secondary/55`:
  - Left: "🔒 end-to-end · 👻 vanish 5m · 0 metadata stored"
  - Right: "shift + ↵ for newline"

- **In existing codebase**: The composer is already implemented at
  NadaApp.tsx ~line 7290+. It uses NADA tokens; visually it's ~90% aligned.
  **DO NOT replace it.** Existing features that must be preserved:
  attach menu (image/video/audio/document/poll), emoji picker, mention
  autocomplete, `VoiceRecorderBar` with live AnalyserNode waveform,
  peer-blocked state, typing-broadcast throttling, draft handling,
  attachment-draft preview. The cleaner approach is CSS-only nudges to
  match the prototype exactly.
- **Reference**: `pre_converted/Composer.tsx` (simpler standalone version —
  use as visual spec, not a replacement)

---

## Interactions & Behavior

### Navigation
- Clicking any icon-rail button calls `onTabChange(id)` — existing handler
- Active tab indicator slides with `motion.span layoutId="rail-active-indicator"`,
  spring 480/34
- Tooltip fades in on hover, 150ms

### Chat selection
- Clicking a `ChatListItem2` calls `onClick()` — existing handler
- Active row gets `nada-row-active` class (CSS-only — see globals.css patch)

### Message states
- Send → optimistic local insert with `status: "sending"` (IconClock)
- After ack from relay → `status: "delivered"` (IconCheckDouble ghost)
- After read receipt → `status: "read"` (IconCheckDouble mint)
- All existing logic — no changes needed

### Voice note playback
- Click play → wavesurfer plays, played bars turn mint (or white inside sent)
- Drag the playhead dot → wavesurfer seeks
- Click anywhere on the wave area → seek to that position
- Click speed pill → cycles 1× → 1.5× → 2× → 1×
- All existing logic — no changes needed

### Composer recording
- Click mic when input empty → existing `startRecording()` runs
- Mic button gets `composer-recording` class (added to existing JSX)
- `VoiceRecorderBar` replaces the composer body (existing behavior)

### Animations
- Bubbles fade-in (`animate-bubble-in` keyframe already in tailwind.config.ts):
  `opacity 0 → 1, translateY 8px → 0, scale 0.96 → 1`, 240ms cubic-bezier(0.16, 1, 0.3, 1)
- Unread badge `badge-pop` spring on first appear (already in config)
- Typing dots `nada-typing` 1.2s infinite (defined in globals.additions.css)
- Recording pulse `nada-rec-pulse` 1.6s infinite (defined in globals.additions.css)
- Secure dot `nada-secure-pulse` 2.2s infinite (already in existing globals.css)

### Responsive
- Below `md` breakpoint (768px), the icon rail hides (existing behavior — kept)
- Mobile chat list uses existing `MobileChatsHome` from `NadaMobileUI.tsx`
- The redesign primarily targets `md+` desktop view

---

## State Management

No new state is introduced. All new components are **purely presentational** —
they accept props and call callbacks. Existing state in `NadaApp.tsx` stays
where it is:

- `activeTab` (string) → `IconRail.activeTab`
- `unreadCount` (number) → `IconRail.unreadCount`
- `chatListModel` (`ChatListModel[]`) → drives `ChatListItem2` rows
- All composer/header state (recording, attachment draft, typing, etc.)
  stays untouched

---

## Design Tokens

All tokens are already defined in `apps/web/app/globals.css`. The
`globals.additions.css` patch in this bundle adds only 5 new classes.

### Colors

| Token | Hex | Use |
|---|---|---|
| `--nada-bg` | `#08090B` | App background, icon rail |
| `--nada-surface` | `#121215` | Chat list bg, surface |
| `--nada-surface-elevated` | `#1A1B1F` | Bubbles (received), cards |
| `--nada-surface-3` | `#212328` | Active chat row, hover surfaces |
| `--nada-primary` | `#F5F7FA` | Primary text |
| `--nada-secondary` | `#A8B0BC` | Secondary text |
| `--nada-text-muted` | `#7D8491` | Muted text |
| `--nada-text-faint` | `#525864` | Faintest text |
| `--nada-accent` | `#1ED782` | Mint accent — single accent color |
| `--nada-accent-deep` | `#11A765` | Deep mint, gradient stops |
| `--nada-violet` | `#84E85C` | Lime kicker (legacy var name) |
| `--nada-danger` | `#FF5967` | Errors, destructive |
| `--nada-input-bg` | `#141519` | Inputs |

### Spacing scale
- Bubble padding: `8px 14px`
- Composer shell padding: `8px`
- Icon-rail item: `44×44` with `12px` radius
- Avatar small: 40px; chat-list 42px; header 40px

### Typography
- Family: Inter (sans), Space Grotesk (mono — used for handles, timestamps, status)
- Sizes per Tailwind config — see `apps/web/tailwind.config.ts` (already extended)
- Letter-spacing: `-0.005em` to `-0.018em` for headlines; `0` body; mono 0

### Border radius
- Bubble: 18px (with 6px tail corner)
- Composer shell: 18px
- Cards: 20–28px
- Pills: 999px
- Icon-rail item: 12px
- Avatars: 999px (round)

### Shadows
- Accent glow: `0 0 22px rgb(var(--nada-accent) / 0.40)`
- Accent glow lg: `0 0 44px rgb(var(--nada-accent) / 0.32)`
- Hairline: `inset 0 0 0 1px rgb(var(--nada-border) / 0.06)`
- Card: `inset 0 1px 0 rgb(var(--nada-border) / 0.05), 0 4px 28px rgba(0,0,0,0.40)`

---

## Assets

- **Logo**: `apps/web/public/logo.png` (existing — used by IconRail brand mark)
- **Icons**: `lucide-react` (existing dependency). All icons used are bundled
  with lucide; no new icon files needed.
- **Fonts**: Inter + Space Grotesk loaded via `globals.css` `@import` from
  Google Fonts (existing)

No new assets are introduced.

---

## Files in this bundle

```
design_handoff_nada_messenger_redesign/
├── README.md                          ← you are here
├── prototype/                         ← HTML reference prototype
│   ├── index.html                     ← run in a browser to inspect every state
│   ├── app.jsx
│   ├── components.jsx
│   ├── arena.jsx
│   ├── icons.jsx
│   ├── data.jsx
│   └── tweaks-panel.jsx
├── pre_converted/                     ← drop-in TSX, typed against the codebase
│   ├── IconRail.tsx                   ← replaces NadaMobileUI.DesktopNavRail
│   ├── ChatListItem2.tsx              ← replaces NadaMobileUI.ChatListItem
│   ├── ChatHeader.tsx                 ← reference spec (DO NOT wire in — see notes)
│   ├── Composer.tsx                   ← reference spec (DO NOT wire in — see notes)
│   └── globals.additions.css          ← APPEND to apps/web/app/globals.css
└── INSTALL.md                         ← exact steps for Claude Code to apply
```

---

## Implementation Plan for Claude Code

1. **Read `INSTALL.md`** in this folder — it lists the exact 6 edits to make.
2. **Run the codebase locally first** (`pnpm install && pnpm dev`) to confirm
   green baseline before you change anything.
3. **Apply the patch in this order**:
   - Copy the 4 new TSX files from `pre_converted/` into `apps/web/src/components/`
   - Append `pre_converted/globals.additions.css` to `apps/web/app/globals.css`
   - Edit the import block in `apps/web/src/components/NadaApp.tsx` (~line 79)
4. **Verify** by:
   - Type-checking: `pnpm typecheck` (or `tsc --noEmit` in `apps/web`)
   - Linting: `pnpm lint` (eslint should be clean)
   - Running: `pnpm dev`, click between chats, send a message,
     play a voice note, place a call — every feature works
5. **Optional pixel polish on the chat header and composer**: read the
   "Screens / Views" sections above for chat header (item 3) and composer
   (item 6). The existing JSX already uses NADA tokens and is ~90% aligned;
   nudge specific classes only if needed and never restructure.
   **Do not replace the header or composer JSX with the standalone
   `ChatHeader.tsx`/`Composer.tsx`** — those are simpler primitives and
   would drop ~20 features (attach picker, emoji picker, mention autocomplete,
   recorder bar, etc.). Use them only as a visual spec.

---

## What you must NOT change

- Any logic in `@nada/crypto` (identity proofs, group sender keys)
- Any logic in `useSocketStore`, `useIdentityStore`, `useCallStore`
- `CallOverlay.tsx`, `GroupCallOverlay.tsx` (out of scope)
- `VoiceNote.tsx` (already uses NADA tokens — auto-inherits new look)
- Stripe billing flows, invite/share-card flows
- Dexie persistence, group migration
- The 7 scratch-*.js files in repo root
- `apps/relay/*` (server)

If you find yourself touching any of these to make the redesign work,
**stop** — the design is wrong or the scope has crept. Ask the user.

---

## Acceptance criteria

- `pnpm typecheck` clean
- `pnpm lint` clean
- Desktop view (md+): icon rail shows hairline border, glow indicator on
  active tab, hover tooltips, brand mark at top, settings at bottom
- Chat list rows: 42px round avatar with online dot, verified-key shield,
  3px mint left rail when selected, accent unread badge
- Send/receive/voice/call/group/invite/billing — all work exactly as before
- No new console errors or React warnings
