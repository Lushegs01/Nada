// Client for NADA's public Whispers feed. All writes are authenticated with an
// identity proof (mirrors the status-publish flow) so authorship can't be
// forged; feed/thread/profile queries are unauthenticated public reads, while
// the notification inbox requires a proof because it reveals who interacted
// with you.
import { getRelayHttpBaseUrl } from "@/lib/relay-url";
import { useIdentityStore } from "@/stores/useIdentityStore";
import type {
  WhisperAuthorReflection,
  WhisperDmPrivacy,
  WhisperEcho,
  WhisperFollowEntry,
  WhisperNotification,
  WhisperNotificationKind,
  WhisperProfile,
  WhisperReflection,
  WhisperRippleSource
} from "@/utils/dashboard-types";

export function whispersRelayConfigured(): boolean {
  return Boolean(getRelayHttpBaseUrl());
}

type RelayReflection = {
  authorName: string;
  authorPubkeyHash: string;
  body: string;
  createdAt: number;
  deleted?: boolean;
  id: string;
  likeCount?: number;
  likedByViewer?: boolean;
  parentId?: string;
  replyCount?: number;
  replyToName?: string;
};

type RelayEcho = {
  authorName: string;
  authorPubkeyHash: string;
  body: string;
  createdAt: number;
  echoCount: number;
  echoedByViewer: boolean;
  id: string;
  reflectionCount?: number;
  reflections: RelayReflection[];
  rippleCount: number;
  rippledByViewer: boolean;
  rippleOf?: WhisperRippleSource;
};

type RelayNotification = {
  actorName: string;
  actorPubkeyHash: string;
  createdAt: number;
  echoId?: string;
  id: string;
  kind: WhisperNotificationKind;
  preview: string;
  read: boolean;
  reflectionId?: string;
};

type RelayProfile = {
  avatar?: string;
  bio: string;
  displayName: string;
  dmPrivacy?: WhisperDmPrivacy;
  echoCount: number;
  followedByViewer: boolean;
  followerCount: number;
  followingCount: number;
  institution: string;
  joinedAt: number | null;
  likesReceived: number;
  pubkey?: string;
  pubkeyHash: string;
  reflectionCount: number;
  showActivity: boolean;
  showLikes?: boolean;
};

function mapReflection(reflection: RelayReflection): WhisperReflection {
  return {
    authorHash: reflection.authorPubkeyHash,
    authorName: reflection.authorName,
    body: reflection.body,
    createdAt: reflection.createdAt,
    id: reflection.id,
    likeCount: reflection.likeCount ?? 0,
    likedByMe: reflection.likedByViewer === true,
    replyCount: reflection.replyCount ?? 0,
    ...(reflection.parentId ? { parentId: reflection.parentId } : {}),
    ...(reflection.replyToName ? { replyToName: reflection.replyToName } : {}),
    ...(reflection.deleted ? { deleted: true } : {})
  };
}

