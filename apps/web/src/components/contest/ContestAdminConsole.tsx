"use client";

import { cn } from "@nada/ui";
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  CheckCircle2,
  ClipboardList,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Snowflake,
  Trophy,
  Unlock
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { StatTile } from "@/components/contest/ContestPieces";
import { formatMoney, statusLabel, type ContestStatus } from "@/lib/contest";
import {
  adminApproveWinner,
  adminAudit,
  adminCreateContest,
  adminListContests,
  adminOverview,
  adminParticipant,
  adminParticipants,
  adminRecordPayout,
  adminReview,
  adminRisk,
  adminTransition,
  adminWhoami,
  type AdminAuditEntry,
  type AdminContestRow,
  type AdminIdentity,
  type AdminParticipant,
  type AdminRiskEvent,
  type AdminStats,
  type AdminTransition,
  type AdminWinner,
  type ParticipantInvestigation
} from "@/lib/contest-admin";
import { nadaDb, primaryIdentityId } from "@/lib/db";

/**
 * The contest operator console.
 *
 * Two things it deliberately does not do. It does not let an administrator
 * edit a score directly — points move only through the ledger, by reversal or
 * by release, so every number stays explainable. And it does not initiate
 * payouts: NADA holds no payout rail, so a payout is *recorded* against a
 * winner an operator has already paid, which is a durable audit fact rather
 * than a pretend integration.
 *
 * Everything here is gated on an allow-listed identity proving control of its
 * key. Access is checked by the relay on every request, not by this component.
 */

type Panel = "overview" | "participants" | "risk" | "winners" | "audit" | "create";

export function ContestAdminConsole(): JSX.Element {
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [state, setState] = useState<"loading" | "no-identity" | "denied" | "ready">(
    "loading"
  );
  const [contests, setContests] = useState<AdminContestRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("overview");

  useEffect(() => {
    void (async () => {
      const record = await nadaDb.identity.get(primaryIdentityId);
      if (!record?.localPrivateKey) {
        setState("no-identity");
        return;
      }
      const admin: AdminIdentity = {
        pubkey: record.pubkey,
        pubkeyHash: record.pubkeyHash,
        privateKey: record.localPrivateKey
      };
      const { admin: allowed } = await adminWhoami(admin);
      if (!allowed) {
        setState("denied");
        return;
      }
      setIdentity(admin);
      const rows = await adminListContests(admin);
      setContests(rows);
      setSelected(rows[0]?.id ?? null);
      setState("ready");
    })();
  }, []);

  const reloadContests = useCallback(async () => {
    if (!identity) return;
    const rows = await adminListContests(identity);
    setContests(rows);
  }, [identity]);

  if (state === "loading") {
    return (
      <main className="grid min-h-dvh place-items-center bg-nada-bg">
        <Loader2 className="h-5 w-5 animate-spin text-nada-accent" aria-hidden="true" />
      </main>
    );
  }

  if (state !== "ready" || !identity) {
    return (
      <main className="grid min-h-dvh place-items-center bg-nada-bg px-6 text-center">
        <div className="max-w-md">
          <ShieldAlert className="mx-auto mb-4 h-8 w-8 text-nada-secondary/40" aria-hidden="true" />
          <h1 className="text-[18px] font-bold text-nada-primary">
            {state === "no-identity"
              ? "Unlock a NADA identity first"
              : "This identity cannot administer contests"}
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-nada-text-muted">
            {state === "no-identity"
              ? "Contest administration signs every request with your NADA identity key. Open NADA on this device first."
              : "Contest administration is limited to identities the relay operator has allow-listed."}
          </p>
          <Link
            className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-nada-accent/12 px-5 text-[13px] font-bold text-nada-accent"
            href="/"
          >
            Open NADA
          </Link>
        </div>
      </main>
    );
  }

  const active = contests.find((row) => row.id === selected) ?? null;

  return (
    <main className="min-h-dvh bg-nada-bg px-4 py-6 text-nada-primary sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-nada-border/10 pb-5">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-nada-accent">
              <BadgeCheck size={13} aria-hidden="true" />
              Contest administration
            </p>
            <h1 className="mt-1.5 text-[24px] font-bold tracking-tight">
              {active ? active.name : "Contests"}
            </h1>
          </div>
          <select
            aria-label="Select contest"
            className="h-11 rounded-xl border border-nada-border/15 bg-nada-surface-elevated/50 px-3 text-[13px] text-nada-primary"
            onChange={(event) => setSelected(event.target.value || null)}
            value={selected ?? ""}
          >
            {contests.length === 0 ? <option value="">No contests yet</option> : null}
            {contests.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {statusLabel(row.status)}
              </option>
            ))}
          </select>
        </header>

        <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Console sections">
          {(
            [
              ["overview", "Overview", ClipboardList],
              ["participants", "Participants", Trophy],
              ["risk", "Risk", AlertTriangle],
              ["winners", "Winners", BadgeCheck],
              ["audit", "Audit", ClipboardList],
              ["create", "New contest", CheckCircle2]
            ] as Array<[Panel, string, typeof Trophy]>
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              aria-current={panel === id ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-semibold transition",
                panel === id
                  ? "bg-nada-accent/14 text-nada-accent"
                  : "bg-nada-surface-elevated/40 text-nada-text-muted hover:text-nada-primary"
              )}
              onClick={() => setPanel(id)}
              type="button"
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>

        {panel === "create" ? (
          <CreateContestPanel identity={identity} onCreated={reloadContests} />
        ) : !active ? (
          <p className="text-[13px] text-nada-text-muted">
            Create a contest to get started.
          </p>
        ) : panel === "overview" ? (
          <OverviewPanel contest={active} identity={identity} onChanged={reloadContests} />
        ) : panel === "participants" ? (
          <ParticipantsPanel contestId={active.id} identity={identity} />
        ) : panel === "risk" ? (
          <RiskPanel contestId={active.id} identity={identity} />
        ) : panel === "winners" ? (
          <WinnersPanel contest={active} identity={identity} />
        ) : (
          <AuditPanel contestId={active.id} identity={identity} />
        )}
      </div>
    </main>
  );
}

