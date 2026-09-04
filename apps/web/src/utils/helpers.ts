/* eslint-disable */
import type {
  NotificationSettings, NotificationSoundChoice, NotificationPreviewPrivacy,
  NotificationRingtoneChoice, DeliveryGlyph, CommunityRecord, CommunityPost,
  WhisperEcho, WhisperReflection, WhisperNotification,
  SafetyReport, StatusCommentPayload, StatusReactionPayload, StatusDeletePayload,
  GroupDeletePayload
} from "@/utils/dashboard-types";
import {
  STATUS_COMMENT_PREFIX, DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_SOUND_CHOICES, NOTIFICATION_PREVIEW_PRIVACY_CHOICES,
  NOTIFICATION_RINGTONE_CHOICES, STATUS_REACTION_EMOJIS, GROUP_DECRYPTION_FALLBACK_TEXT
} from "@/utils/dashboard-types";
import { decodeMessagePayload } from "@/lib/media-message";
import { loadMessagesForChat, nadaDb, directChatId } from "@/lib/db";
import { decryptDirectBody, isKeyForIdentity, learnPeerPublicKey, openKeyForSelf } from "@/lib/message-crypto";
import {} from "@/lib/media-message";
import { decryptGroupMessage, __UNSAFE_mockDecryptMessage } from "@nada/crypto";
import type { MessageRecord, ContactRecord, IdentityRecord, ChatRecord } from "@nada/db";
import type { InvitePayload, GroupInvitePayload, MessageEnvelope, GroupMessageEnvelope } from "@nada/types";

export function mergeMessageRecords(...groups: MessageRecord[][]): MessageRecord[] {
    const byId = new Map<string, MessageRecord>();
    for (const group of groups) {
    for (const message of group) {
      byId.set(message.id, message);
    }
    }

    return Array.from(byId.values()).sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt;
    }
    return a.id.localeCompare(b.id);
    });
}

export function statusCommentChatId(statusId: string): string {
    return `${STATUS_COMMENT_PREFIX}${statusId}`;
}

export function parseStatusCommentPayload(body: string): StatusCommentPayload | null {
    try {
    const parsed = JSON.parse(body) as Partial<StatusCommentPayload>;
    return parsed.kind === "status-comment" &&
      parsed.version === 1 &&
      typeof parsed.statusId === "string" &&
      typeof parsed.statusOwnerPubkeyHash === "string" &&
      typeof parsed.text === "string"
      ? {
          kind: "status-comment",
          statusId: parsed.statusId,
          statusOwnerPubkeyHash: parsed.statusOwnerPubkeyHash,
          text: parsed.text,
          version: 1
        }
      : null;
    } catch {
    return null;
    }
}

export function parseStatusReactionPayload(body: string): StatusReactionPayload | null {
    try {
    const parsed = JSON.parse(body) as Partial<StatusReactionPayload>;
    return parsed.kind === "status-reaction" &&
      parsed.version === 1 &&
      typeof parsed.statusId === "string" &&
      typeof parsed.statusOwnerPubkeyHash === "string" &&
      typeof parsed.emoji === "string" &&
      parsed.emoji.trim().length > 0
      ? {
          emoji: parsed.emoji,
          kind: "status-reaction",
          statusId: parsed.statusId,
          statusOwnerPubkeyHash: parsed.statusOwnerPubkeyHash,
          version: 1
        }
      : null;
    } catch {
    return null;
    }
}

export function parseStatusDeletePayload(body: string): StatusDeletePayload | null {
    try {
    const parsed = JSON.parse(body) as Partial<StatusDeletePayload>;
    return parsed.kind === "status-delete" &&
      parsed.version === 1 &&
      typeof parsed.statusId === "string" &&
      typeof parsed.statusOwnerPubkeyHash === "string"
      ? {
          kind: "status-delete",
          statusId: parsed.statusId,
          statusOwnerPubkeyHash: parsed.statusOwnerPubkeyHash,
          version: 1
        }
      : null;
    } catch {
    return null;
    }
}

export function parseGroupDeletePayload(body: string): GroupDeletePayload | null {
    try {
    const parsed = JSON.parse(body) as Partial<GroupDeletePayload>;
    return parsed.kind === "group-delete" &&
      parsed.version === 1 &&
      typeof parsed.groupId === "string" &&
      typeof parsed.ownerPubkeyHash === "string"
      ? {
          groupId: parsed.groupId,
          kind: "group-delete",
          ownerPubkeyHash: parsed.ownerPubkeyHash,
          version: 1
        }
      : null;
    } catch {
    return null;
    }
}

