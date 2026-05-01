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

class NadaDexie extends Dexie {
  calls!: Table<CallRecord, string>;
  identity!: Table<IdentityRecord, string>;
  contacts!: Table<ContactRecord, string>;
  chats!: Table<ChatRecord, string>;
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