const TRANSITIONS: Array<{
  id: AdminTransition;
  label: string;
  from: ContestStatus[];
  icon: typeof Snowflake;
  tone?: "danger";
}> = [
  { id: "publish", label: "Open registration", from: ["DRAFT"], icon: Unlock },
  { id: "activate", label: "Start scoring", from: ["REGISTRATION_OPEN"], icon: Trophy },
  { id: "freeze", label: "Freeze", from: ["ACTIVE"], icon: Snowflake },
  { id: "reconcile", label: "Reconcile and review", from: ["FROZEN"], icon: RotateCcw },
  { id: "finalize", label: "Finalize standings", from: ["UNDER_REVIEW"], icon: BadgeCheck },
  {
    id: "cancel",
    label: "Cancel contest",
    from: ["DRAFT", "REGISTRATION_OPEN", "ACTIVE", "FROZEN", "UNDER_REVIEW"],
    icon: Ban,
    tone: "danger"
  }
];

function OverviewPanel({
  contest,
  identity,
  onChanged
}: {
  contest: AdminContestRow;
  identity: AdminIdentity;
  onChanged: () => Promise<void>;
}): JSX.Element {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [busy, setBusy] = useState<AdminTransition | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const overview = await adminOverview(identity, contest.id);
    setStats(overview?.stats ?? null);
  }, [contest.id, identity]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (transition: AdminTransition): Promise<void> => {
    const reason = window.prompt(`Reason for "${transition}"?`) ?? "";
    if (!reason.trim()) return;
    setBusy(transition);
    const result = await adminTransition(identity, contest.id, transition, reason.trim());
    setBusy(null);
    if (result.error) {
      setNotice(`Failed: ${result.error}`);
      return;
    }
    setNotice(
      result.reconciled
        ? `Reconciled ${result.reconciled.scanned} signals; ${result.reconciled.recorded} were missing and have been recorded.`
        : `Contest moved via "${transition}".`
    );
    await onChanged();
    await load();
  };

  const remaining = contest.endAtMs - Date.now();

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Participants" value={(stats?.participants ?? 0).toLocaleString()} hint={`${(stats?.activeParticipants ?? 0).toLocaleString()} active`} />
        <StatTile label="Events" value={(stats?.totalEvents ?? 0).toLocaleString()} hint={`${(stats?.validEvents ?? 0).toLocaleString()} valid`} />
        <StatTile label="Held for review" value={(stats?.suspiciousEvents ?? 0).toLocaleString()} hint={`${(stats?.openRiskFlags ?? 0).toLocaleString()} open flags`} />
        <StatTile label="Rejected / reversed" value={(stats?.rejectedEvents ?? 0).toLocaleString()} />
        <StatTile label="Points awarded" value={(stats?.pointsAwarded ?? 0).toLocaleString()} />
        <StatTile label="Prize" value={formatMoney(contest.prizeAmountMinor, contest.prizeCurrency)} />
        <StatTile label="Entry revenue" value={formatMoney(stats?.entryRevenueMinor ?? 0, contest.entryCurrency)} />
        <StatTile
          label="Time remaining"
          value={
            remaining <= 0
              ? "ended"
              : `${Math.floor(remaining / 86_400_000)}d ${Math.floor((remaining % 86_400_000) / 3_600_000)}h`
          }
        />
      </div>

      <section className="nada-premium-card p-5">
        <h2 className="mb-1 text-[15px] font-bold">Lifecycle</h2>
        <p className="mb-4 text-[12.5px] leading-relaxed text-nada-text-muted">
          A contest is never finalized straight from the leaderboard. Freezing stops
          scoring; reconciliation replays the window against NADA&apos;s own record and
          runs the aggregate fraud sweep; only then can standings be finalized, and
          only then can a winner be approved.
        </p>
        <div className="flex flex-wrap gap-2">
          {TRANSITIONS.filter((item) => item.from.includes(contest.status)).map((item) => (
            <button
              key={item.id}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold transition disabled:opacity-50",
                item.tone === "danger"
                  ? "bg-nada-danger/12 text-nada-danger hover:bg-nada-danger/20"
                  : "bg-nada-accent/12 text-nada-accent hover:bg-nada-accent/20"
              )}
              disabled={busy !== null}
              onClick={() => void run(item.id)}
              type="button"
            >
              {busy === item.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <item.icon size={14} aria-hidden="true" />
              )}
              {item.label}
            </button>
          ))}
          {TRANSITIONS.filter((item) => item.from.includes(contest.status)).length === 0 ? (
            <p className="text-[13px] text-nada-text-muted">
              No further transitions from {statusLabel(contest.status)}.
            </p>
          ) : null}
        </div>
        {notice ? (
          <p className="mt-3 rounded-xl border border-nada-border/10 bg-nada-surface-elevated/40 px-3 py-2 text-[12.5px] text-nada-text-muted">
            {notice}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function ParticipantsPanel({
  contestId,
  identity
}: {
  contestId: string;
  identity: AdminIdentity;
}): JSX.Element {
  const [rows, setRows] = useState<AdminParticipant[]>([]);
  const [investigation, setInvestigation] = useState<ParticipantInvestigation | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await adminParticipants(identity, contestId, 100, 0));
  }, [contestId, identity]);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (
    target: string,
    action: "clear" | "flag" | "disqualify" | "reinstate" | "release_held_events"
  ): Promise<void> => {
    const reason = window.prompt(`Reason for "${action}"?`) ?? "";
    if (!reason.trim()) return;
    setBusy(true);
    const { error } = await adminReview(identity, contestId, target, action, reason.trim());
    setBusy(false);
    setNotice(
      error
        ? `Failed: ${error}`
        : action === "release_held_events"
          ? "Held events re-scored. If they are still held, clear the participant's risk flags first — releasing does not by itself lower their risk band."
          : `Applied "${action}".`
    );
    await load();
    if (investigation) {
      setInvestigation(await adminParticipant(identity, contestId, target));
    }
  };

  return (
    <div className="grid gap-4">
      {notice ? (
        <p className="rounded-xl border border-nada-border/10 bg-nada-surface-elevated/40 px-3.5 py-2.5 text-[12.5px] text-nada-text-muted">
          {notice}
        </p>
      ) : null}
      <section className="nada-premium-card overflow-x-auto p-5">
        <h2 className="mb-3 text-[15px] font-bold">Participants</h2>
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-nada-text-faint">
            <tr>
              <th className="pb-2 font-semibold">Ghost</th>
              <th className="pb-2 font-semibold">Score</th>
              <th className="pb-2 font-semibold">Events</th>
              <th className="pb-2 font-semibold">Risk</th>
              <th className="pb-2 font-semibold">Status</th>
              <th className="pb-2 font-semibold">Last active</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.pubkeyHash} className="border-t border-nada-border/[0.07]">
                <td className="py-2.5">
                  <span className="font-semibold text-nada-primary">
                    {row.displayName || "Ghost"}
                  </span>
                  <span className="ml-2 font-mono text-[10.5px] text-nada-text-faint">
                    {row.pubkeyHash.slice(0, 10)}…
                  </span>
                </td>
                <td className="py-2.5 font-mono tabular-nums">
                  {row.currentScore.toLocaleString()}
                </td>
                <td className="py-2.5 font-mono tabular-nums text-nada-text-muted">
                  {row.events.toLocaleString()}
                </td>
                <td className="py-2.5">
                  <RiskBadge band={row.riskStatus} score={row.riskScore} />
                </td>
                <td className="py-2.5 text-nada-text-muted">{row.eligibilityStatus}</td>
                <td className="py-2.5 text-nada-text-faint">
                  {row.lastActiveAtMs
                    ? new Date(row.lastActiveAtMs).toLocaleDateString()
                    : "—"}
                </td>
                <td className="py-2.5 text-right">
                  <button
                    className="rounded-lg bg-nada-surface-3/60 px-2.5 py-1 text-[12px] font-semibold text-nada-accent"
                    onClick={() =>
                      void adminParticipant(identity, contestId, row.pubkeyHash).then(
                        setInvestigation
                      )
                    }
                    type="button"
                  >
                    Investigate
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="py-6 text-nada-text-muted" colSpan={7}>
                  No participants yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {investigation ? (
        <section className="nada-premium-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-bold">
                {investigation.participant.displayName || "Ghost"}
              </h2>
              <p className="font-mono text-[11px] text-nada-text-faint">
                {investigation.participant.pubkeyHash}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["clear", "Clear flags"],
                  ["flag", "Flag"],
                  ["release_held_events", "Release held events"],
                  ["disqualify", "Disqualify"],
                  ["reinstate", "Reinstate"]
                ] as Array<
                  ["clear" | "flag" | "release_held_events" | "disqualify" | "reinstate", string]
                >
              ).map(([action, label]) => (
                <button
                  key={action}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-50",
                    action === "disqualify"
                      ? "bg-nada-danger/12 text-nada-danger"
                      : "bg-nada-surface-3/60 text-nada-text-muted hover:text-nada-primary"
                  )}
                  disabled={busy}
                  onClick={() => void review(investigation.participant.pubkeyHash, action)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-nada-text-faint">
                Score
              </h3>
              <p className="text-[13px] text-nada-text-muted">
                Cached{" "}
                <span className="font-mono text-nada-primary">
                  {investigation.cachedScore.toLocaleString()}
                </span>{" "}
                · rebuilt from ledger{" "}
                <span className="font-mono text-nada-primary">
                  {investigation.ledgerScore.toLocaleString()}
                </span>
                {investigation.cachedScore !== investigation.ledgerScore ? (
                  <span className="ml-2 rounded bg-nada-warning/15 px-1.5 py-0.5 text-[11px] font-bold text-nada-warning">
                    mismatch
                  </span>
                ) : null}
              </p>
              <ul className="mt-3 grid gap-1">
                {investigation.breakdown.map((row) => (
                  <li key={row.category} className="flex justify-between text-[13px]">
                    <span className="text-nada-text-muted">{row.category}</span>
                    <span className="font-mono tabular-nums">{row.points.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-nada-text-faint">
                Risk flags
              </h3>
              {investigation.risk.length === 0 ? (
                <p className="text-[13px] text-nada-text-muted">No flags recorded.</p>
              ) : (
                <ul className="grid gap-1.5">
                  {investigation.risk.slice(0, 12).map((flag) => (
                    <li
                      key={flag.id}
                      className="rounded-lg border border-nada-border/10 bg-nada-surface-elevated/40 px-3 py-2 text-[12.5px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-nada-primary">{flag.riskType}</span>
                        <span className="font-mono text-[11px] text-nada-text-faint">
                          +{flag.score} · {flag.severity}
                        </span>
                      </div>
                      <p className="mt-1 break-words font-mono text-[11px] text-nada-text-faint">
                        {JSON.stringify(flag.evidence)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <h3 className="mb-2 mt-5 text-[12px] font-bold uppercase tracking-wide text-nada-text-faint">
            Event timeline
          </h3>
          <ul className="grid gap-1">
            {investigation.events.slice(0, 40).map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-nada-border/[0.07] px-3 py-1.5 text-[12.5px]"
              >
                <span className="text-nada-primary">{event.label}</span>
                <span className="font-mono text-[11px] text-nada-text-faint">
                  {event.sourceEntityType}:{event.sourceEntityId.slice(0, 8)} · actor{" "}
                  {event.actorPubkeyHash.slice(0, 8)}… ·{" "}
                  {new Date(event.occurredAtMs).toLocaleString()}
                </span>
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    event.qualificationStatus === "VALID"
                      ? "text-nada-success"
                      : event.qualificationStatus === "PENDING_REVIEW"
                        ? "text-nada-warning"
                        : "text-nada-text-faint"
                  )}
                >
                  {event.qualificationStatus} {event.pointsAwarded > 0 ? `+${event.pointsAwarded}` : ""}
                  {event.rejectionReason ? ` (${event.rejectionReason})` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function RiskBadge({ band, score }: { band: string; score: number }): JSX.Element {
  const tone =
    band === "HIGH_RISK"
      ? "bg-nada-danger/12 text-nada-danger"
      : band === "SUSPICIOUS"
        ? "bg-nada-warning/15 text-nada-warning"
        : band === "WATCH"
          ? "bg-nada-accent/12 text-nada-accent"
          : "bg-nada-surface-3/60 text-nada-text-muted";
  return (
    <span className={cn("rounded-lg px-2 py-0.5 font-mono text-[11px] font-bold", tone)}>
      {band} {score}
    </span>
  );
}

function RiskPanel({
  contestId,
  identity
}: {
  contestId: string;
  identity: AdminIdentity;
}): JSX.Element {
  const [rows, setRows] = useState<AdminRiskEvent[]>([]);
  useEffect(() => {
    void adminRisk(identity, contestId, 100).then(setRows);
  }, [contestId, identity]);

  return (
    <section className="nada-premium-card p-5">
      <h2 className="mb-1 text-[15px] font-bold">Risk signals</h2>
      <p className="mb-4 text-[12.5px] leading-relaxed text-nada-text-muted">
        Evidence, not verdicts. A flag reduces or withholds points and surfaces here;
        the underlying event keeps its row either way.
      </p>
      {rows.length === 0 ? (
        <p className="text-[13px] text-nada-text-muted">No risk signals recorded.</p>
      ) : (
        <ul className="grid gap-1.5">
          {rows.map((flag) => (
            <li
              key={flag.id}
              className="rounded-xl border border-nada-border/10 bg-nada-surface-elevated/40 px-3.5 py-2.5 text-[12.5px]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-nada-primary">{flag.riskType}</span>
                <span className="font-mono text-[11px] text-nada-text-faint">
                  {flag.participantPubkeyHash.slice(0, 10)}… · +{flag.score} · {flag.severity}
                  {flag.resolvedAtMs ? " · resolved" : ""}
                </span>
              </div>
              <p className="mt-1 break-words font-mono text-[11px] text-nada-text-faint">
                {JSON.stringify(flag.evidence)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WinnersPanel({
  contest,
  identity
}: {
  contest: AdminContestRow;
  identity: AdminIdentity;
}): JSX.Element {
  const [winners, setWinners] = useState<AdminWinner[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const overview = await adminOverview(identity, contest.id);
    setWinners(overview?.winners ?? []);
  }, [contest.id, identity]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (target: string, decision: "approve" | "reject"): Promise<void> => {
    const reason = window.prompt(`Reason for ${decision}?`) ?? "";
    if (!reason.trim()) return;
    setBusy(true);
    await adminApproveWinner(identity, contest.id, target, decision, reason.trim());
    setBusy(false);
    await load();
  };

  const recordPayout = async (target: string): Promise<void> => {
    const reference = window.prompt("Payout reference (bank/transfer id)?") ?? "";
    if (!reference.trim()) return;
    const failed = window.confirm("Did the payout FAIL? OK = failed, Cancel = paid.");
    setBusy(true);
    await adminRecordPayout(
      identity,
      contest.id,
      target,
      reference.trim(),
      failed ? "FAILED" : "PAID",
      ""
    );
    setBusy(false);
    await load();
  };

  return (
    <section className="nada-premium-card p-5">
      <h2 className="mb-1 text-[15px] font-bold">Winners</h2>
      <p className="mb-4 text-[12.5px] leading-relaxed text-nada-text-muted">
        Staged when the contest is finalized, from final scores recomputed out of the
        ledger. A winner is only confirmed once approved here, and a payout is recorded
        against a transfer that has already been made.
      </p>
      {winners.length === 0 ? (
        <p className="text-[13px] text-nada-text-muted">
          No winners staged. Finalize the contest first.
        </p>
      ) : (
        <ul className="grid gap-2">
          {winners.map((winner) => (
            <li
              key={winner.participantPubkeyHash}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-nada-border/10 bg-nada-surface-elevated/40 px-3.5 py-3"
            >
              <div>
                <p className="text-[13.5px] font-semibold text-nada-primary">
                  #{winner.rank} · {winner.finalScore.toLocaleString()} points
                </p>
                <p className="font-mono text-[11px] text-nada-text-faint">
                  {winner.participantPubkeyHash.slice(0, 18)}… ·{" "}
                  {formatMoney(winner.prizeAmountMinor, winner.prizeCurrency)} ·{" "}
                  {winner.reviewStatus} · payout {winner.payoutStatus}
                  {winner.payoutReference ? ` (${winner.payoutReference})` : ""}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button
                  className="rounded-lg bg-nada-success/12 px-3 py-1.5 text-[12px] font-semibold text-nada-success disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void decide(winner.participantPubkeyHash, "approve")}
                  type="button"
                >
                  Approve
                </button>
                <button
                  className="rounded-lg bg-nada-danger/12 px-3 py-1.5 text-[12px] font-semibold text-nada-danger disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void decide(winner.participantPubkeyHash, "reject")}
                  type="button"
                >
                  Reject
                </button>
                <button
                  className="rounded-lg bg-nada-surface-3/60 px-3 py-1.5 text-[12px] font-semibold text-nada-text-muted disabled:opacity-50"
                  disabled={busy || winner.reviewStatus !== "APPROVED"}
                  onClick={() => void recordPayout(winner.participantPubkeyHash)}
                  type="button"
                >
                  Record payout
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AuditPanel({
  contestId,
  identity
}: {
  contestId: string;
  identity: AdminIdentity;
}): JSX.Element {
  const [rows, setRows] = useState<AdminAuditEntry[]>([]);
  useEffect(() => {
    void adminAudit(identity, contestId, 100).then(setRows);
  }, [contestId, identity]);

  return (
    <section className="nada-premium-card p-5">
      <h2 className="mb-1 text-[15px] font-bold">Administrative audit</h2>
      <p className="mb-4 text-[12.5px] text-nada-text-muted">
        Every privileged change, with the identity that made it and the reason given.
      </p>
      {rows.length === 0 ? (
        <p className="text-[13px] text-nada-text-muted">Nothing recorded yet.</p>
      ) : (
        <ul className="grid gap-1.5">
          {rows.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-nada-border/10 bg-nada-surface-elevated/40 px-3.5 py-2.5 text-[12.5px]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-nada-primary">{entry.action}</span>
                <span className="font-mono text-[11px] text-nada-text-faint">
                  {entry.actorPubkeyHash === "system"
                    ? "system"
                    : `${entry.actorPubkeyHash.slice(0, 10)}…`}{" "}
                  · {new Date(entry.createdAtMs).toLocaleString()}
                </span>
              </div>
              {entry.reason ? (
                <p className="mt-1 text-nada-text-muted">{entry.reason}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CreateContestPanel({
  identity,
  onCreated
}: {
  identity: AdminIdentity;
  onCreated: () => Promise<void>;
}): JSX.Element {
  const [form, setForm] = useState({
    name: "NADA Engagement Contest",
    slug: "nada-engagement-contest",
    description: "Engage. Climb the leaderboard.",
    startAt: "",
    endAt: "",
    registrationEndAt: "",
    entryFeeMajor: "0",
    entryCurrency: "NGN",
    prizeMajor: "30000",
    prizeCurrency: "NGN"
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    const startAt = Date.parse(form.startAt);
    const endAt = Date.parse(form.endAt);
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) {
      setNotice("Start and end times are required.");
      return;
    }
    setBusy(true);
    const registrationEndAt = Date.parse(form.registrationEndAt);
    const { error } = await adminCreateContest(identity, {
      name: form.name,
      slug: form.slug,
      description: form.description,
      startAt,
      endAt,
      ...(Number.isFinite(registrationEndAt) ? { registrationEndAt } : {}),
      // Money is entered in major units and stored in minor ones; the
      // conversion happens once, here, and never again.
      entryFeeMinor: Math.round(Number(form.entryFeeMajor || "0") * 100),
      entryCurrency: form.entryCurrency.toUpperCase(),
      prizeAmountMinor: Math.round(Number(form.prizeMajor || "0") * 100),
      prizeCurrency: form.prizeCurrency.toUpperCase()
    });
    setBusy(false);
    setNotice(error ? `Failed: ${error}` : "Contest created as a draft.");
    if (!error) await onCreated();
  };

  const field = (
    key: keyof typeof form,
    label: string,
    type = "text"
  ): JSX.Element => (
    <label className="grid gap-1.5">
      <span className="text-[12px] font-semibold text-nada-text-muted">{label}</span>
      <input
        className="h-11 rounded-xl border border-nada-border/15 bg-nada-surface-elevated/50 px-3 text-[13px] text-nada-primary"
        onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
        type={type}
        value={form[key]}
      />
    </label>
  );

  return (
    <section className="nada-premium-card p-5">
      <h2 className="mb-1 text-[15px] font-bold">New contest</h2>
      <p className="mb-4 text-[12.5px] text-nada-text-muted">
        Created as a draft with the default ruleset. Nothing scores until you open
        registration and start scoring.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("name", "Name")}
        {field("slug", "Slug")}
        {field("startAt", "Starts (local)", "datetime-local")}
        {field("endAt", "Ends (local)", "datetime-local")}
        {field("registrationEndAt", "Registration closes (optional)", "datetime-local")}
        {field("description", "Description")}
        {field("entryFeeMajor", "Entry fee (major units)")}
        {field("entryCurrency", "Entry currency")}
        {field("prizeMajor", "Prize (major units)")}
        {field("prizeCurrency", "Prize currency")}
      </div>
      <button
        className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-nada-accent/14 px-4 text-[13px] font-bold text-nada-accent disabled:opacity-50"
        disabled={busy}
        onClick={() => void submit()}
        type="button"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Create draft
      </button>
      {notice ? (
        <p className="mt-3 text-[12.5px] text-nada-text-muted">{notice}</p>
      ) : null}
    </section>
  );
}
