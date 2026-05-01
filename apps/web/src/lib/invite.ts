import {
  GroupInvitePayloadSchema,
  InvitePayloadSchema,
  type GroupInvitePayload,
  type InvitePayload
} from "@nada/types";

function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(token: string): string {
  const padded = token.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(token.length / 4) * 4,
    "="
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function createInviteToken(payload: InvitePayload): string {
  return encodeBase64Url(JSON.stringify(payload));
}

export function createGroupInviteToken(payload: GroupInvitePayload): string {
  return encodeBase64Url(JSON.stringify(payload));
}

export function parseInviteToken(token: string): InvitePayload | null {
  try {
    const rawPayload: unknown = JSON.parse(decodeBase64Url(token.trim()));
    const result = InvitePayloadSchema.safeParse(rawPayload);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function parseGroupInviteToken(
  token: string
): GroupInvitePayload | null {
  try {
    const rawPayload: unknown = JSON.parse(decodeBase64Url(token.trim()));
    const result = GroupInvitePayloadSchema.safeParse(rawPayload);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function parseInviteInput(input: string): InvitePayload | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get("n");
    return token ? parseInviteToken(token) : null;
  } catch {
    return parseInviteToken(trimmed);
  }
}

export function parseGroupInviteInput(
  input: string
): GroupInvitePayload | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get("g");
    return token ? parseGroupInviteToken(token) : null;
  } catch {
    return parseGroupInviteToken(trimmed);
  }
}

export function buildInviteUrl(origin: string, payload: InvitePayload): string {
  const url = new URL("/invite", origin);
  url.searchParams.set("n", createInviteToken(payload));
  return url.toString();
}

export function buildGroupInviteUrl(
  origin: string,
  payload: GroupInvitePayload
): string {
  const url = new URL("/invite", origin);
  url.searchParams.set("g", createGroupInviteToken(payload));
  return url.toString();
}