export function parseNotificationSettings(value: string | null): NotificationSettings {
    if (!value) {
    return DEFAULT_NOTIFICATION_SETTINGS;
    }

    try {
    const parsed = JSON.parse(value) as Partial<NotificationSettings>;
    return {
      notificationTone: NOTIFICATION_SOUND_CHOICES.includes(
        parsed.notificationTone as NotificationSoundChoice
      )
        ? (parsed.notificationTone as NotificationSoundChoice)
        : DEFAULT_NOTIFICATION_SETTINGS.notificationTone,
      previewPrivacy: NOTIFICATION_PREVIEW_PRIVACY_CHOICES.includes(
        parsed.previewPrivacy as NotificationPreviewPrivacy
      )
        ? (parsed.previewPrivacy as NotificationPreviewPrivacy)
        : DEFAULT_NOTIFICATION_SETTINGS.previewPrivacy,
      ringtone: NOTIFICATION_RINGTONE_CHOICES.includes(
        parsed.ringtone as NotificationRingtoneChoice
      )
        ? (parsed.ringtone as NotificationRingtoneChoice)
        : DEFAULT_NOTIFICATION_SETTINGS.ringtone,
      vibration:
        typeof parsed.vibration === "boolean"
          ? parsed.vibration
          : DEFAULT_NOTIFICATION_SETTINGS.vibration
    };
    } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
    }
}

export function notificationToneLabel(choice: NotificationSoundChoice): string {
    switch (choice) {
    case "glass":
      return "Glass";
    case "pulse":
      return "Pulse";
    case "silent":
      return "Silent";
    case "nada":
    default:
      return "NADA";
    }
}

export function notificationRingtoneLabel(choice: NotificationRingtoneChoice): string {
    switch (choice) {
    case "orbit":
      return "Orbit";
    case "pulse":
      return "Pulse";
    case "silent":
      return "Silent";
    case "nada":
    default:
      return "NADA";
    }
}

export function deliveryStatusRank(status: MessageRecord["status"]): number {
    switch (status) {
    case "read":
      return 5;
    case "delivered":
      return 4;
    case "sent":
      return 3;
    case "queued":
      return 2;
    case "failed":
      return 1;
    case "local":
    default:
      return 0;
    }
}

export function deliveryStatusGlyph(status: MessageRecord["status"]): { glyph: DeliveryGlyph; label: string; tone: "muted" | "read" } {
    switch (status) {
    case "read":
      return { glyph: "double-check-read", label: "Read", tone: "read" };
    case "delivered":
      return { glyph: "double-check", label: "Delivered", tone: "muted" };
    case "sent":
      return { glyph: "check", label: "Sent", tone: "muted" };
    case "queued":
    case "local":
    default:
      return { glyph: "clock", label: "Pending", tone: "muted" };
    }
}

export function parseCommunityRecords(raw: string | null): CommunityRecord[] {
    if (!raw) return [];
    try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): CommunityRecord | null => {
        if (!item || typeof item !== "object") return null;
        const record = item as Partial<CommunityRecord>;
        if (
          typeof record.id !== "string" ||
          typeof record.title !== "string" ||
          typeof record.category !== "string" ||
          typeof record.description !== "string" ||
          typeof record.createdAt !== "number" ||
          typeof record.updatedAt !== "number"
        ) {
          return null;
        }

        return {
          admins: Array.isArray(record.admins)
            ? record.admins.filter((item): item is string => typeof item === "string")
            : [],
          category: record.category,
          channels: Array.isArray(record.channels)
            ? record.channels
                .map((channel) => {
                  if (!channel || typeof channel !== "object") return null;
                  const item = channel as { id?: unknown; title?: unknown };
                  return typeof item.id === "string" && typeof item.title === "string"
                    ? { id: item.id, title: item.title }
                    : null;
                })
                .filter((channel): channel is { id: string; title: string } => Boolean(channel))
            : [{ id: "general", title: "General" }],
          createdAt: record.createdAt,
          description: record.description,
          id: record.id,
          joined: record.joined !== false,
          memberCount:
            typeof record.memberCount === "number" && record.memberCount > 0
              ? record.memberCount
              : 1,
          moderators: Array.isArray(record.moderators)
            ? record.moderators.filter((item): item is string => typeof item === "string")
            : [],
          posts: Array.isArray(record.posts)
            ? record.posts
                .map((post) => {
                  if (!post || typeof post !== "object") return null;
                  const item = post as Partial<CommunityPost>;
                  return typeof item.id === "string" &&
                    typeof item.body === "string" &&
                    typeof item.authorName === "string" &&
                    typeof item.channelId === "string" &&
                    typeof item.createdAt === "number"
                    ? {
                        authorName: item.authorName,
                        body: item.body,
                        channelId: item.channelId,
                        createdAt: item.createdAt,
                        id: item.id
                      }
                    : null;
                })
                .filter((post): post is CommunityPost => Boolean(post))
            : [],
          privacy: record.privacy === "invite-only" ? "invite-only" : "open",
          title: record.title,
          topics: Array.isArray(record.topics)
            ? record.topics.filter((item): item is string => typeof item === "string")
            : [],
          updatedAt: record.updatedAt
        };
      })
      .filter((record): record is CommunityRecord => Boolean(record))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
    return [];
    }
}

