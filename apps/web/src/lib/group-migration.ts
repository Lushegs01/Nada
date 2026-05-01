import {
  GroupMigrationPayloadSchema,
  type GroupMigrationPayload
} from "@nada/types";
import type { ChatRecord, IdentityRecord } from "@nada/db";

import { buildGroupInviteUrl } from "@/lib/invite";

export function buildGroupMigrationPayload({
  groups,
  identity,
  origin
}: {
  groups: ChatRecord[];
  identity: IdentityRecord;
  origin: string;
}): GroupMigrationPayload {
  return GroupMigrationPayloadSchema.parse({
    version: 1,
    exportedAt: Date.now(),
    ownerPubkeyHash: identity.pubkeyHash,
    groups: groups.map((group) => ({
      groupId: group.id,
      title: group.title,
      memberPubkeyHashes: group.memberPubkeyHashes,
      ...(group.groupSenderKey
        ? {
            inviteUrl: buildGroupInviteUrl(origin, {
              version: 1,
              kind: "group",
              groupId: group.id,
              title: group.title,
              ownerPubkeyHash: group.ownerPubkeyHash ?? identity.pubkeyHash,
              memberPubkeyHashes: group.memberPubkeyHashes,
              // ⚠️ MVP_ONLY — replace before production
              senderKeyPackage: group.groupSenderKey
            })
          }
        : {})
    }))
  });
}

export function parseGroupMigrationPayload(
  text: string
): GroupMigrationPayload | null {
  try {
    const payload: unknown = JSON.parse(text);
    const result = GroupMigrationPayloadSchema.safeParse(payload);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
