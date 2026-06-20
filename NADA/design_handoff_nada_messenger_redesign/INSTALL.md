# INSTALL — Claude Code task brief

This file tells Claude Code exactly what to do. Run from the root of the
`Nada` repo (https://github.com/Lushegs01/Nada).

## Preflight

```bash
pnpm install
pnpm dev   # confirm the app boots cleanly on the current main
```

If `pnpm dev` is already broken on main, fix that first or ask the user
before proceeding.

## Step 1 — Copy 4 new component files

Copy these files from this handoff bundle's `pre_converted/` folder into
`apps/web/src/components/`:

```
pre_converted/IconRail.tsx        →  apps/web/src/components/IconRail.tsx
pre_converted/ChatListItem2.tsx   →  apps/web/src/components/ChatListItem2.tsx
pre_converted/ChatHeader.tsx      →  apps/web/src/components/ChatHeader.tsx
pre_converted/Composer.tsx        →  apps/web/src/components/Composer.tsx
```

`ChatHeader.tsx` and `Composer.tsx` are reference specs, not wired in. They
ship so the user can see the prototype shapes typed against the codebase
conventions. **Do not import them from `NadaApp.tsx`.**

## Step 2 — Append CSS to globals.css

Open `apps/web/app/globals.css` and append the **entire contents** of
`pre_converted/globals.additions.css` to the very end of the file. The
additions are 5 new classes inside a `@layer components { … }` block and do
not modify any existing rules.

## Step 3 — Patch the import block in NadaApp.tsx

In `apps/web/src/components/NadaApp.tsx`, find this import block (~line 79):

```tsx
import {
  MobileChatsHome,
  ChatListItem,
  ArchivedRow,
  DesktopNavRail,
  EmptyChatListState
} from "./NadaMobileUI";
```

Replace it with:

```tsx
import {
  MobileChatsHome,
  ArchivedRow,
  EmptyChatListState
} from "./NadaMobileUI";
import { IconRail as DesktopNavRail } from "./IconRail";
import { ChatListItem } from "./ChatListItem2";
```

**That is the only edit to `NadaApp.tsx`.** Every existing `<DesktopNavRail>`
and `<ChatListItem>` JSX usage in the rest of the 11k-line file
automatically resolves to the new components because their prop signatures
match exactly.

## Step 4 — Verify

```bash
pnpm typecheck    # or: pnpm --filter @nada/web exec tsc --noEmit
pnpm lint
pnpm dev
```

Manually verify in the browser at md+ width:

- [ ] **Icon rail**: hairline right border, brand mark at top, active tab has
  green glow indicator on the left edge, hovering shows tooltips
- [ ] **Chat list**: each row has 42px round avatar with mint online dot,
  verified-key shield next to the name, active row gets 3px mint left rail
- [ ] **Unread badge**: appears as solid mint pill, ink-black text
- [ ] **Send a message**: text input → press Enter → bubble appears with
  status tick that progresses (sending → delivered → read)
- [ ] **Play a voice note** (you may need to record one first): wavesurfer
  plays, played bars are mint, playhead drag works
- [ ] **Place a call**: CallOverlay opens; the call UI still works
- [ ] **Open a group chat**: header shows group title; copy-invite/options
  menu still works
- [ ] **Console clean**: no new React warnings or errors

## Step 5 — Commit

```bash
git checkout -b ui/messenger-redesign
git add apps/web/app/globals.css \
        apps/web/src/components/NadaApp.tsx \
        apps/web/src/components/IconRail.tsx \
        apps/web/src/components/ChatListItem2.tsx \
        apps/web/src/components/ChatHeader.tsx \
        apps/web/src/components/Composer.tsx
git commit -m "ui: messenger desktop redesign — icon rail, chat list, design tokens"
git push -u origin ui/messenger-redesign
```

Open a PR with title: **"UI: messenger desktop redesign"** and body:

```
Redesigns the desktop messenger UI (icon rail + chat list rows + new design tokens)
without touching any business logic.

- New components: IconRail (drop-in for DesktopNavRail), ChatListItem2 (drop-in
  for ChatListItem)
- Reference components: ChatHeader, Composer — not wired in (preserved features
  in existing header/composer trump simpler shapes)
- CSS additions: .nada-row-active, .composer-shell, .composer-send,
  .composer-recording, @keyframes nada-rec-pulse
- 1 import block changed in NadaApp.tsx

Verified: encryption, sockets, calls, billing, persistence all untouched.
See README.md in design_handoff_nada_messenger_redesign/ for full design spec.
```

## Rollback

If anything breaks:

```bash
git restore apps/web/app/globals.css apps/web/src/components/NadaApp.tsx
rm apps/web/src/components/{IconRail,ChatListItem2,ChatHeader,Composer}.tsx
pnpm dev
```

## Out of scope (do not do)

- Wiring `ChatHeader.tsx` or `Composer.tsx` into `NadaApp.tsx`. They are
  simpler than the existing JSX and would drop ~20 features (attach picker,
  emoji picker, mention autocomplete, recorder bar, vanish-timer dropdown,
  group options menu, etc.). They ship as visual specs only.
- Modifying `VoiceNote.tsx`. It already uses `--nada-accent` tokens and
  auto-inherits the new look.
- Touching `CallOverlay`, `GroupCallOverlay`, `CallStore`, `SocketStore`,
  `IdentityStore`, `@nada/crypto`, `@nada/db`, billing, invites, share cards.

If the user later asks for a deeper header/composer port, scope it as a
separate task: inventory every feature in the existing JSX, extend the
reference components to cover them all, then replace block-by-block with
manual testing after each block.