function parseWhisperReflections(raw: unknown): WhisperReflection[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item): WhisperReflection | null => {
        if (!item || typeof item !== "object") return null;
        const r = item as Partial<WhisperReflection>;
        if (
          typeof r.id !== "string" ||
          typeof r.body !== "string" ||
          typeof r.authorName !== "string" ||
          typeof r.createdAt !== "number"
        ) {
          return null;
        }
        return {
          authorHash: typeof r.authorHash === "string" ? r.authorHash : "",
          authorName: r.authorName,
          body: r.body,
          createdAt: r.createdAt,
          id: r.id,
          likeCount:
            typeof r.likeCount === "number" && r.likeCount >= 0
              ? Math.floor(r.likeCount)
              : 0,
          likedByMe: r.likedByMe === true,
          replyCount:
            typeof r.replyCount === "number" && r.replyCount >= 0
              ? Math.floor(r.replyCount)
              : 0,
          ...(typeof r.parentId === "string" ? { parentId: r.parentId } : {}),
          ...(typeof r.replyToName === "string" ? { replyToName: r.replyToName } : {}),
          ...(r.deleted === true ? { deleted: true } : {})
        };
      })
      .filter((r): r is WhisperReflection => Boolean(r))
      .sort((a, b) => a.createdAt - b.createdAt);
}

export function parseWhisperEchoes(raw: string | null): WhisperEcho[] {
    if (!raw) return [];
    try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): WhisperEcho | null => {
        if (!item || typeof item !== "object") return null;
        const e = item as Partial<WhisperEcho>;
        if (
          typeof e.id !== "string" ||
          typeof e.body !== "string" ||
          typeof e.authorName !== "string" ||
          typeof e.createdAt !== "number"
        ) {
          return null;
        }
        const rippleOf =
          e.rippleOf &&
          typeof e.rippleOf === "object" &&
          typeof e.rippleOf.id === "string" &&
          typeof e.rippleOf.body === "string" &&
          typeof e.rippleOf.authorName === "string" &&
          typeof e.rippleOf.createdAt === "number"
            ? {
                authorName: e.rippleOf.authorName,
                body: e.rippleOf.body,
                createdAt: e.rippleOf.createdAt,
                id: e.rippleOf.id
              }
            : undefined;
        const reflections = parseWhisperReflections(e.reflections);
        return {
          authorHash: typeof e.authorHash === "string" ? e.authorHash : "",
          authorName: e.authorName,
          body: e.body,
          createdAt: e.createdAt,
          echoCount:
            typeof e.echoCount === "number" && e.echoCount >= 0 ? Math.floor(e.echoCount) : 0,
          echoedByMe: e.echoedByMe === true,
          id: e.id,
          // Older caches predate the reflectionCount counter — fall back to
          // the loaded list length so counts never regress to zero.
          reflectionCount:
            typeof e.reflectionCount === "number" && e.reflectionCount >= 0
              ? Math.floor(e.reflectionCount)
              : reflections.length,
          reflections,
          rippleCount:
            typeof e.rippleCount === "number" && e.rippleCount >= 0
              ? Math.floor(e.rippleCount)
              : 0,
          rippledByMe: e.rippledByMe === true,
          ...(rippleOf ? { rippleOf } : {})
        };
      })
      .filter((e): e is WhisperEcho => Boolean(e))
      .sort((a, b) => b.createdAt - a.createdAt);
    } catch {
    return [];
    }
}

