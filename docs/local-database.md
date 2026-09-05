# Local database: startup, migrations and recovery

NADA is local-first. The identity, the message history, the contacts and the
group keys all live in one IndexedDB database (`nada-local`), and nothing in the
product works until it opens. This document covers how that open is made safe,
and the outage that made it necessary.

## The returning-user outage

**Symptom.** New installs worked. Any device that had used NADA before was stuck
on the splash screen forever — no error, no timeout, no way out.

**Root cause.** Schema version 8 changed the `groupKeys` primary key from
`groupId` to the compound `[groupId+epoch]`:

```ts
this.version(8).stores({ groupKeys: "[groupId+epoch], groupId, ..." })
```

IndexedDB does not permit changing the primary key of an existing object store,
and Dexie refuses outright:

```
UpgradeError: Not yet support for changing primary key
```

The `groupKeys` store has existed since version 3, so **every** device that had
ever reached version 3 hit this — whether or not it had ever created a group
key. Dexie then marked the database closed, and every later operation rejected.

**Why it became an infinite splash rather than an error.** `NadaApp` awaited the
identity read with no rejection handler:

```ts
void nadaDb.identity.get(primaryIdentityId).then((record) => {
  /* ... */ setIsLoading(false);
});
```

A rejected promise meant `setIsLoading(false)` never ran. The splash screen was
not a symptom of slowness; it was the app's only response to failure.

**Why a fresh profile could not reproduce it.** With no existing database, Dexie
*creates* `groupKeys` at its final shape. There is no primary key to change, so
there is no error. The bug was only reachable through data that already existed.

## Why the fix is not a schema change

Two populations exist in production, and they hold different structures:

| Population | Installed | `groupKeys` primary key | Before the fix |
| --- | --- | --- | --- |
| A — used NADA before version 8 | ≤ 7 | `groupId` | Permanently broken |
| B — installed after version 8 | 9 | `[groupId+epoch]` | Working |

Dexie compares the **installed** structure against the declared schema *at the
installed version* (`versToRun = versions.filter(v => v.version >= oldVersion)`,
seeded from `buildGlobalSchema(db, db.idbdb, ...)`). So:

- Declaring `groupKeys` with the compound key breaks population A at version 8.
- Declaring it with the old key breaks population B at version 9 — the same
  error in the opposite direction.

There is no single declared schema that serves both. The conversion therefore
happens **beneath Dexie**, in `repairLegacyGroupKeys` (`src/lib/local-database.ts`),
before the first open: raw IndexedDB reads the rows out, deletes the store,
recreates it with the compound key, and writes the rows straight back with
`epoch: 1`. Deleting and recreating a store *is* permitted; only changing a key
in place is not.

The bridge lands on native version 71 ("7.1") — above every pre-epoch build
(≤ 70) and below the first version that declares the compound key (80) — so
Dexie still runs versions 8 and 9 normally afterwards. It just no longer has to
change a primary key to get there.

> **Do not edit the version 8 declaration.** It already shipped, and population B
> depends on it exactly as written.

## Migration audit

| Version | Change | Backwards compatible | Idempotent | Notes |
| --- | --- | --- | --- | --- |
| 1 | Creates 6 stores | n/a | ✓ | Fresh only |
| 2 | Adds `encryptedFiles` | ✓ | ✓ | Additive |
| 3 | Adds `calls`, `groupKeys` | ✓ | ✓ | Additive |
| 4 | Adds `chatPrefs` | ✓ | ✓ | Additive |
| 5 | No-op | ✓ | ✓ | Version bump only |
| 6 | Adds `kind`, `[kind+createdAt]` indexes to `messages` | ✓ | ✓ | Index-only. Rows written before it lack `kind` and are absent from that index; the only query using it filters to statuses in the last 24h, which such rows can never be |
| 7 | Adds `createdAt` index to `messages` | ✓ | ✓ | Index-only |
| 8 | `groupKeys` primary key → `[groupId+epoch]` | ✗ **— the outage** | ✓ after repair | Handled by `repairLegacyGroupKeys`; the upgrade callback now only backfills a missing `epoch` rather than clearing and rewriting the table |
| 9 | Adds `prekeys` | ✓ | ✓ | Additive |

