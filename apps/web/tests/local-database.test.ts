import "fake-indexeddb/auto";
// The package's "exports" map hides the typings for this entry point, so
// TypeScript cannot resolve them; the runtime export is a plain IDBFactory.
// @ts-expect-error -- untyped deep import, see above
import FDBFactory from "fake-indexeddb/lib/FDBFactory";
import Dexie from "dexie";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Startup against a database that already exists.
 *
 * The bug these cover shipped to production and locked every returning user out
 * of NADA permanently: schema version 8 changed the `groupKeys` primary key,
 * which IndexedDB does not allow on an existing store, so Dexie refused to open
 * and the splash screen never went away. A fresh browser profile could not
 * reproduce it — only a database that already had group keys in it.
 *
 * Every test here therefore starts from an *existing* database.
 */

const IDENTITY = {
  id: "primary" as const,
  pubkey: "PUBLIC-KEY",
  pubkeyHash: "a".repeat(64),
  encryptedPrivateKey: "encrypted",
  localPrivateKey: "private",
  seedBackupStatus: "confirmed" as const,
  createdAt: 1_700_000_000_000
};

/** The schema exactly as it shipped before epochs existed (versions 1-7). */
function legacySchema(db: Dexie): Dexie {
  db.version(1).stores({
    identity: "id, pubkeyHash, createdAt",
    contacts: "id, pubkeyHash, addedAt, trustStatus",
    chats: "id, type, updatedAt",
    messages: "id, chatId, [chatId+createdAt], status, expiresAt",
    settings: "key, updatedAt",
    sessions: "id, contactPubkeyHash, updatedAt"
  });
  db.version(2).stores({ encryptedFiles: "contentHash, createdAt, expiresAt" });
  db.version(3).stores({
    calls: "id, chatId, status, startedAt",
    groupKeys: "groupId, createdByPubkeyHash, createdAt"
  });
  db.version(4).stores({ chatPrefs: "chatId, updatedAt" });
  db.version(5).stores({});
  db.version(6).stores({
    messages: "id, chatId, [chatId+createdAt], kind, [kind+createdAt], status, expiresAt"
  });
  db.version(7).stores({
    messages:
      "id, chatId, [chatId+createdAt], kind, [kind+createdAt], status, expiresAt, createdAt"
  });
  return db;
}

/** A device that last ran a build from before epochs — the broken population. */
async function seedLegacyDatabase(options: { groupKeys?: boolean } = {}): Promise<void> {
  const db = legacySchema(new Dexie("nada-local"));
  await db.open();
  await db.table("identity").put(IDENTITY);
  await db.table("contacts").put({
    id: "contact-1",
    pubkeyHash: "b".repeat(64),
    publicKey: "PEER-KEY",
    localDisplayName: "Quiet Fox",
    addedAt: 1,
    trustStatus: "trusted"
  });
  await db.table("chats").put({
    id: "chat-1",
    type: "group",
    title: "Study group",
    memberPubkeyHashes: ["a".repeat(64), "b".repeat(64)],
    createdAt: 1,
    updatedAt: 2,
    disappearingTimer: 0
  });
  await db.table("messages").bulkPut([
    {
      id: "00000000-0000-4000-8000-000000000001",
      chatId: "chat-1",
      senderPubkeyHash: "a".repeat(64),
      recipientPubkeyHash: "b".repeat(64),
      direction: "outbound",
      kind: "text",
      body: "hello",
      encryptedPayload: "ciphertext",
      status: "sent",
      createdAt: 10
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      chatId: "chat-1",
      senderPubkeyHash: "b".repeat(64),
      recipientPubkeyHash: "a".repeat(64),
      direction: "inbound",
      kind: "text",
      body: "hi",
      encryptedPayload: "ciphertext",
      status: "delivered",
      createdAt: 11
    }
  ]);
  await db.table("settings").put({ key: "displayName", value: "Ghost", updatedAt: 1 });
  if (options.groupKeys !== false) {
    await db.table("groupKeys").bulkPut([
      {
        groupId: "chat-1",
        senderKey: "GROUP-KEY-1",
        createdByPubkeyHash: "a".repeat(64),
        createdAt: 5
      },
      {
        groupId: "chat-2",
        senderKey: "GROUP-KEY-2",
        createdByPubkeyHash: "b".repeat(64),
        createdAt: 6
      }
    ]);
  }
  await db.close();
}

