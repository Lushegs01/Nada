// Admin client for the contest engine.
//
// Contest administration reuses NADA's one identity system: an admin proves
// control of an Ed25519 key, exactly as every other privileged call does, and
// the relay decides whether that key is allow-listed. There is no admin
// password, no session token, and no second credential to leak.
//
// Each proof binds the action and the contest it targets, so a proof captured
// while freezing one contest cannot be replayed to finalize another.
import { buildIdentityProof } from "@nada/crypto";

import { postJsonWithError, type Contest, type ContestStatus } from "@/lib/contest";

export interface AdminIdentity {
  pubkey: string;
  pubkeyHash: string;
  /** base64 (libsodium ORIGINAL). Never leaves the device. */
  privateKey: string;
}

export interface AdminContestRow {
  id: string;
  name: string;
  slug: string;
  status: ContestStatus;
  startAtMs: number;
  endAtMs: number;
  entryFeeMinor: number;
  entryCurrency: string;
  prizeAmountMinor: number;
  prizeCurrency: string;
  rulesVersion: number;
}

export interface AdminStats {
  participants: number;
  activeParticipants: number;
  totalEvents: number;
  validEvents: number;
  suspiciousEvents: number;
  rejectedEvents: number;
  pointsAwarded: number;
  openRiskFlags: number;
  entryRevenueMinor: number;
}

export interface AdminWinner {
  participantPubkeyHash: string;
  rank: number;
  finalScore: number;
  prizeAmountMinor: number;
  prizeCurrency: string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy: string | null;
  payoutReference: string | null;
  payoutStatus: "PENDING" | "PAID" | "FAILED";
  payoutNote: string;
}

export interface AdminParticipant {
  pubkeyHash: string;
  displayName: string;
  joinedAtMs: number;
  paymentStatus: string;
  eligibilityStatus: string;
  riskStatus: string;
  riskScore: number;
  currentScore: number;
  finalScore: number | null;
  finalRank: number | null;
  events: number;
  lastActiveAtMs: number | null;
  disqualificationReason: string | null;
}

export interface AdminEvent {
  id: string;
  participantPubkeyHash: string;
  actorPubkeyHash: string;
  eventType: string;
  label: string;
  sourceEntityType: string;
  sourceEntityId: string;
  pointsAwarded: number;
  qualificationStatus: string;
  rejectionReason: string | null;
  riskScore: number;
  occurredAtMs: number;
}

export interface AdminRiskEvent {
  id: string;
  participantPubkeyHash: string;
  actorPubkeyHash: string | null;
  eventId: string | null;
  riskType: string;
  severity: string;
  score: number;
  evidence: Record<string, unknown>;
  createdAtMs: number;
  resolvedAtMs: number | null;
  resolution: string | null;
}

export interface AdminLedgerEntry {
  id: string;
  eventId: string | null;
  points: number;
  direction: "CREDIT" | "DEBIT";
  category: string;
  reason: string;
  createdAtMs: number;
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  actorPubkeyHash: string;
  target: string | null;
  reason: string;
  createdAtMs: number;
  before: unknown;
  after: unknown;
}

async function proof(
  identity: AdminIdentity,
  action: string,
  contestId: string | null
): Promise<Record<string, unknown>> {
  const payload = await buildIdentityProof({
    privateKeyBase64: identity.privateKey,
    pubkey: identity.pubkey,
    pubkeyHash: identity.pubkeyHash,
    context: "contest-admin",
    binding: `${action}:${contestId ?? "global"}`
  });
  return { pubkeyHash: identity.pubkeyHash, proof: payload };
}

async function call<T>(
  path: string,
  identity: AdminIdentity,
  action: string,
  contestId: string | null,
  body: Record<string, unknown> = {}
): Promise<{ data: T | null; error: string | null }> {
  const auth = await proof(identity, action, contestId);
  return postJsonWithError<T>(path, { ...auth, ...body });
}

export async function adminWhoami(
  identity: AdminIdentity
): Promise<{ admin: boolean; error: string | null }> {
  const { data, error } = await call<{ admin: boolean }>(
    "/api/v1/contests/admin/whoami",
    identity,
    "whoami",
    null
  );
  return { admin: data?.admin === true, error };
}

export async function adminListContests(
  identity: AdminIdentity
): Promise<AdminContestRow[]> {
  const { data } = await call<{ contests: AdminContestRow[] }>(
    "/api/v1/contests/admin/list",
    identity,
    "list",
    null
  );
  return data?.contests ?? [];
}

export interface CreateContestInput {
  name: string;
  slug: string;
  description: string;
  startAt: number;
  endAt: number;
  registrationEndAt?: number;
  entryFeeMinor: number;
  entryCurrency: string;
  prizeAmountMinor: number;
  prizeCurrency: string;
}

export async function adminCreateContest(
  identity: AdminIdentity,
  input: CreateContestInput
): Promise<{ data: { contest: AdminContestRow } | null; error: string | null }> {
  return call("/api/v1/contests/admin/create", identity, "create", null, { ...input });
}

