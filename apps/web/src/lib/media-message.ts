import type { MessageRecord } from "@nada/db";
import {
  MediaAttachmentSchema,
  MessagePayloadSchema,
  type MediaAttachment,
  type MessageKind,
  type MessagePayload,
  type ReplyToMessage
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
  text,
  replyTo
}: {
  text: string;
  replyTo?: ReplyToMessage;
}): MessagePayload {
  return {
    version: 1,
    type: "text",
    text,
    ...(replyTo ? { replyTo } : {})
  };
}

export function buildMediaPayload({
  media,
  type,
  text,
  replyTo
}: {
  media: MediaAttachment;
  type: MessageKind;
  text?: string;
  replyTo?: ReplyToMessage;
}): MessagePayload {
  return {
    version: 1,
    type,
    media,
    ...(text ? { text } : {}),
    ...(replyTo ? { replyTo } : {})
  };
}
