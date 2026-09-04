"use client";

import type { IdentityRecord } from "@nada/db";
import { cn } from "@nada/ui";
import {
  ArrowUpRight,
  BarChart3,
  Loader2,
  ScrollText,
  Trophy,
  Users
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ContestHero,
  ContestRulesPanel,
  LeaderboardList,
  ScoreBreakdown,
  StatTile
} from "@/components/contest/ContestPieces";
import {
  contestRelayConfigured,
  fetchContest,
  fetchLeaderboard,
  fetchMyActivity,
  fetchMyContestState,
  formatMoney,
  joinContest,
  listContests,
  registrationOpen,
  type Contest,
  type ContestActivityEntry,
  type ContestPublicStats,
  type LeaderboardEntry,
  type MyContestState
} from "@/lib/contest";

/**
 * The in-app contest experience.
 *
 * Everything shown here is read back from the relay. The screen never computes
 * a score, a rank, or whether someone is eligible — those are server
 * decisions, and rendering a local guess would be the first step towards a
 * leaderboard that disagrees with the ledger.
 */

const REFRESH_MS = 20_000;
const JOIN_ERRORS: Record<string, string> = {
  registration_closed: "Registration for this contest has closed.",
  contest_full: "This contest has reached its participant limit.",
  disqualified: "This identity is not eligible for this contest.",
  identity_locked: "Unlock your identity before joining.",
  payments_not_configured: "Paid entry is not available on this relay yet.",
  invalid_redirect: "This deployment could not build a valid return URL.",
  relay_not_configured: "NADA is not connected to a relay."
};

type Tab = "overview" | "leaderboard" | "score" | "rules";