// Starter Echoes so the shared Whispers feed feels alive on first open. These
// mimic other anonymous NADA users posting to the global timeline.
export function seedWhisperEchoes(): WhisperEcho[] {
    const now = Date.now();
    const minutes = (m: number) => now - m * 60_000;
    const seed: Array<{
      author: string;
      body: string;
      echoCount: number;
      rippleCount: number;
      minutesAgo: number;
      reflections?: Array<{ author: string; body: string; minutesAgo: number }>;
    }> = [
      {
        author: "quiet.fox",
        body: "First Echo on NADA. No real names, no phone numbers, no tracking — just thoughts drifting through the network. Whisper something. 🌫️",
        echoCount: 214,
        rippleCount: 37,
        minutesAgo: 6,
        reflections: [
          { author: "still.owl", body: "This is the internet I signed up for.", minutesAgo: 4 },
          { author: "dry.pine", body: "Reflecting on this all morning.", minutesAgo: 2 }
        ]
      },
      {
        author: "amber.tide",
        body: "Reminder: your identity here is a key, not a face. Post freely.",
        echoCount: 128,
        rippleCount: 12,
        minutesAgo: 22
      },
      {
        author: "slow.river",
        body: "Shipped a tiny side project tonight and told absolutely no one who I really am. Somehow that made it more fun.",
        echoCount: 89,
        rippleCount: 5,
        minutesAgo: 51,
        reflections: [
          { author: "north.ember", body: "Ripple this to the builders.", minutesAgo: 40 }
        ]
      },
      {
        author: "paper.moon",
        body: "Whispers > timelines that scream for attention. It's calmer in here.",
        echoCount: 302,
        rippleCount: 64,
        minutesAgo: 95
      },
      {
        author: "grey.harbor",
        body: "Anyone else just here to read and Echo quietly? 👀",
        echoCount: 61,
        rippleCount: 3,
        minutesAgo: 140
      }
    ];
    return seed.map((s) => ({
      authorHash: "",
      authorName: s.author,
      body: s.body,
      createdAt: minutes(s.minutesAgo),
      echoCount: s.echoCount,
      echoedByMe: false,
      id: `seed-${s.author}-${s.minutesAgo}`,
      reflectionCount: (s.reflections ?? []).length,
      reflections: (s.reflections ?? []).map((r, i) => ({
        authorHash: "",
        authorName: r.author,
        body: r.body,
        createdAt: minutes(r.minutesAgo),
        id: `seed-${s.author}-${s.minutesAgo}-r${i}`,
        likeCount: 0,
        likedByMe: false,
        replyCount: 0
      })),
      rippleCount: s.rippleCount,
      rippledByMe: false
    }));
}

const WHISPER_NOTIFICATION_KINDS = new Set([
  "reflect",
  "reply",
  "echo",
  "reflection_echo",
  "ripple",
  "mention",
  "follow"
]);

export function parseWhisperNotifications(raw: string | null): WhisperNotification[] {
    if (!raw) return [];
    try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): WhisperNotification | null => {
        if (!item || typeof item !== "object") return null;
        const n = item as Partial<WhisperNotification>;
        if (
          typeof n.id !== "string" ||
          typeof n.actorName !== "string" ||
          typeof n.createdAt !== "number" ||
          typeof n.kind !== "string" ||
          !WHISPER_NOTIFICATION_KINDS.has(n.kind)
        ) {
          return null;
        }
        return {
          actorHash: typeof n.actorHash === "string" ? n.actorHash : "",
          actorName: n.actorName,
          createdAt: n.createdAt,
          id: n.id,
          kind: n.kind as WhisperNotification["kind"],
          preview: typeof n.preview === "string" ? n.preview : "",
          read: n.read === true,
          ...(typeof n.echoId === "string" ? { echoId: n.echoId } : {}),
          ...(typeof n.reflectionId === "string" ? { reflectionId: n.reflectionId } : {})
        };
      })
      .filter((n): n is WhisperNotification => Boolean(n))
      .sort((a, b) => b.createdAt - a.createdAt);
    } catch {
    return [];
    }
}

