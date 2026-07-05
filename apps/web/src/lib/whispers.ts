// Client for NADA's public Whispers feed. All writes are authenticated with an
// identity proof (mirrors the status-publish flow) so authorship can't be
// forged; the feed query is an unauthenticated public read.
import { getRelayHttpBaseUrl } from "@/lib/relay-url";
import { useIdentityStore } from "@/stores/useIdentityStore";
import type { WhisperEcho, WhisperReflection, WhisperRippleSource } from "@/utils/dashboard-types";

export function whispersRelayConfigured(): boolean {
  return Boolean(getRelayHttpBaseUrl());
}

type RelayReflection = {
  authorName: string;
  authorPubkeyHash: string;
  body: string;
  createdAt: number;
  id: string;
};

type RelayEcho = {
  authorName: string;
  authorPubkeyHash: string;
  body: string;
  createdAt: number;
  echoCount: number;
  echoedByViewer: boolean;
  id: string;
  reflections: RelayReflection[];
  rippleCount: number;
  rippledByViewer: boolean;
  rippleOf?: WhisperRippleSource;
};

function mapReflection(reflection: RelayReflection): WhisperReflection {
  return {
    authorHash: reflection.authorPubkeyHash,
    authorName: reflection.authorName,
    body: reflection.body,
    createdAt: reflection.createdAt,
    id: reflection.id
  };
}

function mapEcho(echo: RelayEcho): WhisperEcho {
  return {
    authorHash: echo.authorPubkeyHash,
    authorName: echo.authorName,
    body: echo.body,
    createdAt: echo.createdAt,
    echoCount: echo.echoCount,
    echoedByMe: echo.echoedByViewer,
    id: echo.id,
    reflections: Array.isArray(echo.reflections) ? echo.reflections.map(mapReflection) : [],
    rippleCount: echo.rippleCount,
    rippledByMe: echo.rippledByViewer,
    ...(echo.rippleOf ? { rippleOf: echo.rippleOf } : {})
  };
}

async function post(path: string, body: unknown): Promise<boolean> {
  const relayBaseUrl = getRelayHttpBaseUrl();
  if (!relayBaseUrl) return false;
  try {
    const response = await fetch(new URL(path, relayBaseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Fetch the global feed as this viewer, or null if the relay is unreachable. */
export async function queryWhisperFeed(
  viewerPubkeyHash: string,
  limit = 100
): Promise<WhisperEcho[] | null> {
  const relayBaseUrl = getRelayHttpBaseUrl();
  if (!relayBaseUrl) return null;
  try {
    const response = await fetch(new URL("/api/v1/whispers/query", relayBaseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewerPubkeyHash, limit })
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { echoes?: RelayEcho[] };
    return (data.echoes ?? []).map(mapEcho);
  } catch {
    return null;
  }
}

export async function publishEchoRemote(input: {
  author: string;
  authorName: string;
  body: string;
  id: string;
  timestamp: number;
}): Promise<boolean> {
  const proof = await useIdentityStore.getState().signProof("whisper-publish", input.id);
  if (!proof) return false;
  return post("/api/v1/whispers", { ...input, proof });
}

export async function deleteEchoRemote(input: {
  author: string;
  id: string;
}): Promise<boolean> {
  const proof = await useIdentityStore.getState().signProof("whisper-delete", input.id);
  if (!proof) return false;
  return post("/api/v1/whispers/delete", { ...input, proof });
}

export async function reflectRemote(input: {
  author: string;
  authorName: string;
  body: string;
  echoId: string;
  id: string;
  timestamp: number;
}): Promise<boolean> {
  const proof = await useIdentityStore.getState().signProof("whisper-reflect", input.id);
  if (!proof) return false;
  return post("/api/v1/whispers/reflect", { ...input, proof });
}

export async function reactRemote(input: {
  echoId: string;
  on: boolean;
  reactor: string;
  timestamp: number;
}): Promise<boolean> {
  const proof = await useIdentityStore.getState().signProof("whisper-echo", input.echoId);
  if (!proof) return false;
  return post("/api/v1/whispers/echo", { ...input, proof });
}

export async function rippleRemote(input: {
  author: string;
  authorName: string;
  echoId: string;
  id: string;
  rippleOf: WhisperRippleSource;
  timestamp: number;
}): Promise<boolean> {
  const proof = await useIdentityStore.getState().signProof("whisper-ripple", input.id);
  if (!proof) return false;
  return post("/api/v1/whispers/ripple", { ...input, proof });
}