export function ContestScreen({
  identity,
  displayName
}: {
  identity: IdentityRecord;
  displayName: string;
}): JSX.Element {
  const [contest, setContest] = useState<Contest | null>(null);
  const [stats, setStats] = useState<ContestPublicStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [me, setMe] = useState<MyContestState | null>(null);
  const [activity, setActivity] = useState<ContestActivityEntry[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const relayReady = contestRelayConfigured();

  const loadContest = useCallback(async () => {
    const contests = await listContests();
    // Prefer the one people can act on right now.
    const live =
      contests.find((entry) => entry.status === "ACTIVE") ??
      contests.find((entry) => entry.status === "REGISTRATION_OPEN") ??
      contests[0] ??
      null;
    setContest(live);
    setLoading(false);
    return live;
  }, []);

  const refresh = useCallback(
    async (target: Contest) => {
      const [detail, board, mine] = await Promise.all([
        fetchContest(target.id),
        fetchLeaderboard(target.id, 25),
        fetchMyContestState(target.id, identity.pubkeyHash)
      ]);
      if (detail) {
        setContest(detail.contest);
        setStats(detail.stats);
      }
      setLeaderboard(board);
      setMe(mine);
    },
    [identity.pubkeyHash]
  );

  useEffect(() => {
    if (!relayReady) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void loadContest().then((live) => {
      if (!cancelled && live) void refresh(live);
    });
    return () => {
      cancelled = true;
    };
  }, [loadContest, refresh, relayReady]);

  useEffect(() => {
    if (!contest || !relayReady) return;
    const timer = setInterval(() => {
      void refresh(contest);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [contest, refresh, relayReady]);

  useEffect(() => {
    if (!contest || tab !== "score" || !me?.joined) return;
    void fetchMyActivity(contest.id, identity.pubkeyHash, 60).then(setActivity);
  }, [contest, identity.pubkeyHash, me?.joined, tab]);

  const handleJoin = useCallback(async () => {
    if (!contest) return;
    setJoining(true);
    setJoinError(null);
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const { data, error } = await joinContest({
      contestId: contest.id,
      pubkeyHash: identity.pubkeyHash,
      displayName: displayName.trim() || "Ghost",
      successUrl: `${origin}/?contest=${encodeURIComponent(contest.slug)}&entry=complete`,
      cancelUrl: `${origin}/?contest=${encodeURIComponent(contest.slug)}&entry=cancelled`
    });
    setJoining(false);
    if (error || !data) {
      setJoinError(JOIN_ERRORS[error ?? ""] ?? "Could not join the contest just now.");
      return;
    }
    // Paid entry: hand off to the payment provider. Eligibility is granted by
    // the provider's webhook, never by coming back to the success URL.
    if (data.requiresPayment && data.checkoutUrl) {
      window.location.assign(data.checkoutUrl);
      return;
    }
    await refresh(contest);
  }, [contest, displayName, identity.pubkeyHash, refresh]);

  if (!relayReady) {
    return <ContestEmpty title="Contests need a relay" body="Connect NADA to a relay to take part in engagement contests." />;
  }
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-nada-accent" aria-hidden="true" />
      </div>
    );
  }
  if (!contest) {
    return (
      <ContestEmpty
        title="No contest running"
        body="When NADA opens its next engagement contest, it will appear here."
      />
    );
  }

  const canJoin = registrationOpen(contest) && !me?.joined;
  const awaitingPayment =
    me?.joined && me.participant?.eligibilityStatus === "pending_payment";

  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 pb-24 pt-3 animate-fade-in">
      <ContestHero
        contest={contest}
        action={
          <div className="grid gap-2">
            {canJoin ? (
              <button
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-[14px] font-bold text-white shadow-accent transition disabled:opacity-60"
                disabled={joining}
                onClick={() => void handleJoin()}
                style={{ background: "var(--n-accent-gradient)" }}
                type="button"
              >
                {joining ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trophy size={16} aria-hidden="true" />
                )}
                {contest.entryFeeMinor > 0
                  ? `Join for ${formatMoney(contest.entryFeeMinor, contest.entryCurrency)}`
                  : "Join contest"}
              </button>
            ) : null}
            {awaitingPayment ? (
              <p className="rounded-xl border border-nada-warning/25 bg-nada-warning/10 px-3 py-2 text-[12.5px] text-nada-warning">
                Your entry is waiting on payment confirmation. Points start counting
                once the payment provider confirms it.
              </p>
            ) : null}
            {joinError ? (
              <p className="rounded-xl border border-nada-danger/25 bg-nada-danger/10 px-3 py-2 text-[12.5px] text-nada-danger">
                {joinError}
              </p>
            ) : null}
          </div>
        }
      />

      <nav className="mt-5 flex gap-1.5 overflow-x-auto pb-1" aria-label="Contest sections">
        <TabButton active={tab === "overview"} icon={BarChart3} label="Overview" onClick={() => setTab("overview")} />
        <TabButton active={tab === "leaderboard"} icon={Trophy} label="Leaderboard" onClick={() => setTab("leaderboard")} />
        <TabButton active={tab === "score"} icon={Users} label="Your score" onClick={() => setTab("score")} />
        <TabButton active={tab === "rules"} icon={ScrollText} label="Rules" onClick={() => setTab("rules")} />
      </nav>

      <div className="mt-4">
        {tab === "overview" ? (
          <OverviewTab
            contest={contest}
            leaderboard={leaderboard}
            me={me}
            pubkeyHash={identity.pubkeyHash}
            stats={stats}
            onSeeAll={() => setTab("leaderboard")}
          />
        ) : null}

        {tab === "leaderboard" ? (
          <section className="nada-premium-card p-5">
            <h2 className="mb-3 text-[16px] font-bold text-nada-primary">Leaderboard</h2>
            <LeaderboardList entries={leaderboard} highlightPubkeyHash={identity.pubkeyHash} />
          </section>
        ) : null}

        {tab === "score" ? (
          <ScoreTab activity={activity} contest={contest} me={me} />
        ) : null}

        {tab === "rules" ? (
          <section className="nada-premium-card p-5">
            <h2 className="mb-4 text-[16px] font-bold text-nada-primary">
              {contest.name} — rules
            </h2>
            <ContestRulesPanel contest={contest} scoring={contest.scoring} />
          </section>
        ) : null}
      </div>
    </div>
  );
}

function OverviewTab({
  contest,
  leaderboard,
  me,
  pubkeyHash,
  stats,
  onSeeAll
}: {
  contest: Contest;
  leaderboard: LeaderboardEntry[];
  me: MyContestState | null;
  pubkeyHash: string;
  stats: ContestPublicStats | null;
  onSeeAll: () => void;
}): JSX.Element {
  const suggestion = useMemo(() => buildSuggestion(contest, me), [contest, me]);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile
          label="Your rank"
          value={me?.joined && me.rank ? `#${me.rank}` : "—"}
          {...(me?.joined && me.pointsToNextRank
            ? { hint: `${me.pointsToNextRank.toLocaleString()} to climb` }
            : {})}
        />
        <StatTile
          label="Your score"
          value={me?.joined ? (me.score ?? 0).toLocaleString() : "—"}
          {...(me?.joined ? { hint: `${(me.thisWeek ?? 0).toLocaleString()} this week` } : {})}
        />
        <StatTile
          label="Participants"
          value={(stats?.participants ?? 0).toLocaleString()}
          hint={`${(stats?.activeParticipants ?? 0).toLocaleString()} active`}
        />
        <StatTile
          label="Qualifying actions"
          value={(stats?.validEvents ?? 0).toLocaleString()}
          hint={`${(stats?.pointsAwarded ?? 0).toLocaleString()} points awarded`}
        />
      </div>

      {suggestion ? (
        <div className="rounded-2xl border border-nada-accent/20 bg-nada-accent/[0.06] px-4 py-3.5">
          <p className="text-[13px] leading-relaxed text-nada-primary">{suggestion}</p>
        </div>
      ) : null}

      <section className="nada-premium-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-nada-primary">Top ghosts</h2>
          <button
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-nada-accent"
            onClick={onSeeAll}
            type="button"
          >
            See all
            <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        </div>
        <LeaderboardList
          entries={leaderboard.slice(0, 5)}
          highlightPubkeyHash={pubkeyHash}
        />
      </section>
    </div>
  );
}