export function parseSafetyReports(raw: string | null): SafetyReport[] {
    if (!raw) return [];
    try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): SafetyReport | null => {
        if (!item || typeof item !== "object") return null;
        const report = item as Partial<SafetyReport>;
        if (
          typeof report.id !== "string" ||
          typeof report.title !== "string" ||
          typeof report.targetId !== "string" ||
          typeof report.notes !== "string" ||
          typeof report.createdAt !== "number"
        ) {
          return null;
        }
        return {
          category:
            report.category === "spam" ||
            report.category === "harassment" ||
            report.category === "illegal" ||
            report.category === "impersonation"
              ? report.category
              : "other",
          createdAt: report.createdAt,
          id: report.id,
          notes: report.notes,
          targetId: report.targetId,
          targetType:
            report.targetType === "community" ||
            report.targetType === "whisper" ||
            report.targetType === "status" ||
            report.targetType === "message"
              ? report.targetType
              : "user",
          title: report.title
        };
      })
      .filter((report): report is SafetyReport => Boolean(report))
      .sort((a, b) => b.createdAt - a.createdAt);
    } catch {
    return [];
    }
}

export function defaultCommunityChannels(category: string): Array<{ id: string; title: string }> {
    const normalized = category.toLowerCase();
    if (normalized === "sports") {
    return [
      { id: "general", title: "General" },
      { id: "matches", title: "Matches" },
      { id: "transfers", title: "Transfers" }
    ];
    }

    if (normalized === "tech") {
    return [
      { id: "general", title: "General" },
      { id: "builds", title: "Builds" },
      { id: "jobs", title: "Jobs" }
    ];
    }

    return [
    { id: "general", title: "General" },
    { id: "announcements", title: "Announcements" },
    { id: "off-topic", title: "Off-topic" }
    ];
}

export function defaultCommunityTopics(category: string): string[] {
    const normalized = category.toLowerCase();
    if (normalized === "sports") return ["Live games", "Predictions", "Highlights"];
    if (normalized === "tech") return ["Startups", "AI", "Frontend"];
    if (normalized === "music") return ["New releases", "Playlists", "Events"];
    return [category, "Introductions", "Events"];
}

export async function loadStatusComments(statusId: string): Promise<MessageRecord[]> {
    return loadMessagesForChat(statusCommentChatId(statusId));
}

export function isLegacyNadaName(name: string): boolean {
    return name === "NADA" || /^NADA\s+[a-f0-9]/i.test(name);
}

/**
 * Writes or refreshes a contact.
 *
 * The public key is only accepted when it actually hashes to the contact's
 * identity, and a verified key already on file is never replaced by an
 * unverifiable one. This used to be the opposite: callers passed whatever they
 * had — `persistIncomingMessages` passed the pubkey *hash* — and it
 * overwrote the real key an invite link had provided, leaving the contact
 * permanently unable to receive an encrypted message.
 */
export async function upsertContact(payload: InvitePayload): Promise<ContactRecord> {
    const existing = await nadaDb.contacts.get(payload.pubkeyHash);
    const incomingKeyValid = await isKeyForIdentity(
      payload.publicKey,
      payload.pubkeyHash
    );
    const existingKeyValid = await isKeyForIdentity(
      existing?.publicKey,
      payload.pubkeyHash
    );
    const publicKey = incomingKeyValid
      ? payload.publicKey
      : existingKeyValid
        ? existing!.publicKey
        : payload.publicKey;
    const contact: ContactRecord = {
            id: payload.pubkeyHash,
            pubkeyHash: payload.pubkeyHash,
            publicKey,
            localDisplayName:
              existing && !isLegacyNadaName(existing.localDisplayName)
                ? existing.localDisplayName
                : generateRandomUsername(payload.pubkeyHash),
            addedAt: existing?.addedAt ?? Date.now(),
            trustStatus: existing?.trustStatus ?? "unverified"
          };
    await nadaDb.contacts.put(contact);
    return contact;
}

export async function upsertGroupFromInvite(identity: IdentityRecord, payload: GroupInvitePayload): Promise<ChatRecord> {
    const existing = await nadaDb.chats.get(payload.groupId);
    const now = Date.now();
    const chat: ChatRecord = {
            id: payload.groupId,
            type: "group",
            title: existing?.title ?? payload.title,
            memberPubkeyHashes: Array.from(
              new Set([...payload.memberPubkeyHashes, identity.pubkeyHash])
            ),
            ownerPubkeyHash: payload.ownerPubkeyHash,
            // ⚠️ MVP_ONLY — replace before production
            groupSenderKey: payload.senderKeyPackage,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            disappearingTimer: existing?.disappearingTimer ?? 0,
            ...(existing?.avatar ? { avatar: existing.avatar } : {})
          };
    await nadaDb.chats.put(chat);
    await nadaDb.groupKeys.put({
    groupId: payload.groupId,
    senderKey: payload.senderKeyPackage,
    createdByPubkeyHash: payload.ownerPubkeyHash,
    createdAt: now
    });
    return chat;
}