export type AdminTransition =
  | "publish"
  | "activate"
  | "freeze"
  | "reconcile"
  | "finalize"
  | "cancel";

export async function adminTransition(
  identity: AdminIdentity,
  contestId: string,
  transition: AdminTransition,
  reason: string
): Promise<{ error: string | null; reconciled?: { scanned: number; recorded: number } }> {
  const { data, error } = await call<{
    reconciled?: { scanned: number; recorded: number };
  }>(`/api/v1/contests/admin/${contestId}/${transition}`, identity, transition, contestId, {
    contestId,
    reason
  });
  return { error, ...(data?.reconciled ? { reconciled: data.reconciled } : {}) };
}

export async function adminOverview(
  identity: AdminIdentity,
  contestId: string
): Promise<{
  contest: Contest & AdminContestRow;
  stats: AdminStats;
  winners: AdminWinner[];
  ruleVersions: Array<{ version: number; note: string; createdAt: number; createdBy: string }>;
  metrics: Record<string, number | Record<string, number>>;
} | null> {
  const { data } = await call<{
    contest: Contest & AdminContestRow;
    stats: AdminStats;
    winners: AdminWinner[];
    ruleVersions: Array<{ version: number; note: string; createdAt: number; createdBy: string }>;
    metrics: Record<string, number | Record<string, number>>;
  }>(`/api/v1/contests/admin/${contestId}/overview`, identity, "overview", contestId, {
    contestId,
    reason: ""
  });
  return data;
}

export async function adminParticipants(
  identity: AdminIdentity,
  contestId: string,
  limit = 50,
  offset = 0
): Promise<AdminParticipant[]> {
  const { data } = await call<{ participants: AdminParticipant[] }>(
    `/api/v1/contests/admin/${contestId}/participants`,
    identity,
    "participants",
    contestId,
    { contestId, limit, offset }
  );
  return data?.participants ?? [];
}

export interface ParticipantInvestigation {
  participant: AdminParticipant;
  cachedScore: number;
  ledgerScore: number;
  breakdown: Array<{ category: string; points: number }>;
  events: AdminEvent[];
  risk: AdminRiskEvent[];
  ledger: AdminLedgerEntry[];
}

export async function adminParticipant(
  identity: AdminIdentity,
  contestId: string,
  participantPubkeyHash: string
): Promise<ParticipantInvestigation | null> {
  const { data } = await call<ParticipantInvestigation>(
    `/api/v1/contests/admin/${contestId}/participant`,
    identity,
    "participant",
    contestId,
    { contestId, participantPubkeyHash }
  );
  return data;
}

export async function adminRisk(
  identity: AdminIdentity,
  contestId: string,
  limit = 50
): Promise<AdminRiskEvent[]> {
  const { data } = await call<{ risk: AdminRiskEvent[] }>(
    `/api/v1/contests/admin/${contestId}/risk`,
    identity,
    "risk",
    contestId,
    { contestId, limit, offset: 0 }
  );
  return data?.risk ?? [];
}

export async function adminReview(
  identity: AdminIdentity,
  contestId: string,
  participantPubkeyHash: string,
  action: "clear" | "flag" | "disqualify" | "reinstate" | "release_held_events",
  reason: string
): Promise<{ error: string | null }> {
  const { error } = await call(
    `/api/v1/contests/admin/${contestId}/review`,
    identity,
    "review",
    contestId,
    { contestId, participantPubkeyHash, action, reason }
  );
  return { error };
}

export async function adminApproveWinner(
  identity: AdminIdentity,
  contestId: string,
  participantPubkeyHash: string,
  decision: "approve" | "reject",
  reason: string
): Promise<{ error: string | null }> {
  const { error } = await call(
    `/api/v1/contests/admin/${contestId}/winner/approve`,
    identity,
    "winner-approve",
    contestId,
    { contestId, participantPubkeyHash, decision, reason }
  );
  return { error };
}

export async function adminRecordPayout(
  identity: AdminIdentity,
  contestId: string,
  participantPubkeyHash: string,
  payoutReference: string,
  payoutStatus: "PAID" | "FAILED",
  note: string
): Promise<{ error: string | null }> {
  const { error } = await call(
    `/api/v1/contests/admin/${contestId}/payout`,
    identity,
    "payout",
    contestId,
    { contestId, participantPubkeyHash, payoutReference, payoutStatus, note }
  );
  return { error };
}

export async function adminAudit(
  identity: AdminIdentity,
  contestId: string,
  limit = 50
): Promise<AdminAuditEntry[]> {
  const { data } = await call<{ audit: AdminAuditEntry[] }>(
    `/api/v1/contests/admin/${contestId}/audit`,
    identity,
    "audit",
    contestId,
    { contestId, limit, offset: 0 }
  );
  return data?.audit ?? [];
}
