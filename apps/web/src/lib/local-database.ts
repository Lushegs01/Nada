import { nadaDb } from "@/lib/db";

/**
 * Opening the local database, safely.
 *
 * NADA is local-first: the identity, the message history and the group keys all
 * live in one IndexedDB database, and the app cannot render anything useful
 * until it opens. That makes this the single most dangerous piece of startup
 * code in the product — a failure here is indistinguishable, to a user, from
 * the app being broken.
 *
 * The rules this module exists to enforce:
 *
 *  - Opening can fail, and every failure must be reported rather than awaited
 *    forever. An unhandled rejection here is an infinite splash screen.
 *  - Opening can *block* (another tab holds the database at an older version),
 *    in which case the open promise simply never settles. Only a timeout
 *    distinguishes that from slow hardware.
 *  - No failure path may destroy user data on its own initiative.
 */

export const DATABASE_NAME = "nada-local";

/** How long any single IndexedDB step may take before we call it stuck. */
const OPEN_TIMEOUT_MS = 12_000;
/** Legacy repair touches at most a handful of rows; it should be near-instant. */
const REPAIR_TIMEOUT_MS = 8_000;
/**
 * How long to wait out a blocked upgrade before reporting it.
 *
 * A block is usually a moment rather than a state — the previous page's
 * connection outliving a navigation, or another tab mid-close — and the
 * request completes on its own the instant that connection goes away. So we
 * wait, rather than retry: an IndexedDB open request cannot be cancelled, and
 * a second one simply queues behind the first, blocking itself. Bounded,
 * because the point of this module is that startup always ends.
 */
const BLOCKED_WAIT_MS = 2_500;

const GROUP_KEYS_STORE = "groupKeys";
const GROUP_KEYS_INDEXES = ["groupId", "createdByPubkeyHash", "createdAt"] as const;

/**
 * Dexie maps a declared version N onto IndexedDB version N×10, and only runs a
 * version's upgrade callback when `N > installedVersion`. Bridging a legacy
 * database to 71 ("7.1") therefore puts it above every pre-epoch build (≤ 70)
 * and below the first version that declares the compound key (80), so Dexie
 * still runs versions 8 and 9 normally afterwards — it just no longer has to
 * change a primary key to get there.
 */
const LEGACY_BRIDGE_IDB_VERSION = 71;

export type DatabaseFailureReason =
  | "blocked"
  | "upgrade-failed"
  | "version-mismatch"
  | "storage-unavailable"
  | "quota-exceeded"
  | "timeout"
  | "unknown";

export interface DatabaseDiagnostic {
  step: string;
  detail: string;
  at: number;
}

export type DatabaseOpenResult =
  | { ok: true; diagnostics: DatabaseDiagnostic[] }
  | {
      ok: false;
      reason: DatabaseFailureReason;
      message: string;
      diagnostics: DatabaseDiagnostic[];
    };

/**
 * A rolling record of what startup did, for the recovery screen and for a user
 * who reports a problem.
 *
 * Deliberately structural only: store names, row counts, version numbers and
 * error names. Never a key, never a seed phrase, never message content — this
 * is the one buffer most likely to end up pasted into a support conversation.
 */
const diagnostics: DatabaseDiagnostic[] = [];
const MAX_DIAGNOSTICS = 40;

export function recordDiagnostic(step: string, detail: string): void {
  diagnostics.push({ step, detail, at: Date.now() });
  if (diagnostics.length > MAX_DIAGNOSTICS) diagnostics.shift();
}

export function readDiagnostics(): DatabaseDiagnostic[] {
  return [...diagnostics];
}

export function formatDiagnostics(): string {
  return diagnostics
    .map((entry) => `${new Date(entry.at).toISOString()} ${entry.step}: ${entry.detail}`)
    .join("\n");
}