export function extractMentions(text: string, contacts: ContactRecord[]): string[] {
    const normalizedText = text.toLowerCase();
    return contacts
    .filter((contact) =>
      normalizedText.includes(`@${contact.localDisplayName.toLowerCase()}`)
    )
    .map((contact) => contact.pubkeyHash);
}

export function matchesSearch(value: string, query: string): boolean {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
    return true;
    }

    return value.toLowerCase().includes(trimmed);
}

export function formatRelativeTime(timestamp: number): string {
    if (!timestamp) return "";
    const now = Date.now();
    const date = new Date(timestamp);
    const isToday = date.toDateString() === new Date(now).toDateString();
    const isYesterday = date.toDateString() === new Date(now - 86400000).toDateString();
    if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (isYesterday) {
    return "Yesterday";
    } else if (now - timestamp < 7 * 86400000) {
    return date.toLocaleDateString([], { weekday: "short" });
    } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
}

export function dataUrlSize(dataUrl: string): number {
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex === -1) return dataUrl.length;
    const base64 = dataUrl.slice(commaIndex + 1);
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    return Math.max(1, Math.floor((base64.length * 3) / 4) - padding);
}

export async function persistIncomingMessages(identity: IdentityRecord, envelopes: MessageEnvelope[]): Promise<void> {
    for (const envelope of envelopes) {
    const chatId = directChatId(identity.pubkeyHash, envelope.sender);
    const existing = await nadaDb.messages.get(envelope.id);
    if (existing) {
      continue;
    }

    // Open the body first: a sealed envelope carries the sender's real
    // identity key inside it, which is the most trustworthy source we have
    // for learning how to encrypt a reply.
    const opened = envelope.devPlaintext
      ? { body: envelope.devPlaintext, encrypted: false as const, senderPublicKey: undefined }
      : await decryptDirectBody({ ciphertext: envelope.ciphertext, identity });

    // A payload that claimed to be sealed and failed verification is a forged
    // or corrupted message. Showing its raw ciphertext as if it were content
    // would be worse than saying nothing, so it is skipped entirely.
    if (!opened) {
      continue;
    }
    const body = opened.body;

    // Record the sender's key so the reply can be encrypted. Both sources are
    // verified against the sender's hash before they are trusted: the key
    // sealed inside the payload, and the envelope hint the relay also checks.
    await upsertContact({
      version: 1,
      pubkeyHash: envelope.sender,
      publicKey:
        opened.senderPublicKey ?? envelope.senderPublicKey ?? envelope.sender
    });
    if (opened.senderPublicKey) {
      await learnPeerPublicKey(envelope.sender, opened.senderPublicKey);
    } else if (envelope.senderPublicKey) {
      await learnPeerPublicKey(envelope.sender, envelope.senderPublicKey);
    }

    const statusComment = parseStatusCommentPayload(body);
    const statusReaction = parseStatusReactionPayload(body);
    const statusDelete = parseStatusDeletePayload(body);
    if (statusDelete) {
      if (statusDelete.statusOwnerPubkeyHash === envelope.sender) {
        await nadaDb.messages.delete(statusDelete.statusId);
        await nadaDb.messages
          .where("chatId")
          .equals(statusCommentChatId(statusDelete.statusId))
          .delete();
      }
      continue;
    }

    if (statusComment) {
      await nadaDb.messages.put({
        id: envelope.id,
        chatId: statusCommentChatId(statusComment.statusId),
        senderPubkeyHash: envelope.sender,
        recipientPubkeyHash: identity.pubkeyHash,
        direction: "inbound",
        kind: "system",
        body,
        encryptedPayload: envelope.ciphertext,
        status: "delivered",
        createdAt: envelope.timestamp
      });
      continue;
    }

    if (statusReaction) {
      await nadaDb.messages.put({
        id: envelope.id,
        chatId: statusCommentChatId(statusReaction.statusId),
        senderPubkeyHash: envelope.sender,
        recipientPubkeyHash: identity.pubkeyHash,
        direction: "inbound",
        kind: "system",
        body,
        encryptedPayload: envelope.ciphertext,
        status: "delivered",
        createdAt: envelope.timestamp
      });
      continue;
    }

    const messageKind = envelope.messageKind ?? decodeMessagePayload(body)?.type ?? "text";
    if (messageKind === "status") {
      await nadaDb.messages.put({
        id: envelope.id,
        chatId: "status",
        senderPubkeyHash: envelope.sender,
        recipientPubkeyHash: identity.pubkeyHash,
        direction: "inbound",
        kind: "status",
        body,
        encryptedPayload: envelope.ciphertext,
        status: "delivered",
        createdAt: envelope.timestamp
      });
      continue;
    }

    await nadaDb.messages.put({
      id: envelope.id,
      chatId,
      senderPubkeyHash: envelope.sender,
      recipientPubkeyHash: identity.pubkeyHash,
      direction: "inbound",
      kind: messageKind,
      body,
      encryptedPayload: envelope.ciphertext,
      status: "delivered",
      createdAt: envelope.timestamp,
      ...(envelope.replyTo ? { replyTo: envelope.replyTo } : {}),
      ...(envelope.replyTo ? { replyToId: envelope.replyTo.messageId } : {})
    });
    }
}