Version 8 specifically, against the questions worth asking of it:

- **Can old records always be upgraded?** Yes. A pre-epoch row has a `groupId`
  and no `epoch`; it becomes epoch 1, which is what it always meant. A row
  without a `groupId` cannot be keyed at all and is skipped rather than aborting
  the upgrade — one unusable key must not cost a user their whole account.
- **Can the migration hang?** No. Every IndexedDB step is wrapped in a timeout,
  and a blocked upgrade is waited out for a bounded window and then reported.
- **Is a replayed migration safe?** Yes. A store that is already compound is left
  untouched, so a repeated or interrupted repair is a no-op. Covered by tests.
- **Does the schema match `GroupKeyRecord`?** Now, yes. The table was typed
  `Table<GroupKeyRecord, string>` while its primary key was compound; it is now
  `Table<GroupKeyRecord, [string, number]>`.

## Startup

`openLocalDatabase()` is the readiness gate. It resolves with a *result* rather
than rejecting, so no caller can leave the app waiting on a promise that never
settles:

```
storage available? → repair legacy layout → open Dexie → { ok } | { ok: false, reason }
```

It is memoised (React renders twice in development, and opening twice
concurrently is how you manufacture a blocked upgrade), and every step is
bounded: 8s for the repair, 12s for the open, 2.5s to wait out a block.

`NadaApp` awaits it before rendering anything, and every branch ends in either an
identity or a failure the user can act on. WebSocket connection is downstream of
identity and plays no part in database readiness.

Handled failures: `VersionError`, `UpgradeError`, `ConstraintError`,
`AbortError`, `InvalidStateError`, `QuotaExceededError`, blocked upgrades, and a
missing IndexedDB entirely (private browsing). Each maps to a plain-language
explanation; the raw browser string is never shown.

## Recovery

When the database will not open, the user gets a screen, not a spinner:

> **NADA couldn't open your local data.**

1. **Try again** — offered alone, first. It costs nothing and clears the common
   causes (a second tab, a transient lock).
2. **Repair local storage** — appears *only after a retry has actually failed*.
   Before asking for confirmation it reads the identity out of the damaged
   database with raw IndexedDB, so the confirmation can state truthfully whether
   the account survives. It then names exactly what is deleted (message history,
   contacts, chats, group keys, settings, prekeys) and what is not.
3. **Seed phrase restore** — only reached when the identity could not be
   rescued. Twelve words rebuild the same identity deterministically.

Nothing here deletes anything without an explicit confirmation, and nothing
wipes IndexedDB automatically, ever.

### Diagnostics

"Show technical details" reveals a structural log: store names, row counts,
version numbers, error names, and what the repair did. Never a key, a seed
phrase, a pubkey hash or message content — this is the buffer most likely to be
pasted into a support conversation, and a test asserts that key material never
reaches it.

## Service worker

`skipWaiting` and `clients.claim()` are both set, so a new build activates
immediately and takes over open clients rather than waiting for every tab to
close. An old cached shell therefore cannot pin a user to an incompatible
application version across a deploy. An E2E test asserts the worker reaches a
`ready` registration.

## Tests

`apps/web/tests/local-database.test.ts` (19, `fake-indexeddb`) — pre-epoch
database opens; identity, group keys, messages, contacts, chats and settings all
survive; post-epoch database still opens and keeps both epochs; fresh install;
repair idempotency; interrupted repair; blocked upgrade; database from a newer
build; unavailable storage; corrupted row salvage; error classification;
diagnostics carry no key material; destructive reset only on request. Includes a
**negative control** asserting that Dexie alone still cannot open a pre-epoch
database — if that ever starts passing, the repair is safe to delete, and not
before.

`apps/web/tests/legacy-startup.spec.ts` (5 × 2 viewports, real Chromium, real
IndexedDB) — seeds the pre-epoch schema by hand and asserts the user reaches the
dashboard rather than the splash; that their data survives; that a reload does
not re-run the migration; that fresh profiles still reach onboarding; and that
the service worker takes control.

Verified by bypassing the fix and rebuilding: the E2E fails, and the user lands
on the recovery screen rather than an infinite splash — so both the migration
and the safety net are independently load-bearing.