/** Classifies an open failure into something the recovery screen can act on. */
export function classifyDatabaseError(error: unknown): {
  reason: DatabaseFailureReason;
  message: string;
} {
  const name = errorName(error);
  const message = errorMessage(error);

  // Dexie wraps the original failure once the database is closed, so the
  // wrapper's own name says nothing useful — the text does.
  const combined = `${name} ${message}`;

  if (/VersionError/i.test(combined)) {
    return {
      reason: "version-mismatch",
      message: "This device holds data from a newer version of NADA."
    };
  }
  if (/UpgradeError|primary key|ConstraintError|AbortError/i.test(combined)) {
    return {
      reason: "upgrade-failed",
      message: "Your local data could not be upgraded to this version of NADA."
    };
  }
  if (/QuotaExceeded/i.test(combined)) {
    return {
      reason: "quota-exceeded",
      message: "This device has run out of storage space for NADA."
    };
  }
  if (/InvalidStateError|NotFoundError|SecurityError|UnknownError|MissingAPI/i.test(combined)) {
    return {
      reason: "storage-unavailable",
      message: "This browser would not give NADA access to local storage."
    };
  }
  if (/blocked/i.test(combined)) {
    return {
      reason: "blocked",
      message: "Another NADA tab is holding your local data open."
    };
  }
  return { reason: "unknown", message: "Your local data could not be opened." };
}

function errorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    return String((error as { name: unknown }).name);
  }
  return "Error";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

/** Rejects rather than hanging when an IndexedDB step never settles. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(label));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

class TimeoutError extends Error {
  override readonly name = "TimeoutError";
  constructor(label: string) {
    super(`${label} did not complete in time.`);
  }
}

function storageAvailable(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

// ── Legacy repair ────────────────────────────────────────────────────────────

export type LegacyRepairOutcome =
  | "not-needed"
  | "repaired"
  | "no-storage"
  | "blocked"
  | "failed";

/**
 * Converts a pre-epoch `groupKeys` store to the compound-key shape, preserving
 * every row.
 *
 * Why this exists at all: schema version 8 changed the `groupKeys` primary key
 * from `groupId` to `[groupId+epoch]`, and IndexedDB cannot change the primary
 * key of an existing store — Dexie refuses with "Not yet support for changing
 * primary key". Every device that had ever created a group key therefore failed
 * to open, permanently, while devices installing NADA for the first time were
 * unaffected. That is exactly the reported symptom: new users fine, returning
 * users stuck.
 *
 * The fix cannot be "declare the old shape again", because devices that
 * installed after version 8 already hold the compound shape and would then hit
 * the same error in the opposite direction. So the conversion happens here,
 * beneath Dexie, where deleting and recreating a store is permitted — with the
 * rows read out first and written straight back.
 *
 * Idempotent: a store that is already compound is left untouched, so a replayed
 * or interrupted repair is a no-op rather than a second conversion.
 */
export async function repairLegacyGroupKeys(): Promise<LegacyRepairOutcome> {
  if (!storageAvailable()) {
    recordDiagnostic("legacy-repair", "skipped: no IndexedDB");
    return "no-storage";
  }

  try {
    return await withTimeout(runLegacyRepair(), REPAIR_TIMEOUT_MS, "Legacy repair");
  } catch (error) {
    const { reason } = classifyDatabaseError(error);
    recordDiagnostic("legacy-repair", `failed: ${errorName(error)}`);
    // A failed repair is not fatal on its own — Dexie is still given its
    // chance, and if it also fails the recovery screen explains why.
    return reason === "blocked" ? "blocked" : "failed";
  }
}

