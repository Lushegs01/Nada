import {
  ShareCardPayloadSchema,
  type ShareCardPayload
} from "@nada/types";

export function buildShareCardPayload(payload: ShareCardPayload): ShareCardPayload {
  return ShareCardPayloadSchema.parse(payload);
}

export function buildShareText(payload: ShareCardPayload): string {
  return [
    `${payload.displayName} is on NADA.`,
    "Anonymous messaging. No phone number. No email.",
    payload.inviteUrl
  ].join("\n");
}

export async function shareInviteCard(payload: ShareCardPayload): Promise<boolean> {
  const text = buildShareText(payload);
  if (
    typeof navigator !== "undefined" &&
    "share" in navigator &&
    typeof navigator.share === "function"
  ) {
    await navigator.share({
      text,
      title: "NADA invite"
    });
    return true;
  }

  await navigator.clipboard.writeText(text);
  return false;
}
