// Client for NADA's engagement contest.
//
// Reads that reveal nothing personal (the contest, its rules, the public
// leaderboard) are plain GETs. Everything that names an identity is signed
// with an identity proof, exactly like the Whispers writes — the relay decides
// what a request is allowed to see or do from the proof, never from a field in
// the body.
//
// Nothing here sends a score, a rank, or an eligibility flag. The client
// cannot influence any of them; it renders what the server computed.
import { getRelayHttpBaseUrl } from "@/lib/relay-url";
import { useIdentityStore } from "@/stores/useIdentityStore";
import type { IdentityProofPayload } from "@nada/crypto";

export type ContestStatus =
  | "DRAFT"
  | "REGISTRATION_OPEN"
  | "ACTIVE"
  | "FROZEN"
  | "UNDER_REVIEW"
  | "FINALIZED"
  | "CANCELLED";

export interface ContestScoringRule {
  eventType: string;
  label: string;
  points: number;
  category: string;
}

export interface ContestChallenge {
  id: string;
  label: string;
  description: string;
  period: "daily" | "weekly";
  eventType: string;
  count: number;
  points: number;
}

export interface ContestScoring {
  points: ContestScoringRule[];
  caps: {
    dailyPointsPerParticipant: number;
    perActorPairPoints: number;
    actorPairWindowMs: number;
    perSourceEntityPoints: number;
    dailyEventsPerType: Record<string, number | undefined>;
  };
  diminishing: { fullValueInteractions: number; decay: number; floor: number };
  newIdentity: { windowMs: number; actorMultiplier: number };
  challenges: ContestChallenge[];
  exclusions: { selfInteraction: boolean; blockedEventTypes: string[] };
}

export interface Contest {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: ContestStatus;
  startAt: number;
  endAt: number;
  registrationStartAt: number | null;
  registrationEndAt: number | null;
  entryFeeMinor: number;
  entryCurrency: string;
  prizeAmountMinor: number;
  prizeCurrency: string;
  maxParticipants: number | null;
  rulesVersion: number;
  scoring: ContestScoring;
}

export interface ContestPublicStats {
  participants: number;
  activeParticipants: number;
  validEvents: number;
  pointsAwarded: number;
}

export interface LeaderboardEntry {
  rank: number;
  pubkeyHash: string;
  displayName: string;
  score: number;
  events: number;
}

export interface ContestParticipantView {
  displayName: string;
  joinedAt: number;
  paymentStatus: string;
  eligibilityStatus: string;
  score: number;
  finalScore: number | null;
  finalRank: number | null;
}

export interface MyContestState {
  joined: boolean;
  participant?: ContestParticipantView;
  rank?: number | null;
  pointsToNextRank?: number | null;
  score?: number;
  thisWeek?: number;
  breakdown?: Array<{ category: string; points: number }>;
}

export interface ContestActivityEntry {
  id: string;
  eventType: string;
  label: string;
  category: string;
  points: number;
  status: string;
  reason: string | null;
  sourceEntityType: string;
  sourceEntityId: string;
  occurredAt: number;
}

export function contestRelayConfigured(): boolean {
  return Boolean(getRelayHttpBaseUrl());
}