async function runLegacyRepair(): Promise<LegacyRepairOutcome> {
  // `databases()` avoids creating the database as a side effect of looking.
  // Where it is unsupported we fall through and open, which at worst creates an
  // empty database that Dexie was about to create anyway.
  if (typeof indexedDB.databases === "function") {
    try {
      const existing = await indexedDB.databases();
      if (!existing.some((entry) => entry.name === DATABASE_NAME)) {
        recordDiagnostic("legacy-repair", "not needed: no existing database");
        return "not-needed";
      }
    } catch {
      // Firefox private mode throws here; fall through to opening.
    }
  }

  const probe = await openRaw(DATABASE_NAME);
  let currentVersion = probe.version;
  let keyPath: string | string[] | null = null;
  let rows: Array<Record<string, unknown>> = [];

  try {
    if (!probe.objectStoreNames.contains(GROUP_KEYS_STORE)) {
      recordDiagnostic("legacy-repair", `not needed: no ${GROUP_KEYS_STORE} store`);
      return "not-needed";
    }
    const transaction = probe.transaction(GROUP_KEYS_STORE, "readonly");
    const store = transaction.objectStore(GROUP_KEYS_STORE);
    keyPath = store.keyPath;
    if (Array.isArray(keyPath)) {
      recordDiagnostic(
        "legacy-repair",
        `not needed: ${GROUP_KEYS_STORE} already keyed [${keyPath.join("+")}]`
      );
      return "not-needed";
    }
    rows = await requestToPromise<Array<Record<string, unknown>>>(store.getAll());
  } finally {
    probe.close();
  }

  recordDiagnostic(
    "legacy-repair",
    `converting ${GROUP_KEYS_STORE} from "${String(keyPath)}" at v${currentVersion}; ${rows.length} row(s)`
  );

  const target = Math.max(currentVersion + 1, LEGACY_BRIDGE_IDB_VERSION);
  const upgraded = await openRaw(DATABASE_NAME, target, (event) => {
    const db = (event.target as IDBOpenDBRequest).result;
    const transaction = (event.target as IDBOpenDBRequest).transaction;
    if (!transaction) throw new Error("Upgrade transaction unavailable.");

    if (db.objectStoreNames.contains(GROUP_KEYS_STORE)) {
      db.deleteObjectStore(GROUP_KEYS_STORE);
    }
    const store = db.createObjectStore(GROUP_KEYS_STORE, {
      keyPath: ["groupId", "epoch"]
    });
    for (const index of GROUP_KEYS_INDEXES) {
      store.createIndex(index, index, { unique: false });
    }
    for (const row of rows) {
      // Rows written before epochs existed are epoch 1 by definition. A row
      // missing `groupId` cannot be keyed at all and is dropped rather than
      // aborting the whole upgrade — one unusable key must not cost a user
      // their entire account.
      if (typeof row["groupId"] !== "string") continue;
      const epoch = typeof row["epoch"] === "number" ? row["epoch"] : 1;
      store.put({ ...row, epoch });
    }
  });
  currentVersion = upgraded.version;
  upgraded.close();

  recordDiagnostic("legacy-repair", `repaired; database now at v${currentVersion}`);
  return "repaired";
}

function blockedError(): Error {
  const error = new Error("Another tab is holding the database open.");
  error.name = "BlockedError";
  return error;
}