/** A device that installed NADA after epochs shipped — the working population. */
async function seedPostEpochDatabase(): Promise<void> {
  const { nadaDb } = await import("@/lib/db");
  await nadaDb.open();
  await nadaDb.identity.put(IDENTITY);
  await nadaDb.groupKeys.bulkPut([
    {
      groupId: "chat-1",
      epoch: 1,
      senderKey: "GROUP-KEY-1",
      createdByPubkeyHash: "a".repeat(64),
      createdAt: 5
    },
    {
      groupId: "chat-1",
      epoch: 2,
      senderKey: "GROUP-KEY-2",
      createdByPubkeyHash: "a".repeat(64),
      createdAt: 6
    }
  ]);
  nadaDb.close();
  vi.resetModules();
}

beforeEach(() => {
  vi.resetModules();
  // A brand-new backing store per test, so "existing database" always means
  // the one the test seeded. Dexie resolves its IndexedDB reference once when
  // the module initialises, so the statically imported copy used by the seed
  // helpers has to be pointed at the same factory as the dynamically imported
  // copy under test — otherwise the seed lands in a different database and
  // every "existing user" test silently becomes a fresh-install test.
  const factory = new FDBFactory();
  globalThis.indexedDB = factory;
  Dexie.dependencies.indexedDB = factory;
});

describe("returning user startup", () => {
  it("opens a pre-epoch database instead of hanging forever", async () => {
    await seedLegacyDatabase();
    vi.resetModules();

    const { openLocalDatabase } = await import("@/lib/local-database");
    const result = await openLocalDatabase();

    expect(result.ok).toBe(true);
  });

  it("keeps the identity, so the user is not thrown back to onboarding", async () => {
    await seedLegacyDatabase();
    vi.resetModules();

    const { openLocalDatabase } = await import("@/lib/local-database");
    await openLocalDatabase();
    const { nadaDb, primaryIdentityId } = await import("@/lib/db");

    const identity = await nadaDb.identity.get(primaryIdentityId);
    expect(identity?.pubkeyHash).toBe(IDENTITY.pubkeyHash);
    expect(identity?.localPrivateKey).toBe(IDENTITY.localPrivateKey);
  });

  it("keeps every group key, at epoch 1", async () => {
    // Losing these silently costs the user the ability to read their own group
    // history — the failure mode most worth a test.
    await seedLegacyDatabase();
    vi.resetModules();

    const { openLocalDatabase } = await import("@/lib/local-database");
    await openLocalDatabase();
    const { nadaDb } = await import("@/lib/db");

    const keys = await nadaDb.groupKeys.toArray();
    expect(keys).toHaveLength(2);
    expect(keys.map((key) => [key.groupId, key.epoch, key.senderKey]).sort()).toEqual([
      ["chat-1", 1, "GROUP-KEY-1"],
      ["chat-2", 1, "GROUP-KEY-2"]
    ]);
  });

  it("keeps messages, contacts, chats and settings", async () => {
    await seedLegacyDatabase();
    vi.resetModules();

    const { openLocalDatabase } = await import("@/lib/local-database");
    await openLocalDatabase();
    const { nadaDb } = await import("@/lib/db");

    expect(await nadaDb.messages.count()).toBe(2);
    expect(await nadaDb.contacts.count()).toBe(1);
    expect(await nadaDb.chats.count()).toBe(1);
    expect((await nadaDb.settings.get("displayName"))?.value).toBe("Ghost");
  });

  it("reaches the current schema version", async () => {
    await seedLegacyDatabase();
    vi.resetModules();

    const { openLocalDatabase } = await import("@/lib/local-database");
    await openLocalDatabase();
    const { nadaDb } = await import("@/lib/db");

    expect(nadaDb.verno).toBe(9);
    expect(nadaDb.tables.map((table) => table.name)).toContain("prekeys");
  });

  it("upgrades a pre-epoch database that never created a group key", async () => {
    // The `groupKeys` store exists from version 3 onwards even when empty, so
    // this device was broken too despite having nothing to migrate.
    await seedLegacyDatabase({ groupKeys: false });
    vi.resetModules();

    const { openLocalDatabase } = await import("@/lib/local-database");
    const result = await openLocalDatabase();

    expect(result.ok).toBe(true);
    const { nadaDb } = await import("@/lib/db");
    expect(await nadaDb.groupKeys.count()).toBe(0);
    expect(await nadaDb.identity.count()).toBe(1);
  });
});