async function getJson<T>(path: string): Promise<T | null> {
  const base = getRelayHttpBaseUrl();
  if (!base) return null;
  try {
    const response = await fetch(new URL(path, base), { method: "GET" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  const base = getRelayHttpBaseUrl();
  if (!base) return null;
  try {
    const response = await fetch(new URL(path, base), {
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

/** Like postJson, but surfaces the relay's error code so the UI can explain. */
export async function postJsonWithError<T>(
  path: string,
  body: unknown
): Promise<{ data: T | null; error: string | null }> {
  const base = getRelayHttpBaseUrl();
  if (!base) return { data: null, error: "relay_not_configured" };
  try {
    const response = await fetch(new URL(path, base), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code =
        payload && typeof payload === "object" && "code" in payload
          ? String((payload as { code: unknown }).code)
          : `http_${response.status}`;
      return { data: null, error: code };
    }
    return { data: payload as T, error: null };
  } catch {
    return { data: null, error: "network_error" };
  }
}

async function sign(
  context: string,
  binding?: string
): Promise<IdentityProofPayload | null> {
  return useIdentityStore.getState().signProof(context, binding);
}

// ── Public reads ────────────────────────────────────────────────────────────

export async function listContests(): Promise<Contest[]> {
  const data = await getJson<{ contests: Contest[] }>("/api/v1/contests");
  return data?.contests ?? [];
}

export async function fetchContest(
  idOrSlug: string
): Promise<{ contest: Contest; stats: ContestPublicStats } | null> {
  return getJson<{ contest: Contest; stats: ContestPublicStats }>(
    `/api/v1/contests/${encodeURIComponent(idOrSlug)}`
  );
}

export async function fetchLeaderboard(
  idOrSlug: string,
  limit = 10,
  offset = 0
): Promise<LeaderboardEntry[]> {
  const data = await getJson<{ entries: LeaderboardEntry[] }>(
    `/api/v1/contests/${encodeURIComponent(idOrSlug)}/leaderboard?limit=${limit}&offset=${offset}`
  );
  return data?.entries ?? [];
}

// ── Participant actions ─────────────────────────────────────────────────────

export interface JoinResult {
  joined: boolean;
  requiresPayment: boolean;
  checkoutUrl: string | null;
  participant: ContestParticipantView;
}

export async function joinContest(input: {
  contestId: string;
  pubkeyHash: string;
  displayName: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<{ data: JoinResult | null; error: string | null }> {
  const proof = await sign("contest-join", input.contestId);
  if (!proof) return { data: null, error: "identity_locked" };
  return postJsonWithError<JoinResult>(
    `/api/v1/contests/${encodeURIComponent(input.contestId)}/join`,
    {
      contestId: input.contestId,
      pubkeyHash: input.pubkeyHash,
      displayName: input.displayName,
      ...(input.successUrl ? { successUrl: input.successUrl } : {}),
      ...(input.cancelUrl ? { cancelUrl: input.cancelUrl } : {}),
      proof
    }
  );
}

export async function fetchMyContestState(
  contestId: string,
  pubkeyHash: string
): Promise<MyContestState | null> {
  const proof = await sign("contest-me", contestId);
  if (!proof) return null;
  return postJson<MyContestState>(
    `/api/v1/contests/${encodeURIComponent(contestId)}/me`,
    { contestId, pubkeyHash, proof }
  );
}

export async function fetchMyActivity(
  contestId: string,
  pubkeyHash: string,
  limit = 50
): Promise<ContestActivityEntry[]> {
  const proof = await sign("contest-activity", contestId);
  if (!proof) return [];
  const data = await postJson<{ events: ContestActivityEntry[] }>(
    `/api/v1/contests/${encodeURIComponent(contestId)}/me/activity`,
    { contestId, pubkeyHash, limit, proof }
  );
  return data?.events ?? [];
}

// ── Formatting helpers ──────────────────────────────────────────────────────

/**
 * Renders a minor-unit amount. Money crosses the wire as an integer count of
 * the currency's smallest unit, so this is the only place it becomes a decimal.
 */
export function formatMoney(minor: number, currency: string): string {
  const major = minor / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: major % 1 === 0 ? 0 : 2
    }).format(major);
  } catch {
    return `${currency} ${major.toLocaleString()}`;
  }
}

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

export function countdownTo(target: number, now = Date.now()): Countdown {
  const remaining = Math.max(0, target - now);
  return {
    days: Math.floor(remaining / 86_400_000),
    hours: Math.floor((remaining % 86_400_000) / 3_600_000),
    minutes: Math.floor((remaining % 3_600_000) / 60_000),
    seconds: Math.floor((remaining % 60_000) / 1_000),
    expired: remaining === 0
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  content: "Content contribution",
  engagement_received: "Engagement received",
  community: "Community activity",
  challenges: "Challenges",
  adjustment: "Adjustments"
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

const STATUS_LABELS: Record<ContestStatus, string> = {
  DRAFT: "Draft",
  REGISTRATION_OPEN: "Registration open",
  ACTIVE: "Live",
  FROZEN: "Frozen",
  UNDER_REVIEW: "Under review",
  FINALIZED: "Finalized",
  CANCELLED: "Cancelled"
};

export function statusLabel(status: ContestStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** True while a contest is still taking entries. */
export function registrationOpen(contest: Contest, now = Date.now()): boolean {
  if (contest.status !== "REGISTRATION_OPEN" && contest.status !== "ACTIVE") return false;
  if (contest.registrationStartAt !== null && now < contest.registrationStartAt) return false;
  if (contest.registrationEndAt !== null && now >= contest.registrationEndAt) return false;
  return now < contest.endAt;
}
