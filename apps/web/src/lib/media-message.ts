import type { MessageRecord } from "@nada/db";
import {
  MediaAttachmentSchema,
  MessagePayloadSchema,
  type MediaAttachment,
  type MessageKind,
  type MessagePayload,
  type ReplyToMessage,
  type WhisperMention
} from "@nada/types";

export const MESSAGE_PAYLOAD_PREFIX = "__nada_payload_v1__:";

export function encodeMessagePayload(payload: MessagePayload): string {
  return `${MESSAGE_PAYLOAD_PREFIX}${JSON.stringify(
    MessagePayloadSchema.parse(payload)
  )}`;
}

export function decodeMessagePayload(body: string): MessagePayload | null {
  if (!body.startsWith(MESSAGE_PAYLOAD_PREFIX)) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(body.slice(MESSAGE_PAYLOAD_PREFIX.length));
    const result = MessagePayloadSchema.safeParse(payload);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function classifyMimeType(mimeType: string): MessageKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

export function messageKindFromRecord(message: MessageRecord): MessageKind {
  const payload = decodeMessagePayload(message.body);
  return payload?.type ?? message.kind;
}

export function mediaFromMessage(message: MessageRecord): MediaAttachment | null {
  const payload = decodeMessagePayload(message.body);
  if (!payload?.media) {
    return null;
  }

  const result = MediaAttachmentSchema.safeParse(payload.media);
  return result.success ? result.data : null;
}

/** Who a message tags, read from its decrypted payload. */
export function mentionsFromBody(body: string): WhisperMention[] {
  return decodeMessagePayload(body)?.mentions ?? [];
}

/** Whether a message tags `pubkeyHash`. */
export function bodyTags(body: string, pubkeyHash: string): boolean {
  return mentionsFromBody(body).some((mention) => mention.pubkeyHash === pubkeyHash);
}

/**
 * A message body ready to forward as the forwarder's own message.
 *
 * Forwarding re-sends the stored body, which carries the original reply quote,
 * the original sender's name and their tags. Sent on as-is, the target chat
 * would see a quote of a conversation it was never in, the original author's
 * name on the forwarder's message, and tags of people who may not be there.
 * Those are dropped; `senderName` restamps the forwarder for a group.
 */
export function forwardedBody(body: string, senderName?: string): string {
  const payload = decodeMessagePayload(body);
  if (!payload) return body;
  const content: MessagePayload = { ...payload };
  delete content.mentions;
  delete content.replyTo;
  delete content.senderName;
  return encodeMessagePayload({ ...content, ...(senderName ? { senderName } : {}) });
}

export function textFromMessage(message: MessageRecord): string {
  const payload = decodeMessagePayload(message.body);
  return payload?.text ?? message.body;
}

export function previewForMessage(message: MessageRecord, myPubkeyHash?: string): string {
  if (message.deletedAt) return "This message was deleted";

  const payload = decodeMessagePayload(message.body);
  const type = payload?.type ?? message.kind;
  const media = payload?.media;
  let preview = "";

  switch (type) {
    case "image":
      preview = "📷 Photo";
      break;
    case "video":
      preview = "🎥 Video";
      break;
    case "audio":
      preview = media?.fileName ? `🎵 ${media.fileName}` : "🎵 Audio";
      break;
    case "voice_note":
      preview = "🎙 Voice note";
      break;
    case "file":
      preview = media?.fileName ? `📎 ${media.fileName}` : "📎 Document";
      break;
    case "call":
      preview = "📞 Call";
      break;
    case "poll":
      preview = payload?.poll ? `📊 ${payload.poll.question}` : "📊 Poll";
      break;
    case "system":
      preview = payload?.text ?? "System message";
      break;
    case "text":
    default: {
      const text = payload?.text ?? message.body;
      preview = text;
      break;
    }
  }

  if (message.status === "failed") {
    return "Message failed to send";
  }

  if (message.editedAt && type === "text") {
    preview += " (edited)";
  }

  const isMe = myPubkeyHash && message.senderPubkeyHash === myPubkeyHash;
  if (isMe && type !== "system") {
    return `You: ${preview}`;
  }

  return preview;
}

export function buildReplySnapshot({
  message,
  myPubkeyHash,
  senderName
}: {
  message: MessageRecord;
  myPubkeyHash: string;
  senderName?: string;
}): ReplyToMessage {
  const type = messageKindFromRecord(message);
  const media = mediaFromMessage(message);
  const preview = previewForMessage(message);

  return {
    messageId: message.id,
    senderId: message.senderPubkeyHash,
    senderName:
      senderName ??
      (message.senderPubkeyHash === myPubkeyHash
        ? "You"
        : message.senderPubkeyHash.slice(0, 8)),
    type,
    textPreview: type === "text" || type === "system" ? preview : undefined,
    mediaPreview:
      type === "text" || type === "system"
        ? undefined
        : media?.thumbnailDataUrl ?? media?.thumbnailUrl ?? preview,
    fileName: media?.fileName,
    createdAt: message.createdAt
  };
}

export function buildTextPayload({
  mentions,
  replyTo,
  senderName,
  text
}: {
  /** Groups only: who the text tags, in the order they appear. */
  mentions?: WhisperMention[];
  replyTo?: ReplyToMessage;
  /** Groups only: what the sender calls themselves. */
  senderName?: string;
  text: string;
}): MessagePayload {
  return {
    version: 1,
    type: "text",
    text,
    ...(replyTo ? { replyTo } : {}),
    ...(senderName ? { senderName } : {}),
    ...(mentions && mentions.length > 0 ? { mentions } : {})
  };
}

export function buildMediaPayload({
  media,
  replyTo,
  senderName,
  text,
  type
}: {
  media: MediaAttachment;
  replyTo?: ReplyToMessage;
  /** Groups only: what the sender calls themselves. */
  senderName?: string;
  text?: string;
  type: MessageKind;
}): MessagePayload {
  return {
    version: 1,
    type,
    media,
    ...(text ? { text } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(senderName ? { senderName } : {})
  };
}
