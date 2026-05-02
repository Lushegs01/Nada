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
  updatedAt: number;
}

class NadaDexie extends Dexie {
  calls!: Table<CallRecord, string>;
  identity!: Table<IdentityRecord, string>;
  contacts!: Table<ContactRecord, string>;
  chats!: Table<ChatRecord, string>;
  chatPrefs!: Table<ChatPrefRecord, string>;
  encryptedFiles!: Table<EncryptedFileRecord, string>;
  groupKeys!: Table<GroupKeyRecord, string>;
  messages!: Table<MessageRecord, string>;
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
    // Version 5: no store schema changes required — pinnedMessageId / pinnedMessageBody
    // are JSON fields on the existing chatPrefs store.  Existing records default to null
    // via getChatPref(). Bump is a no-op but keeps the version sequence intact.
    this.version(5).stores({});
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