function ScoreTab({
  activity,
  contest,
  me
}: {
  activity: ContestActivityEntry[];
  contest: Contest;
  me: MyContestState | null;
}): JSX.Element {
  if (!me?.joined) {
    return (
      <ContestEmpty
        title="You have not joined yet"
        body={`Join ${contest.name} to start earning points for the engagement you already create.`}
      />
    );
  }

  return (
    <div className="grid gap-4">
      <section className="nada-premium-card p-5">
        <h2 className="mb-1 text-[16px] font-bold text-nada-primary">
          How did I get this score?
        </h2>
        <p className="mb-4 text-[12.5px] text-nada-text-muted">
          Rebuilt from the points ledger, not from a running total.
        </p>
        <ScoreBreakdown breakdown={me.breakdown ?? []} total={me.score ?? 0} />
      </section>

      <section className="nada-premium-card p-5">
        <h2 className="mb-3 text-[16px] font-bold text-nada-primary">Qualifying actions</h2>
        {activity.length === 0 ? (
          <p className="text-[13px] text-nada-text-muted">
            Nothing recorded yet. Post an Echo or reflect on someone else&apos;s to start.
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {activity.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-xl border border-nada-border/10 bg-nada-surface-elevated/40 px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-nada-primary">
                    {entry.label}
                  </p>
                  <p className="text-[11.5px] text-nada-text-faint">
                    {new Date(entry.occurredAt).toLocaleString()}
                    {entry.reason ? ` · ${humaniseReason(entry.reason)}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[13px] font-bold tabular-nums",
                    entry.status === "VALID"
                      ? "text-nada-success"
                      : entry.status === "PENDING_REVIEW"
                        ? "text-nada-warning"
                        : "text-nada-text-faint"
                  )}
                >
                  {entry.status === "VALID"
                    ? `+${entry.points}`
                    : entry.status === "PENDING_REVIEW"
                      ? "held"
                      : entry.status === "REVERSED"
                        ? "reversed"
                        : "0"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TabButton({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  icon: typeof Trophy;
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-semibold transition",
        active
          ? "bg-nada-accent/14 text-nada-accent"
          : "bg-nada-surface-elevated/40 text-nada-text-muted hover:text-nada-primary"
      )}
      onClick={onClick}
      type="button"
    >
      <Icon size={14} aria-hidden="true" />
      {label}
    </button>
  );
}

function ContestEmpty({ body, title }: { body: string; title: string }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-20 text-center">
      <Trophy className="mb-4 h-8 w-8 text-nada-secondary/35" aria-hidden="true" />
      <p className="text-[15px] font-bold text-nada-primary">{title}</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-nada-text-muted">{body}</p>
    </div>
  );
}

/**
 * One concrete next step, drawn from the participant's actual position. No
 * urgency theatre, no countdown pressure — just the thing that would help.
 */
function buildSuggestion(contest: Contest, me: MyContestState | null): string | null {
  if (!me?.joined) {
    return `Join ${contest.name} and the engagement you already create starts counting.`;
  }
  if (me.participant?.eligibilityStatus === "pending_payment") return null;
  if (me.rank && me.pointsToNextRank) {
    return `You are ${me.pointsToNextRank.toLocaleString()} points from #${me.rank - 1}.`;
  }
  if ((me.score ?? 0) === 0) {
    return "Post an Echo to open your account — writing something people reply to is worth more than reacting.";
  }
  if (me.rank === 1) {
    return "You are top of the board. Final standings are reviewed before any winner is confirmed.";
  }
  return null;
}

const REASON_COPY: Record<string, string> = {
  daily_points_cap: "daily cap reached",
  daily_event_cap: "daily limit for this action",
  actor_pair_cap: "limit for this ghost reached",
  source_entity_cap: "limit for this Echo reached",
  diminishing_returns: "reduced — repeat interaction",
  cooldown: "too soon after the last one",
  self_interaction: "your own content",
  risk_band_hold: "held for review",
  participant_disqualified: "disqualified",
  echo_deleted: "content deleted",
  reflection_deleted: "reply deleted",
  echo_like_removed: "like removed",
  reflection_like_removed: "like removed",
  unfollowed: "unfollowed"
};

function humaniseReason(reason: string): string {
  return REASON_COPY[reason] ?? reason.replaceAll("_", " ");
}