describe("post-epoch database", () => {
  it("still opens, and keeps both of its epochs", async () => {
    // Devices that installed after version 8 hold the compound key already.
    // A fix that repaired them "back" would break the working population.
    await seedPostEpochDatabase();

    const { openLocalDatabase } = await import("@/lib/local-database");
    const result = await openLocalDatabase();
    expect(result.ok).toBe(true);

    const { nadaDb } = await import("@/lib/db");
    const keys = await nadaDb.groupKeys.toArray();
    expect(keys.map((key) => key.epoch).sort()).toEqual([1, 2]);
  });
});

describe("fresh install", () => {
  it("opens an empty database with no identity", async () => {
    const { openLocalDatabase } = await import("@/lib/local-database");
    const result = await openLocalDatabase();

    expect(result.ok).toBe(true);
    const { nadaDb, primaryIdentityId } = await import("@/lib/db");
    expect(await nadaDb.identity.get(primaryIdentityId)).toBeUndefined();
  });

  it("does not leave a database behind when there was none to repair", async () => {
    const { repairLegacyGroupKeys } = await import("@/lib/local-database");
    expect(await repairLegacyGroupKeys()).toBe("not-needed");
  });
});

describe("repair idempotency", () => {
  it("is a no-op when run twice", async () => {
    await seedLegacyDatabase();
    vi.resetModules();

    const { repairLegacyGroupKeys } = await import("@/lib/local-database");
    expect(await repairLegacyGroupKeys()).toBe("repaired");
    expect(await repairLegacyGroupKeys()).toBe("not-needed");

    const { openLocalDatabase } = await import("@/lib/local-database");
    expect((await openLocalDatabase()).ok).toBe(true);
    const { nadaDb } = await import("@/lib/db");
    expect(await nadaDb.groupKeys.count()).toBe(2);
  });

  it("survives a repair that is interrupted before Dexie opens", async () => {
    // Simulates the tab being closed between the repair and the upgrade: the
    // next launch must finish the job rather than find a half-converted store.
    await seedLegacyDatabase();
    vi.resetModules();

    const first = await import("@/lib/local-database");
    expect(await first.repairLegacyGroupKeys()).toBe("repaired");

    vi.resetModules();
    const second = await import("@/lib/local-database");
    const result = await second.openLocalDatabase();

    expect(result.ok).toBe(true);
    const { nadaDb } = await import("@/lib/db");
    expect(await nadaDb.groupKeys.count()).toBe(2);
    expect(await nadaDb.identity.count()).toBe(1);
  });
});

describe("the repair is load-bearing", () => {
  it("Dexie alone cannot open a pre-epoch database", async () => {
    // The negative control. If this ever starts passing, either Dexie gained
    // support for changing a primary key or the schema stopped needing it —
    // and only then is repairLegacyGroupKeys safe to delete.
    await seedLegacyDatabase();
    vi.resetModules();

    const { nadaDb } = await import("@/lib/db");
    await expect(nadaDb.open()).rejects.toThrow(/primary key/i);
  });
});

