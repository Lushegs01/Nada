"use client";

import { cn } from "@nada/ui";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Crown,
  Info,
  Medal,
  ShieldCheck,
  Sparkles,
  Trophy
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import {
  categoryLabel,
  countdownTo,
  formatMoney,
  statusLabel,
  type Contest,
  type ContestScoring,
  type LeaderboardEntry
} from "@/lib/contest";

/**
 * Presentational pieces shared by the in-app contest tab, the public contest
 * page and the admin console. Everything here renders numbers the server
 * computed — none of it derives a score, a rank, or an eligibility state.
 */

export function ContestCountdown({
  target,
  label
}: {
  target: number;
  label: string;
}): JSX.Element {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const remaining = countdownTo(target, now);

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-nada-text-muted">
        {label}
      </p>
      <div className="mt-1.5 flex items-baseline gap-3 tabular-nums">
        <CountdownUnit value={remaining.days} unit="days" />
        <CountdownUnit value={remaining.hours} unit="hrs" />
        <CountdownUnit value={remaining.minutes} unit="min" />
        <CountdownUnit value={remaining.seconds} unit="sec" />
      </div>
    </div>
  );
}

function CountdownUnit({ value, unit }: { value: number; unit: string }): JSX.Element {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[22px] font-bold leading-none text-nada-primary">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[10px] font-semibold uppercase text-nada-text-faint">{unit}</span>
    </div>
  );
}

export function ContestStatusPill({ contest }: { contest: Contest }): JSX.Element {
  const tone =
    contest.status === "ACTIVE"
      ? "border-nada-success/30 bg-nada-success/10 text-nada-success"
      : contest.status === "FINALIZED"
        ? "border-nada-gold/30 bg-nada-gold/10 text-nada-gold"
        : contest.status === "CANCELLED"
          ? "border-nada-danger/30 bg-nada-danger/10 text-nada-danger"
          : "border-nada-accent/25 bg-nada-accent/10 text-nada-accent";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em]",
        tone
      )}
    >
      {contest.status === "ACTIVE" ? (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
      ) : null}
      {statusLabel(contest.status)}
    </span>
  );
}

export function ContestHero({
  contest,
  action
}: {
  contest: Contest;
  action?: ReactNode;
}): JSX.Element {
  const countdownTarget =
    contest.status === "REGISTRATION_OPEN" && contest.startAt > Date.now()
      ? contest.startAt
      : contest.endAt;
  const countdownLabel =
    countdownTarget === contest.startAt ? "Starts in" : "Time remaining";

  return (
    <section className="nada-premium-card relative overflow-hidden p-6 sm:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-[0.16] blur-3xl"
        style={{ background: "var(--n-accent-gradient)" }}
      />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <ContestStatusPill contest={contest} />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-nada-text-faint">
            Ruleset v{contest.rulesVersion}
          </span>
        </div>

        <h1 className="mt-4 text-[30px] font-bold leading-[1.05] tracking-tight text-nada-primary sm:text-[38px]">
          Engage. Climb. Win.
        </h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-nada-text-muted">
          Get active on NADA, earn points for engagement that other ghosts
          actually respond to, and climb the leaderboard for{" "}
          {contest.name}.
        </p>

        <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-nada-text-muted">
              Prize
            </p>
            <p className="mt-1 text-[32px] font-bold leading-none text-nada-gold sm:text-[40px]">
              {formatMoney(contest.prizeAmountMinor, contest.prizeCurrency)}
            </p>
          </div>
          <ContestCountdown target={countdownTarget} label={countdownLabel} />
        </div>

        {contest.entryFeeMinor > 0 ? (
          <p className="mt-4 inline-flex items-center gap-2 rounded-xl border border-nada-border/10 bg-nada-surface-elevated/40 px-3 py-2 text-[12.5px] text-nada-text-muted">
            <Info size={14} className="text-nada-accent" aria-hidden="true" />
            Entry fee {formatMoney(contest.entryFeeMinor, contest.entryCurrency)} — your
            entry activates once payment is confirmed by the payment provider.
          </p>
        ) : null}

        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </section>
  );
}

const RANK_ICON = [Crown, Trophy, Medal] as const;

