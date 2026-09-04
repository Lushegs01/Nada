"use client";

import { Loader2, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ContestHero,
  ContestRulesPanel,
  LeaderboardList,
  StatTile
} from "@/components/contest/ContestPieces";
import {
  contestRelayConfigured,
  fetchContest,
  fetchLeaderboard,
  listContests,
  type Contest,
  type ContestPublicStats,
  type LeaderboardEntry
} from "@/lib/contest";

/**
 * The shareable contest page.
 *
 * Read-only and identity-free: it renders exactly what any visitor may see —
 * the contest, the published rules, and the anonymous leaderboard. Joining
 * requires a NADA identity, so the call to action opens the app rather than
 * trying to authenticate here.
 */
export function ContestPublicView({ slug }: { slug?: string }): JSX.Element {
  const [contest, setContest] = useState<Contest | null>(null);
  const [stats, setStats] = useState<ContestPublicStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contestRelayConfigured()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      let target: Contest | null = null;
      if (slug) {
        target = (await fetchContest(slug))?.contest ?? null;
      } else {
        const contests = await listContests();
        target =
          contests.find((entry) => entry.status === "ACTIVE") ?? contests[0] ?? null;
      }
      if (cancelled || !target) {
        setLoading(false);
        return;
      }
      const [detail, board] = await Promise.all([
        fetchContest(target.id),
        fetchLeaderboard(target.id, 10)
      ]);
      if (cancelled) return;
      setContest(detail?.contest ?? target);
      setStats(detail?.stats ?? null);
      setLeaderboard(board);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-nada-bg">
        <Loader2 className="h-5 w-5 animate-spin text-nada-accent" aria-hidden="true" />
      </main>
    );
  }

  if (!contest) {
    return (
      <main className="grid min-h-dvh place-items-center bg-nada-bg px-6 text-center">
        <div>
          <Trophy className="mx-auto mb-4 h-8 w-8 text-nada-secondary/35" aria-hidden="true" />
          <h1 className="text-[18px] font-bold text-nada-primary">No contest running</h1>
          <p className="mt-1.5 text-[13px] text-nada-text-muted">
            When NADA opens its next engagement contest, it will appear here.
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

  return (
    <main className="min-h-dvh bg-nada-bg px-4 py-6 text-nada-primary sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-4xl gap-4">
        <ContestHero
          contest={contest}
          action={
            <Link
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-[14px] font-bold text-white shadow-accent"
              href="/"
              style={{ background: "var(--n-accent-gradient)" }}
            >
              <Trophy size={16} aria-hidden="true" />
              Join contest in NADA
            </Link>
          }
        />

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile
            label="Participants"
            value={(stats?.participants ?? 0).toLocaleString()}
          />
          <StatTile
            label="Active"
            value={(stats?.activeParticipants ?? 0).toLocaleString()}
          />
          <StatTile
            label="Qualifying actions"
            value={(stats?.validEvents ?? 0).toLocaleString()}
          />
          <StatTile
            label="Points awarded"
            value={(stats?.pointsAwarded ?? 0).toLocaleString()}
          />
        </div>

        <section className="nada-premium-card p-5">
          <h2 className="mb-3 text-[16px] font-bold">Leaderboard</h2>
          <LeaderboardList entries={leaderboard} />
        </section>

        <section className="nada-premium-card p-5">
          <h2 className="mb-4 text-[16px] font-bold">Rules and scoring</h2>
          <ContestRulesPanel contest={contest} scoring={contest.scoring} />
        </section>
      </div>
    </main>
  );
}
