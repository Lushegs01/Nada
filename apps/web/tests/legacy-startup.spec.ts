import { expect, test, type Page } from "@playwright/test";

test.skip(
  !process.env["PLAYWRIGHT_BASE_URL"],
  "Set PLAYWRIGHT_BASE_URL to run browser E2E tests."
);

/**
 * The returning-user path, in a real browser, against a real IndexedDB.
 *
 * This is the regression test for a bug that a fresh browser profile could not
 * reproduce and therefore shipped: schema version 8 changed the `groupKeys`
 * primary key, IndexedDB does not permit that on an existing store, and every
 * device that had ever created a group key was left on the splash screen
 * forever. New installs were unaffected, which is exactly why it reached
 * production.
 *
 * The seeding below writes the pre-epoch schema by hand — Dexie version 7,
 * native version 70, `groupKeys` keyed on `groupId` — because that is the shape
 * a returning user's phone actually holds.
 */

/**
 * Fixture key material, written to be obviously fake.
 *
 * Realistic base64 blobs here are indistinguishable from a real leaked key —
 * to a secret scanner and to a person skimming the diff — and startup never
 * parses these values, it only stores and reads them back. So they say what
 * they are instead of looking like the thing they are standing in for.
 */
const LEGACY_IDENTITY = {
  id: "primary",
  pubkey: "fixture-public-key-not-a-real-key",
  pubkeyHash: "c".repeat(64),
  encryptedPrivateKey: JSON.stringify({ version: 1, nonce: "n", salt: "s", ciphertext: "c" }),
  localPrivateKey: "fixture-private-key-not-a-real-key",
  seedBackupStatus: "confirmed",
  createdAt: 1_700_000_000_000
};