function mapEcho(echo: RelayEcho): WhisperEcho {
  const reflections = Array.isArray(echo.reflections)
    ? echo.reflections.map(mapReflection)
    : [];
  return {
    authorHash: echo.authorPubkeyHash,
    authorName: echo.authorName,
    body: echo.body,
    createdAt: echo.createdAt,
    echoCount: echo.echoCount,
    echoedByMe: echo.echoedByViewer,
    id: echo.id,
    reflectionCount: echo.reflectionCount ?? reflections.length,
    reflections,
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

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  const relayBaseUrl = getRelayHttpBaseUrl();
  if (!relayBaseUrl) return null;
  try {
    const response = await fetch(new URL(path, relayBaseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Fetch the global feed as this viewer, or null if the relay is unreachable.
 *  Pass `before` to page older Echoes, `authorPubkeyHash` for a profile timeline. */
export async function queryWhisperFeed(
  viewerPubkeyHash: string,
  limit = 100,
  options: { authorPubkeyHash?: string; before?: number } = {}
): Promise<WhisperEcho[] | null> {
  const data = await postJson<{ echoes?: RelayEcho[] }>("/api/v1/whispers/query", {
    viewerPubkeyHash,
    limit,
    ...(options.before ? { before: options.before } : {}),
    ...(options.authorPubkeyHash ? { authorPubkeyHash: options.authorPubkeyHash } : {})
  });
  if (!data) return null;
  return (data.echoes ?? []).map(mapEcho);
}

/** Page one Echo's threaded replies: newest top-level replies first, each page
 *  carrying every nested descendant of its top-level roots. */
export async function queryWhisperReflections(
  echoId: string,
  viewerPubkeyHash: string,
  limit = 25,
  before?: number
): Promise<{ hasMore: boolean; reflections: WhisperReflection[]; total: number } | null> {
  const data = await postJson<{
    hasMore: boolean;
    reflections: RelayReflection[];
    total: number;
  }>("/api/v1/whispers/reflections/query", {
    echoId,
    viewerPubkeyHash,
    limit,
    ...(before ? { before } : {})
  });
  if (!data) return null;
  return {
    hasMore: data.hasMore,
    reflections: (data.reflections ?? []).map(mapReflection),
    total: data.total
  };
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
  parentId?: string;
  replyToName?: string;
  timestamp: number;
}): Promise<boolean> {
  const proof = await useIdentityStore.getState().signProof("whisper-reflect", input.id);
  if (!proof) return false;
  return post("/api/v1/whispers/reflect", { ...input, proof });
}

export async function deleteReflectionRemote(input: {
  author: string;
  id: string;
}): Promise<boolean> {
  const proof = await useIdentityStore
    .getState()
    .signProof("whisper-reflect-delete", input.id);
  if (!proof) return false;
  return post("/api/v1/whispers/reflect/delete", { ...input, proof });
}

export async function reactRemote(input: {
  echoId: string;
  on: boolean;
  reactor: string;
  reactorName: string;
  timestamp: number;
}): Promise<boolean> {
  const proof = await useIdentityStore.getState().signProof("whisper-echo", input.echoId);
  if (!proof) return false;
  return post("/api/v1/whispers/echo", { ...input, proof });
}

export async function reactReflectionRemote(input: {
  on: boolean;
  reactor: string;
  reactorName: string;
  reflectionId: string;
  timestamp: number;
}): Promise<boolean> {
  const proof = await useIdentityStore
    .getState()
    .signProof("whisper-reflect-react", input.reflectionId);
  if (!proof) return false;
  return post("/api/v1/whispers/reflect/react", { ...input, proof });
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

// ── Profiles & follows ("Ghosts") ───────────────────────────────────────────

export async function queryWhisperProfile(
  pubkeyHash: string,
  viewerPubkeyHash: string
): Promise<WhisperProfile | null> {
  const data = await postJson<{ profile?: RelayProfile }>(
    "/api/v1/whispers/profile/get",
    { pubkeyHash, viewerPubkeyHash }
  );
  if (!data?.profile) return null;
  const profile = data.profile;
  return {
    avatar: profile.avatar ?? "",
    bio: profile.bio,
    displayName: profile.displayName,
    dmPrivacy: profile.dmPrivacy ?? "everyone",
    echoCount: profile.echoCount,
    followedByMe: profile.followedByViewer,
    followerCount: profile.followerCount,
    followingCount: profile.followingCount,
    institution: profile.institution,
    joinedAt: profile.joinedAt,
    likesReceived: profile.likesReceived,
    pubkey: profile.pubkey ?? "",
    pubkeyHash: profile.pubkeyHash,
    reflectionCount: profile.reflectionCount,
    showActivity: profile.showActivity,
    showLikes: profile.showLikes ?? true
  };
}

export async function updateWhisperProfileRemote(input: {
  author: string;
  avatar: string;
  bio: string;
  displayName: string;
  dmPrivacy: WhisperDmPrivacy;
  institution: string;
  showActivity: boolean;
  showLikes: boolean;
  timestamp: number;
}): Promise<boolean> {
  const proof = await useIdentityStore
    .getState()
    .signProof("whisper-profile-update", input.author);
  if (!proof) return false;
  return post("/api/v1/whispers/profile/update", { ...input, proof });
}

/** A profile's authored reflections (public read, newest first). */
export async function queryAuthorReflections(
  pubkeyHash: string,
  viewerPubkeyHash: string,
  limit = 25,
  before?: number
): Promise<WhisperAuthorReflection[] | null> {
  const data = await postJson<{
    reflections?: Array<RelayReflection & { echoAuthorName: string; echoBody: string; echoId: string }>;
  }>("/api/v1/whispers/profile/reflections", {
    pubkeyHash,
    viewerPubkeyHash,
    limit,
    ...(before ? { before } : {})
  });
  if (!data) return null;
  return (data.reflections ?? []).map((reflection) => ({
    ...mapReflection(reflection),
    echoAuthorName: reflection.echoAuthorName,
    echoBody: reflection.echoBody,
    echoId: reflection.echoId
  }));
}

/** Echoes a profile has liked. When reading your own hidden list, a proof is
 *  attached so the relay can authorise it. Returns null when unreachable or
 *  the list is private to you. */
export async function queryLikedEchoes(
  pubkeyHash: string,
  viewerPubkeyHash: string,
  limit = 25,
  before?: number
): Promise<WhisperEcho[] | null> {
  const proof =
    pubkeyHash === viewerPubkeyHash
      ? await useIdentityStore.getState().signProof("whisper-likes-query", pubkeyHash)
      : null;
  const data = await postJson<{ echoes?: RelayEcho[] }>(
    "/api/v1/whispers/profile/likes",
    {
      pubkeyHash,
      viewerPubkeyHash,
      limit,
      ...(before ? { before } : {}),
      ...(proof ? { proof } : {})
    }
  );
  if (!data) return null;
  return (data.echoes ?? []).map(mapEcho);
}

export async function queryFollowList(
  pubkeyHash: string,
  direction: "followers" | "following",
  limit = 100
): Promise<WhisperFollowEntry[] | null> {
  const data = await postJson<{ entries?: WhisperFollowEntry[] }>(
    "/api/v1/whispers/profile/follows",
    { pubkeyHash, direction, limit }
  );
  if (!data) return null;
  return data.entries ?? [];
}

export async function setFollowRemote(input: {
  followee: string;
  follower: string;
  followerName: string;
  on: boolean;
  timestamp: number;
}): Promise<boolean> {
  const proof = await useIdentityStore
    .getState()
    .signProof("whisper-follow", input.followee);
  if (!proof) return false;
  return post("/api/v1/whispers/follow", { ...input, proof });
}

// ── Notification inbox ──────────────────────────────────────────────────────

export async function queryWhisperNotifications(
  recipient: string,
  limit = 50,
  before?: number
): Promise<{ notifications: WhisperNotification[]; unreadCount: number } | null> {
  const proof = await useIdentityStore
    .getState()
    .signProof("whisper-notifications-query", recipient);
  if (!proof) return null;
  const data = await postJson<{
    notifications: RelayNotification[];
    unreadCount: number;
  }>("/api/v1/whispers/notifications/query", {
    recipient,
    limit,
    ...(before ? { before } : {}),
    proof
  });
  if (!data) return null;
  return {
    notifications: (data.notifications ?? []).map((item) => ({
      actorHash: item.actorPubkeyHash,
      actorName: item.actorName,
      createdAt: item.createdAt,
      id: item.id,
      kind: item.kind,
      preview: item.preview,
      read: item.read,
      ...(item.echoId ? { echoId: item.echoId } : {}),
      ...(item.reflectionId ? { reflectionId: item.reflectionId } : {})
    })),
    unreadCount: data.unreadCount
  };
}

export async function markWhisperNotificationsReadRemote(
  recipient: string,
  ids?: string[]
): Promise<boolean> {
  const proof = await useIdentityStore
    .getState()
    .signProof("whisper-notifications-read", recipient);
  if (!proof) return false;
  return post("/api/v1/whispers/notifications/read", {
    recipient,
    timestamp: Date.now(),
    ...(ids && ids.length > 0 ? { ids } : {}),
    proof
  });
}