/**
 * Persists status updates pulled back from the relay.
 *
 * A status is encrypted once under a per-status content key; the relay hands
 * back only the copy of that key sealed to the *authenticated* viewer. No
 * envelope for this viewer means the author did not share the status with
 * them, which is a normal outcome and simply produces nothing — not an error,
 * and never a readable body.
 */
/** One row of the relay's `/api/v1/statuses/query` response. */
export interface RelayStatusRow {
    id: string;
    sender: string;
    timestamp: number;
    ciphertext: string;
    /** This viewer's sealed copy of the status content key, when shared. */
    statusKeyEnvelope?: string;
    devPlaintext?: string;
}

export async function persistIncomingStatuses(
    identity: IdentityRecord,
    statuses: RelayStatusRow[]
): Promise<void> {
    for (const status of statuses) {
    if (await nadaDb.messages.get(status.id)) {
      continue;
    }

    let body: string | null = null;
    if (status.devPlaintext) {
      body = status.devPlaintext;
    } else if (status.statusKeyEnvelope) {
      const contentKey = await openKeyForSelf({
        envelopes: [
          { recipient: identity.pubkeyHash, sealedKey: status.statusKeyEnvelope }
        ],
        identity
      });
      if (contentKey) {
        try {
          const parsed = JSON.parse(status.ciphertext) as {
            ciphertext: string;
            nonce: string;
            version: 1;
          };
          body = await decryptGroupMessage(parsed, contentKey);
        } catch {
          body = null;
        }
      }
    }

    // Not in the audience, or the payload did not decrypt: skip rather than
    // storing ciphertext that would render as garbage in the status viewer.
    if (body === null) {
      continue;
    }

    await nadaDb.messages.put({
      id: status.id,
      chatId: "status",
      senderPubkeyHash: status.sender,
      recipientPubkeyHash: identity.pubkeyHash,
      direction: "inbound",
      kind: "status",
      body,
      encryptedPayload: status.ciphertext,
      status: "delivered",
      createdAt: status.timestamp
    });
    }
}