describe("failure paths", () => {
  it("reports a blocked upgrade instead of waiting forever", async () => {
    // A connection that ignores `versionchange` — an old page the browser has
    // frozen, or a tab left open across a deploy. The upgrade request then
    // fires `blocked` and never settles on its own, which is exactly how the
    // splash screen became permanent. (A Dexie-held connection closes itself,
    // so it is deliberately not what this simulates.)
    await seedLegacyDatabase();
    const holder = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("nada-local");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    vi.resetModules();

    try {
      const { openLocalDatabase } = await import("@/lib/local-database");
      const result = await openLocalDatabase();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("blocked");
      expect(result.message).toMatch(/another nada tab/i);
    } finally {
      holder.close();
    }
  });

  it("still opens a database written by a newer build", async () => {
    // Dexie adopts a higher native version rather than refusing, which is the
    // behaviour we want: a user who briefly ran a newer build is not locked
    // out of the older one.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("nada-local", 200);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("identity", { keyPath: "id" });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    vi.resetModules();

    const { openLocalDatabase } = await import("@/lib/local-database");
    expect((await openLocalDatabase()).ok).toBe(true);
  });

  it("classifies every Dexie failure the recovery screen has to explain", async () => {
    const { classifyDatabaseError } = await import("@/lib/local-database");
    const cases: Array<[string, string, string]> = [
      ["VersionError", "The requested version is less than the existing version", "version-mismatch"],
      ["UpgradeError", "Not yet support for changing primary key", "upgrade-failed"],
      ["ConstraintError", "Key already exists in the object store", "upgrade-failed"],
      ["AbortError", "The transaction was aborted", "upgrade-failed"],
      ["InvalidStateError", "The database connection is closing", "storage-unavailable"],
      ["QuotaExceededError", "The quota has been exceeded", "quota-exceeded"],
      ["UnknownError", "Internal error opening backing store", "storage-unavailable"],
      ["BlockedError", "Another tab is holding the database open", "blocked"]
    ];
    for (const [name, message, expected] of cases) {
      const error = new Error(message);
      error.name = name;
      expect(classifyDatabaseError(error).reason).toBe(expected);
      // The message shown to a user must never be the raw browser string.
      expect(classifyDatabaseError(error).message).not.toBe(message);
    }
  });

  it("reports unavailable storage rather than throwing", async () => {
    // Private-browsing windows and locked-down enterprise profiles.
    const original = globalThis.indexedDB;
    // @ts-expect-error deliberately removing the API the way a browser can
    delete globalThis.indexedDB;
    try {
      const { openLocalDatabase } = await import("@/lib/local-database");
      const result = await openLocalDatabase();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("storage-unavailable");
    } finally {
      globalThis.indexedDB = original;
    }
  });

  it("salvages a corrupted group key row instead of losing the account", async () => {
    // One unusable row must not cost a user their identity and history.
    await seedLegacyDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("nada-local");
      request.onsuccess = () => {
        const db = request.result;
        const store = db.transaction("groupKeys", "readwrite").objectStore("groupKeys");
        store.put({ groupId: "chat-3", senderKey: null, createdAt: 7 });
        store.transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        store.transaction.onerror = () => reject(store.transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
    vi.resetModules();

    const { openLocalDatabase } = await import("@/lib/local-database");
    const result = await openLocalDatabase();
    expect(result.ok).toBe(true);

    const { nadaDb } = await import("@/lib/db");
    expect(await nadaDb.identity.count()).toBe(1);
    expect(await nadaDb.messages.count()).toBe(2);
  });

  it("never records key material in its diagnostics", async () => {
    // These lines are the ones most likely to be pasted into a support thread.
    await seedLegacyDatabase();
    vi.resetModules();

    const { openLocalDatabase, formatDiagnostics } = await import("@/lib/local-database");
    await openLocalDatabase();
    const text = formatDiagnostics();

    expect(text).not.toContain("GROUP-KEY-1");
    expect(text).not.toContain("GROUP-KEY-2");
    expect(text).not.toContain(IDENTITY.localPrivateKey);
    expect(text).not.toContain(IDENTITY.encryptedPrivateKey);
    expect(text).not.toContain(IDENTITY.pubkeyHash);
    // It still has to be useful.
    expect(text).toMatch(/converting groupKeys/);
    expect(text).toMatch(/2 row\(s\)/);
  });
});

describe("destructive recovery", () => {
  it("deletes the database only when asked", async () => {
    await seedLegacyDatabase();
    vi.resetModules();

    const { openLocalDatabase, deleteLocalDatabase, resetOpenAttempt } = await import(
      "@/lib/local-database"
    );
    await openLocalDatabase();
    const { nadaDb } = await import("@/lib/db");
    expect(await nadaDb.identity.count()).toBe(1);

    expect(await deleteLocalDatabase()).toBe(true);
    resetOpenAttempt();

    const reopened = await openLocalDatabase();
    expect(reopened.ok).toBe(true);
    expect(await nadaDb.identity.count()).toBe(0);
  });
});
