import Dexie, { type Table } from "dexie";

import type {
  CallRecord,
  ChatRecord,
  ContactRecord,
  EncryptedFileRecord,
  GroupKeyRecord,
  IdentityRecord,
  MessageRecord
} from "@nada/db";
import type { PubkeyHash } from "@nada/types";

export interface SettingRecord {
  key: string;
  value: string;
  updatedAt: number;
}

/**
 * A prekey's private half, held only on this device.
 *
 * These are what forward secrecy rests on: when one is deleted, messages
 * encrypted to it stop being decryptable by anyone, including the owner. They
 * are deliberately not derivable from the seed phrase — an identity restored on
 * a new device cannot open messages queued for the old one, which is the
 * property working as intended rather than a defect.
 */
export interface PrekeyRecord {
  id: string;
  kind: "signed" | "one-time";
  publicKey: string;
  privateKey: string;
  createdAt: number;
}

export interface SessionRecord {
  id: string;
  contactPubkeyHash: PubkeyHash;
  sessionState: string;
  createdAt: number;
  updatedAt: number;
}

// ── Chat Preferences (mute / clear / block / pin) ─────────────────────────────
// Stored per-chat per-user in IndexedDB. Zero-knowledge: no server-side storage.

export interface ChatPrefRecord {
  /** chatId (direct or group) */
  chatId: string;
  /** Mute notifications until this timestamp, null = forever, 0 = unmuted */
  mutedUntil: number | null;
  /** Messages created before this timestamp are hidden for the current user */
  clearedAt: number;
  /** Pubkey hashes this user has blocked (only relevant for direct chats) */
  blockedPubkeyHashes: string[];
  /** ID of the pinned message in this chat */
  pinnedMessageId: string | null;
  /** Truncated body of the pinned message (shown in banner) */
  pinnedMessageBody: string | null;
  /** Per-chat custom wallpaper image URL */
  wallpaperUrl?: string;
  /** Locally archive this chat when greater than 0. */
  archivedAt?: number;
  updatedAt: number;
}

class NadaDexie extends Dexie {
  calls!: Table<CallRecord, string>;
  identity!: Table<IdentityRecord, string>;
  contacts!: Table<ContactRecord, string>;
  chats!: Table<ChatRecord, string>;
  chatPrefs!: Table<ChatPrefRecord, string>;
  encryptedFiles!: Table<EncryptedFileRecord, string>;
  /** Keyed by `[groupId, epoch]` — the primary key is compound, not a string. */
  groupKeys!: Table<GroupKeyRecord, [string, number]>;
  messages!: Table<MessageRecord, string>;
  prekeys!: Table<PrekeyRecord, string>;
  settings!: Table<SettingRecord, string>;
  sessions!: Table<SessionRecord, string>;