/** Builds the pre-epoch database exactly as an older NADA build left it. */
async function seedLegacyDatabase(page: Page): Promise<void> {
  // A same-origin document that does not mount the app, so the seed lands
  // before anything tries to open the database. A not-found route is ideal:
  // real HTML, same origin, none of NADA's startup code.
  await page.goto("/__nada-legacy-seed__");

  await page.evaluate(async (identity) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("nada-local", 70);

      request.onupgradeneeded = () => {
        const db = request.result;
        const index = (store: IDBObjectStore, names: string[]): void => {
          for (const name of names) store.createIndex(name, name);
        };

        index(db.createObjectStore("identity", { keyPath: "id" }), [
          "pubkeyHash",
          "createdAt"
        ]);
        index(db.createObjectStore("contacts", { keyPath: "id" }), [
          "pubkeyHash",
          "addedAt",
          "trustStatus"
        ]);
        index(db.createObjectStore("chats", { keyPath: "id" }), ["type", "updatedAt"]);

        const messages = db.createObjectStore("messages", { keyPath: "id" });
        index(messages, ["chatId", "kind", "status", "expiresAt", "createdAt"]);
        messages.createIndex("[chatId+createdAt]", ["chatId", "createdAt"]);
        messages.createIndex("[kind+createdAt]", ["kind", "createdAt"]);

        index(db.createObjectStore("settings", { keyPath: "key" }), ["updatedAt"]);
        index(db.createObjectStore("sessions", { keyPath: "id" }), [
          "contactPubkeyHash",
          "updatedAt"
        ]);
        index(db.createObjectStore("encryptedFiles", { keyPath: "contentHash" }), [
          "createdAt",
          "expiresAt"
        ]);
        index(db.createObjectStore("calls", { keyPath: "id" }), [
          "chatId",
          "status",
          "startedAt"
        ]);
        index(db.createObjectStore("chatPrefs", { keyPath: "chatId" }), ["updatedAt"]);

        // The store at the heart of the bug: keyed on `groupId` alone.
        index(db.createObjectStore("groupKeys", { keyPath: "groupId" }), [
          "createdByPubkeyHash",
          "createdAt"
        ]);
      };

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(
          ["identity", "groupKeys", "messages", "contacts", "chats"],
          "readwrite"
        );
        tx.objectStore("identity").put(identity);
        tx.objectStore("groupKeys").put({
          groupId: "group-legacy",
          senderKey: "fixture-group-sender-key-not-a-real-key",
          createdByPubkeyHash: identity.pubkeyHash,
          createdAt: 1_700_000_000_001
        });
        tx.objectStore("contacts").put({
          id: "contact-legacy",
          pubkeyHash: "d".repeat(64),
          publicKey: "fixture-peer-public-key-not-a-real-key",
          localDisplayName: "Quiet Fox",
          addedAt: 1_700_000_000_002,
          trustStatus: "trusted"
        });
        tx.objectStore("chats").put({
          id: "group-legacy",
          type: "group",
          title: "Study group",
          memberPubkeyHashes: [identity.pubkeyHash, "d".repeat(64)],
          createdAt: 1_700_000_000_001,
          updatedAt: 1_700_000_000_003,
          disappearingTimer: 0
        });
        tx.objectStore("messages").put({
          id: "00000000-0000-4000-8000-00000000abcd",
          chatId: "group-legacy",
          senderPubkeyHash: identity.pubkeyHash,
          recipientPubkeyHash: "d".repeat(64),
          direction: "outbound",
          kind: "text",
          body: "message from before the upgrade",
          encryptedPayload: "ciphertext",
          status: "sent",
          createdAt: 1_700_000_000_004
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, LEGACY_IDENTITY);
}

/** Reads back what survived, through the app's own database connection. */
async function readLocalState(page: Page): Promise<{
  version: number;
  identity: string | null;
  groupKeys: Array<Record<string, unknown>>;
  messages: number;
  contacts: number;
}> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("nada-local");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = <T,>(store: string, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const request = op(db.transaction(store, "readonly").objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

    const identity = await read<{ pubkeyHash?: string } | undefined>("identity", (s) =>
      s.get("primary")
    );
    const groupKeys = await read<
      Array<Record<string, unknown>>
    >("groupKeys", (s) => s.getAll());
    const messages = await read<number>("messages", (s) => s.count());
    const contacts = await read<number>("contacts", (s) => s.count());
    const version = db.version;
    db.close();
    return {
      version,
      identity: identity?.pubkeyHash ?? null,
      groupKeys,
      messages,
      contacts
    };
  });
}

test("a returning user with a pre-epoch database reaches the dashboard", async ({
  page
}) => {
  await seedLegacyDatabase(page);
  await page.goto("/");

  // The whole bug in one assertion: this used to never appear.
  await expect(page.getByPlaceholder(/Search/i).first()).toBeVisible({ timeout: 25_000 });

  // And they must not have been silently dropped back into onboarding.
  await expect(page.getByRole("button", { name: "Enter as a ghost" })).toHaveCount(0);
  await expect(
    page.getByText("NADA couldn't open your local data.")
  ).toHaveCount(0);
});

test("the upgrade keeps the returning user's data", async ({ page }) => {
  await seedLegacyDatabase(page);
  await page.goto("/");
  await expect(page.getByPlaceholder(/Search/i).first()).toBeVisible({ timeout: 25_000 });

  const state = await readLocalState(page);

  expect(state.identity).toBe("c".repeat(64));
  expect(state.messages).toBe(1);
  expect(state.contacts).toBe(1);
  // Converted, not discarded: the pre-epoch key is epoch 1 by definition, and
  // the key material itself has to survive — losing it costs the user the
  // ability to read their own group history.
  expect(state.groupKeys).toEqual([
    {
      groupId: "group-legacy",
      epoch: 1,
      senderKey: "fixture-group-sender-key-not-a-real-key",
      createdByPubkeyHash: "c".repeat(64),
      createdAt: 1_700_000_000_001
    }
  ]);
  // Dexie 9 → native version 90.
  expect(state.version).toBe(90);
});

test("the upgrade survives a reload, and does not run twice", async ({ page }) => {
  await seedLegacyDatabase(page);
  await page.goto("/");
  await expect(page.getByPlaceholder(/Search/i).first()).toBeVisible({ timeout: 25_000 });

  await page.reload();
  await expect(page.getByPlaceholder(/Search/i).first()).toBeVisible({ timeout: 25_000 });

  const state = await readLocalState(page);
  expect(state.groupKeys).toHaveLength(1);
  expect(state.identity).toBe("c".repeat(64));
});

test("a fresh profile still reaches onboarding", async ({ page }) => {
  // The population that was never broken must stay unbroken.
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Enter as a ghost" })).toBeVisible({
    timeout: 25_000
  });
});

test("the service worker cannot pin a user to an old application shell", async ({
  page
}) => {
  // Asserted against the served worker rather than against registration
  // timing: `navigator.serviceWorker.ready` never settles until activation, so
  // waiting on it makes the test hang under load rather than fail. What
  // matters is the policy — a new build must take over immediately instead of
  // waiting for every tab holding the old one to close.
  const response = await page.request.get("/sw.js");
  expect(response.status()).toBe(200);
  const worker = await response.text();

  expect(worker).toMatch(/skipWaiting/);
  expect(worker).toMatch(/clients\.claim|clientsClaim/);
});