function openRaw(
  name: string,
  version?: number,
  onUpgrade?: (event: IDBVersionChangeEvent) => void
): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request =
      version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);
    let blockedTimer: ReturnType<typeof setTimeout> | null = null;
    const clearBlockedTimer = (): void => {
      if (blockedTimer !== null) clearTimeout(blockedTimer);
      blockedTimer = null;
    };

    request.onsuccess = () => {
      clearBlockedTimer();
      resolve(request.result);
    };
    request.onerror = () => {
      clearBlockedTimer();
      reject(request.error ?? new Error("IndexedDB open failed."));
    };
    request.onblocked = () => {
      // Do not give up yet: the request completes by itself the moment the
      // other connection closes, and that is the usual outcome.
      recordDiagnostic("open", "upgrade blocked; waiting for the other connection");
      blockedTimer = setTimeout(() => reject(blockedError()), BLOCKED_WAIT_MS);
    };
    if (onUpgrade) {
      request.onupgradeneeded = (event) => {
        try {
          onUpgrade(event);
        } catch (error) {
          request.transaction?.abort();
          clearBlockedTimer();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };
    }
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

// ── Opening ──────────────────────────────────────────────────────────────────

let openPromise: Promise<DatabaseOpenResult> | null = null;

/**
 * Opens the local database, repairing a legacy layout first if one is present.
 *
 * Resolves with a result rather than rejecting, so no caller can accidentally
 * leave the app waiting on a promise that will never settle. Memoised, because
 * React renders this twice in development and opening twice concurrently is
 * how you manufacture a blocked upgrade.
 */
export function openLocalDatabase(): Promise<DatabaseOpenResult> {
  openPromise ??= performOpen();
  return openPromise;
}

/** Discards the memoised attempt so the recovery screen's Retry means it. */
export function resetOpenAttempt(): void {
  openPromise = null;
}

async function performOpen(): Promise<DatabaseOpenResult> {
  if (!storageAvailable()) {
    recordDiagnostic("open", "no IndexedDB in this browser");
    return {
      ok: false,
      reason: "storage-unavailable",
      message:
        "This browser does not provide local storage to NADA. Private browsing windows often block it.",
      diagnostics: readDiagnostics()
    };
  }

  return attemptOpen();
}

const BLOCKED_MESSAGE =
  "Another NADA tab or window is open and holding your local data. Close it and try again.";

async function attemptOpen(): Promise<DatabaseOpenResult> {
  const repair = await repairLegacyGroupKeys();
  if (repair === "blocked") {
    return {
      ok: false,
      reason: "blocked",
      message: BLOCKED_MESSAGE,
      diagnostics: readDiagnostics()
    };
  }

  // A blocked Dexie open never settles — the promise just sits there — so the
  // event is what tells us why the timeout below is about to fire.
  let blocked = false;
  const onBlocked = (): void => {
    blocked = true;
    recordDiagnostic("open", "blocked by another connection");
  };
  nadaDb.on("blocked", onBlocked);

  try {
    await withTimeout(nadaDb.open(), OPEN_TIMEOUT_MS, "Opening local data");
    recordDiagnostic("open", `opened at schema v${nadaDb.verno}`);
    return { ok: true, diagnostics: readDiagnostics() };
  } catch (error) {
    const classified = blocked
      ? { reason: "blocked" as const, message: BLOCKED_MESSAGE }
      : classifyDatabaseError(error);
    recordDiagnostic("open", `failed: ${errorName(error)} (${classified.reason})`);
    return {
      ok: false,
      reason: classified.reason,
      message: classified.message,
      diagnostics: readDiagnostics()
    };
  } finally {
    // Dexie's typings model `on('blocked')` as a subscribe-only hook; the
    // unsubscribe exists at runtime.
    (nadaDb.on("blocked") as unknown as { unsubscribe?: (fn: () => void) => void })
      .unsubscribe?.(onBlocked);
  }
}

// ── Identity rescue ──────────────────────────────────────────────────────────

/**
 * Reads the identity record straight out of IndexedDB, bypassing Dexie.
 *
 * The failure that motivated this module left the `identity` store perfectly
 * intact — only `groupKeys` was unopenable — so a user facing a repair almost
 * never needs their seed phrase. Lifting the identity out first turns a reset
 * from "you lose your account" into "you lose your message history", which is a
 * different conversation entirely.
 *
 * Returns null when there is nothing to rescue, which is also the answer when
 * the database is too damaged to read. It never throws: the caller is already
 * in a failure path.
 */
export async function rescueIdentityRecord(): Promise<Record<string, unknown> | null> {
  if (!storageAvailable()) return null;
  try {
    const db = await withTimeout(openRaw(DATABASE_NAME), REPAIR_TIMEOUT_MS, "Identity rescue");
    try {
      if (!db.objectStoreNames.contains("identity")) {
        recordDiagnostic("rescue", "no identity store");
        return null;
      }
      const store = db.transaction("identity", "readonly").objectStore("identity");
      const record = await requestToPromise<Record<string, unknown> | undefined>(
        store.get("primary")
      );
      recordDiagnostic("rescue", record ? "identity recovered" : "no identity stored");
      return record ?? null;
    } finally {
      db.close();
    }
  } catch (error) {
    recordDiagnostic("rescue", `failed: ${errorName(error)}`);
    return null;
  }
}

/** Writes a rescued identity back into a freshly recreated database. */
export async function restoreIdentityRecord(
  record: Record<string, unknown>
): Promise<boolean> {
  try {
    await nadaDb.identity.put(record as never);
    recordDiagnostic("rescue", "identity restored into new database");
    return true;
  } catch (error) {
    recordDiagnostic("rescue", `restore failed: ${errorName(error)}`);
    return false;
  }
}

// ── Destructive recovery ─────────────────────────────────────────────────────

/**
 * Deletes the local database outright.
 *
 * The last resort, offered only after a retry has failed, and only behind an
 * explicit confirmation that names what is lost. Everything derived from the
 * seed phrase comes back on the next sign-in; everything else — message
 * history, contacts, and the prekeys that let others' queued messages be read —
 * does not. That is why nothing in this module calls it automatically.
 */
export async function deleteLocalDatabase(): Promise<boolean> {
  if (!storageAvailable()) return false;
  try {
    nadaDb.close();
  } catch {
    // Already closed; deleting is still valid.
  }
  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DATABASE_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error("Delete failed."));
        request.onblocked = () => reject(blockedError());
      }),
      REPAIR_TIMEOUT_MS,
      "Deleting local data"
    );
    recordDiagnostic("reset", "local database deleted");
    return true;
  } catch (error) {
    recordDiagnostic("reset", `delete failed: ${errorName(error)}`);
    return false;
  }
}