export function LeaderboardList({
  entries,
  highlightPubkeyHash,
  emptyLabel = "No scores yet. The first qualifying Echo starts the board."
}: {
  entries: LeaderboardEntry[];
  highlightPubkeyHash?: string | undefined;
  emptyLabel?: string;
}): JSX.Element {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-nada-border/10 bg-nada-surface-elevated/35 px-4 py-8 text-center">
        <Trophy className="mx-auto mb-3 h-6 w-6 text-nada-secondary/35" aria-hidden="true" />
        <p className="text-[13px] text-nada-text-muted">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <ol className="grid gap-1.5">
      {entries.map((entry) => {
        const Icon = RANK_ICON[entry.rank - 1];
        const isMe = highlightPubkeyHash === entry.pubkeyHash;
        return (
          <motion.li
            key={entry.pubkeyHash}
            layout
            className={cn(
              "flex items-center gap-3 rounded-2xl border px-3.5 py-3",
              isMe
                ? "border-nada-accent/35 bg-nada-accent/[0.08]"
                : "border-nada-border/10 bg-nada-surface-elevated/40"
            )}
          >
            <span
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-xl font-mono text-[12px] font-bold tabular-nums",
                entry.rank === 1
                  ? "bg-nada-gold/15 text-nada-gold"
                  : entry.rank <= 3
                    ? "bg-nada-accent/12 text-nada-accent"
                    : "bg-nada-surface-3/60 text-nada-text-muted"
              )}
            >
              {Icon ? <Icon size={15} aria-hidden="true" /> : entry.rank}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-nada-primary">
                {entry.displayName || "Ghost"}
                {isMe ? (
                  <span className="ml-2 rounded-full bg-nada-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-nada-accent">
                    You
                  </span>
                ) : null}
              </p>
              <p className="text-[11.5px] text-nada-text-faint">
                {entry.events.toLocaleString()} qualifying{" "}
                {entry.events === 1 ? "action" : "actions"}
              </p>
            </div>
            <span className="shrink-0 font-mono text-[15px] font-bold tabular-nums text-nada-primary">
              {entry.score.toLocaleString()}
            </span>
          </motion.li>
        );
      })}
    </ol>
  );
}