  constructor() {
    super("nada-local");
    this.version(1).stores({
      identity: "id, pubkeyHash, createdAt",
      contacts: "id, pubkeyHash, addedAt, trustStatus",
      chats: "id, type, updatedAt",
      messages: "id, chatId, [chatId+createdAt], status, expiresAt",
      settings: "key, updatedAt",
      sessions: "id, contactPubkeyHash, updatedAt"
    });
    this.version(2).stores({
      encryptedFiles: "contentHash, createdAt, expiresAt"
    });
    this.version(3).stores({
      calls: "id, chatId, status, startedAt",
      groupKeys: "groupId, createdByPubkeyHash, createdAt"
    });
    this.version(4).stores({
      chatPrefs: "chatId, updatedAt"
    });
    this.version(5).stores({});
    this.version(6).stores({
      messages: "id, chatId, [chatId+createdAt], kind, [kind+createdAt], status, expiresAt"
    });
    this.version(7).stores({
      messages: "id, chatId, [chatId+createdAt], kind, [kind+createdAt], status, expiresAt, createdAt"
    });
    // Group keys become per-epoch. A group holds every epoch it has been given
    // so rotating a key revokes future messages without losing history.
    //
    // ⚠ Do not change this declaration. Changing a primary key is not something
    // IndexedDB supports, and this version already shipped: devices that
    // installed NADA afterwards hold `groupKeys` keyed `[groupId+epoch]`, and
    // Dexie compares the *installed* structure against the declared schema at
    // the installed version. Declaring anything else here makes those devices
    // fail to open — the same way devices predating this version once did.
    //
    // Databases created before this version are converted beneath Dexie, by
    // `repairLegacyGroupKeys` in local-database.ts, which runs before the first
    // open. See that file for why the conversion cannot live in an upgrade
    // callback.
    this.version(8)
      .stores({
        groupKeys: "[groupId+epoch], groupId, createdByPubkeyHash, createdAt"
      })
      .upgrade(async (tx) => {
        // Rows are normally already epoch-stamped by the time this runs, since
        // the pre-Dexie repair has converted them. This remains as a belt for
        // any row that reached the store without an epoch: a compound key
        // cannot be formed from `undefined`, so such a row would be unreadable.
        const table = tx.table<GroupKeyRecord>("groupKeys");
        const existing = await table.toArray();
        const missingEpoch = existing.filter(
          (record) => typeof record.epoch !== "number"
        );
        if (missingEpoch.length === 0) return;
        await table.bulkPut(
          missingEpoch.map((record) => ({ ...record, epoch: record.epoch ?? 1 }))
        );
      });
    this.version(9).stores({
      prekeys: "id, kind, createdAt"
    });
  }
}

export const nadaDb = new NadaDexie();
export const primaryIdentityId = "primary";

export function directChatId(first: PubkeyHash, second: PubkeyHash): string {
  return [first, second].sort().join(":");
}

export async function loadMessagesForChat(
  chatId: string
): Promise<MessageRecord[]> {
  return nadaDb.messages
    .where("[chatId+createdAt]")
    .between([chatId, Dexie.minKey], [chatId, Dexie.maxKey])
    .toArray();
}

export async function markChatAsRead(chatId: string): Promise<void> {
  const unread = await nadaDb.messages
    .where("chatId")
    .equals(chatId)
    .filter((m) => m.direction === "inbound" && !m.readAt)
    .toArray();

  if (unread.length === 0) return;

  const now = Date.now();
  await Promise.all(
    unread.map((m) => nadaDb.messages.update(m.id, { readAt: now }))
  );
}

// ── Chat preference helpers ───────────────────────────────────────────────────

export async function getChatPref(chatId: string): Promise<ChatPrefRecord> {
  const existing = await nadaDb.chatPrefs.get(chatId);
  return existing ?? {
    chatId,
    mutedUntil: 0,
    clearedAt: 0,
    blockedPubkeyHashes: [],
    pinnedMessageId: null,
    pinnedMessageBody: null,
    archivedAt: 0,
    updatedAt: 0
  };
}

export async function setChatPref(
  chatId: string,
  patch: Partial<Omit<ChatPrefRecord, "chatId">>
): Promise<void> {
  const existing = await getChatPref(chatId);
  await nadaDb.chatPrefs.put({
    ...existing,
    ...patch,
    chatId,
    updatedAt: Date.now()
  });
}

export function isMuted(pref: ChatPrefRecord): boolean {
  if (pref.mutedUntil === null) return true; // muted forever
  if (pref.mutedUntil === 0) return false;   // unmuted
  return pref.mutedUntil > Date.now();        // muted until specific time
}

export function isBlocked(pref: ChatPrefRecord, peerPubkeyHash: string): boolean {
  return pref.blockedPubkeyHashes.includes(peerPubkeyHash);
}

// ── Global settings helpers ───────────────────────────────────────────────────

export async function getGlobalSetting(key: string): Promise<string | null> {
  const record = await nadaDb.settings.get(key);
  return record?.value ?? null;
}

export async function setGlobalSetting(key: string, value: string): Promise<void> {
  await nadaDb.settings.put({ key, value, updatedAt: Date.now() });
}