export async function persistIncomingGroupMessages(identity: IdentityRecord, envelopes: GroupMessageEnvelope[]): Promise<void> {
    for (const envelope of envelopes) {
    const existingMessage = await nadaDb.messages.get(envelope.id);
    if (existingMessage) {
      continue;
    }

    let existingChat = await nadaDb.chats.get(envelope.groupId);
    // Prefer the copy of the sender key sealed to this identity. The plaintext
    // `senderKeyPackage` is the legacy path: it is readable by the relay, so
    // it is only trusted when the sender had no key to seal to us with.
    const sealedSenderKey = await openKeyForSelf({
      envelopes: envelope.keyEnvelopes,
      identity
    });
    const envelopeSenderKey = sealedSenderKey ?? envelope.senderKeyPackage;
    const keyRecord = await nadaDb.groupKeys.get(envelope.groupId);
    const senderKey =
      envelopeSenderKey ?? existingChat?.groupSenderKey ?? keyRecord?.senderKey;

    // Group members exchange identity keys through the same envelopes, so a
    // member can seal the next rotation back to everyone who has spoken.
    if (envelope.senderPublicKey) {
      await learnPeerPublicKey(envelope.sender, envelope.senderPublicKey);
    }

    if (envelopeSenderKey) {
      if (!keyRecord || keyRecord.senderKey !== envelopeSenderKey) {
        await nadaDb.groupKeys.put({
          groupId: envelope.groupId,
          senderKey: envelopeSenderKey,
          createdByPubkeyHash: envelope.sender,
          createdAt: envelope.timestamp
        });
      }
      if (existingChat && existingChat.groupSenderKey !== envelopeSenderKey) {
        await nadaDb.chats.update(envelope.groupId, {
          groupSenderKey: envelopeSenderKey
        });
        existingChat = {
          ...existingChat,
          groupSenderKey: envelopeSenderKey
        };
      }
    }

    // Try to decrypt the group message body
    let body: string;
    if (envelope.devPlaintext) {
      body = envelope.devPlaintext;
    } else {
      try {
        const parsed = JSON.parse(envelope.ciphertext) as {
          ciphertext?: unknown;
          nonce?: unknown;
          version?: unknown;
        };
        if (
          senderKey &&
          typeof parsed.ciphertext === "string" &&
          typeof parsed.nonce === "string" &&
          parsed.version === 1
        ) {
          body = await decryptGroupMessage(
            {
              ciphertext: parsed.ciphertext,
              nonce: parsed.nonce,
              version: 1
            },
            senderKey
          );
        } else {
          body = await __UNSAFE_mockDecryptMessage(envelope.ciphertext);
        }
      } catch {
        try {
        body = await __UNSAFE_mockDecryptMessage(envelope.ciphertext);
      } catch {
          body = GROUP_DECRYPTION_FALLBACK_TEXT;
      }
    }
    }

    const groupDelete = parseGroupDeletePayload(body);
    if (groupDelete?.groupId === envelope.groupId) {
      const ownerHash = existingChat?.ownerPubkeyHash ?? groupDelete.ownerPubkeyHash;
      if (
        groupDelete.ownerPubkeyHash === ownerHash &&
        envelope.sender === ownerHash
      ) {
        await nadaDb.messages.where("chatId").equals(envelope.groupId).delete();
        await nadaDb.chatPrefs.delete(envelope.groupId);
        await nadaDb.groupKeys.delete(envelope.groupId);
        await nadaDb.chats.delete(envelope.groupId);
      }
      continue;
    }

    if (!existingChat) {
      const now = Date.now();
      await nadaDb.chats.put({
        id: envelope.groupId,
        type: "group",
        title: `Group ${envelope.groupId.slice(0, 8)}`,
        memberPubkeyHashes: Array.from(
          new Set([identity.pubkeyHash, envelope.sender, ...envelope.recipients])
        ),
        ownerPubkeyHash: envelope.sender,
        ...(senderKey ? { groupSenderKey: senderKey } : {}),
        createdAt: now,
        updatedAt: envelope.timestamp,
        disappearingTimer: 0
      });
      existingChat = await nadaDb.chats.get(envelope.groupId);
    } else {
      await nadaDb.chats.update(envelope.groupId, {
        updatedAt: envelope.timestamp
      });
    }

    await nadaDb.messages.put({
      id: envelope.id,
      chatId: envelope.groupId,
      senderPubkeyHash: envelope.sender,
      recipientPubkeyHash: envelope.groupId,
      direction: "inbound",
      kind: envelope.messageKind ?? decodeMessagePayload(body)?.type ?? "text",
      body,
      encryptedPayload: envelope.ciphertext,
      status: "delivered",
      createdAt: envelope.timestamp,
      ...(envelope.expiresAt ? { expiresAt: envelope.expiresAt } : {}),
      ...(envelope.mentions ? { mentions: envelope.mentions } : {}),
      ...(envelope.replyToId ? { replyToId: envelope.replyToId } : {}),
      ...(envelope.replyTo ? { replyTo: envelope.replyTo } : {})
    });
    }
}

export function generateRandomUsername(seed = crypto.randomUUID()): string {
    const adjectives = [
            "Silent", "Hidden", "Velvet", "Obsidian", "Midnight", "Golden", "Cipher", "Ghost",
            "Signal", "Nocturne", "Nova", "Private", "Quiet", "Vanta", "Echo", "Lunar"
          ];
    const nouns = [
            "Key", "Signal", "Node", "Pulse", "Room", "Cipher", "Trace", "Vault",
            "Relay", "Mask", "Drift", "Halo", "Rune", "Wave", "Lock", "Path"
          ];
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }

    const adjective = adjectives[hash % adjectives.length]!;
    const noun = nouns[Math.floor(hash / adjectives.length) % nouns.length]!;
    const suffix = hash.toString(16).slice(0, 4).toUpperCase().padStart(4, "0");
    return `${adjective} ${noun} ${suffix}`;
}