export function ScoreBreakdown({
  breakdown,
  total
}: {
  breakdown: Array<{ category: string; points: number }>;
  total: number;
}): JSX.Element {
  const max = Math.max(1, ...breakdown.map((row) => Math.abs(row.points)));
  return (
    <div className="grid gap-2.5">
      {breakdown.length === 0 ? (
        <p className="text-[13px] text-nada-text-muted">
          Nothing scored yet. Every point you earn will be itemised here.
        </p>
      ) : null}
      {breakdown.map((row) => (
        <div key={row.category}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-nada-text-muted">
              {categoryLabel(row.category)}
            </span>
            <span className="font-mono text-[13px] font-semibold tabular-nums text-nada-primary">
              {row.points.toLocaleString()}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-nada-surface-3/60">
            <div
              className={cn(
                "h-full rounded-full",
                row.points < 0 ? "bg-nada-danger/60" : ""
              )}
              style={{
                width: `${Math.round((Math.abs(row.points) / max) * 100)}%`,
                ...(row.points < 0 ? {} : { background: "var(--n-accent-gradient)" })
              }}
            />
          </div>
        </div>
      ))}
      <div className="mt-1 flex items-baseline justify-between border-t border-nada-border/10 pt-2.5">
        <span className="text-[12px] font-bold uppercase tracking-wide text-nada-text-faint">
          Total
        </span>
        <span className="font-mono text-[17px] font-bold tabular-nums text-nada-primary">
          {total.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

/**
 * The published rules. Deliberately complete about what earns points and what
 * the limits are, and deliberately silent about the exact thresholds the fraud
 * detector fires at — publishing those would be publishing how to stay under
 * them.
 */
export function ContestRulesPanel({
  contest,
  scoring
}: {
  contest: Contest;
  scoring: ContestScoring;
}): JSX.Element {
  const decayPercent = Math.round(scoring.diminishing.decay * 100);
  return (
    <div className="grid gap-5">
      <RuleSection icon={Sparkles} title="How points are earned">
        <ul className="grid gap-1.5">
          {scoring.points.map((rule) => (
            <li
              key={rule.eventType}
              className="flex items-baseline justify-between gap-3 border-b border-nada-border/[0.06] pb-1.5 last:border-0"
            >
              <span className="text-[13px] text-nada-text-muted">{rule.label}</span>
              <span className="font-mono text-[13px] font-bold tabular-nums text-nada-primary">
                +{rule.points}
              </span>
            </li>
          ))}
        </ul>
      </RuleSection>

      {scoring.challenges.length > 0 ? (
        <RuleSection icon={Trophy} title="Challenges">
          <ul className="grid gap-2">
            {scoring.challenges.map((challenge) => (
              <li key={challenge.id} className="text-[13px] text-nada-text-muted">
                <span className="font-semibold text-nada-primary">{challenge.label}</span>{" "}
                <span className="font-mono text-[11px] uppercase tracking-wide text-nada-accent">
                  {challenge.period}
                </span>
                <span className="ml-2 font-mono text-[12px] tabular-nums text-nada-primary">
                  +{challenge.points}
                </span>
                <p className="text-[12.5px] text-nada-text-faint">{challenge.description}</p>
              </li>
            ))}
          </ul>
        </RuleSection>
      ) : null}

      <RuleSection icon={ShieldCheck} title="Limits that keep it fair">
        <ul className="grid gap-1.5 text-[13px] leading-relaxed text-nada-text-muted">
          <li>
            At most{" "}
            <strong className="text-nada-primary">
              {scoring.caps.dailyPointsPerParticipant.toLocaleString()}
            </strong>{" "}
            points a day, per participant.
          </li>
          <li>
            One ghost can generate at most{" "}
            <strong className="text-nada-primary">{scoring.caps.perActorPairPoints}</strong>{" "}
            points for you per{" "}
            {Math.round(scoring.caps.actorPairWindowMs / 3_600_000)} hours.
          </li>
          <li>
            After {scoring.diminishing.fullValueInteractions} interactions with the same
            ghost, each further one is worth {decayPercent}% of the last.
          </li>
          <li>
            A single Echo can earn at most{" "}
            <strong className="text-nada-primary">
              {scoring.caps.perSourceEntityPoints}
            </strong>{" "}
            points in total.
          </li>
          <li>
            Engagement from identities created in the last{" "}
            {Math.round(scoring.newIdentity.windowMs / 86_400_000)} days counts for{" "}
            {Math.round(scoring.newIdentity.actorMultiplier * 100)}%.
          </li>
          <li>Interacting with your own content never scores.</li>
        </ul>
      </RuleSection>

      <RuleSection icon={AlertTriangle} title="Prohibited behaviour">
        <ul className="grid gap-1.5 text-[13px] leading-relaxed text-nada-text-muted">
          <li>Creating additional identities to inflate your own score.</li>
          <li>Coordinated reciprocal engagement rings.</li>
          <li>Automated or scripted interaction of any kind.</li>
          <li>Posting solely to trigger scoring events rather than to be read.</li>
        </ul>
        <p className="mt-2 text-[12.5px] leading-relaxed text-nada-text-faint">
          Suspicious activity is flagged automatically and reviewed by a person.
          Points can be withheld pending review or reversed; accounts can be
          disqualified. Evidence for every decision is retained.
        </p>
      </RuleSection>

      <RuleSection icon={Info} title="Eligibility, deadlines and the prize">
        <ul className="grid gap-1.5 text-[13px] leading-relaxed text-nada-text-muted">
          <li>Open to any NADA identity that registers before the deadline.</li>
          <li>
            Registration closes{" "}
            <strong className="text-nada-primary">
              {contest.registrationEndAt
                ? new Date(contest.registrationEndAt).toUTCString()
                : "when the contest ends"}
            </strong>
            .
          </li>
          <li>
            Contest runs {new Date(contest.startAt).toUTCString()} to{" "}
            {new Date(contest.endAt).toUTCString()}.
          </li>
          <li>
            Entry is{" "}
            {contest.entryFeeMinor > 0
              ? `${formatMoney(contest.entryFeeMinor, contest.entryCurrency)}, payable at registration`
              : "free"}
            .
          </li>
          <li>
            Prize: {formatMoney(contest.prizeAmountMinor, contest.prizeCurrency)} to the
            highest final score.
          </li>
        </ul>
      </RuleSection>

      <RuleSection icon={ShieldCheck} title="How the winner is determined">
        <p className="text-[13px] leading-relaxed text-nada-text-muted">
          When the contest ends, scoring stops and the standings are frozen. Every
          engagement event in the window is then reconciled against NADA&apos;s own
          record so nothing is missing, an automated fraud review runs, and the final
          leaderboard is recomputed from the points ledger rather than from the live
          display. A person reviews the result before any winner is confirmed. The
          highest final score after that review wins.
        </p>
      </RuleSection>

      <RuleSection icon={AlertTriangle} title="Disputes and payout">
        <p className="text-[13px] leading-relaxed text-nada-text-muted">
          Every point you hold can be traced to the specific action that earned it;
          your full itemised history is in your contest dashboard. To dispute a score
          or a decision, contact the contest operator with your anonymous handle
          before the payout is recorded. Payouts are made after the winner is confirmed
          and are recorded against the contest. Nothing here is legal advice about
          whether this contest may be run in a given jurisdiction — that determination
          is the operator&apos;s.
        </p>
      </RuleSection>
    </div>
  );
}

function RuleSection({
  icon: Icon,
  title,
  children
}: {
  icon: typeof Info;
  title: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section>
      <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.1em] text-nada-primary">
        <Icon size={15} className="text-nada-accent" aria-hidden="true" />
        {title}
      </h3>
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-nada-border/10 bg-nada-surface-elevated/40 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-nada-text-muted">
        {label}
      </p>
      <p className="mt-1.5 text-[22px] font-bold leading-none tabular-nums text-nada-primary">
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-[11.5px] text-nada-text-faint">{hint}</p> : null}
    </div>
  );
}
