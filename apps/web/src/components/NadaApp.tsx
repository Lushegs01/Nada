"use client";
import "./app.css";
import "./shared.css";
import { useCallback, useEffect, useState } from "react";
import type { IdentityRecord } from "@nada/db";
import { nadaDb, primaryIdentityId } from "@/lib/db";
import {
  classifyDatabaseError,
  openLocalDatabase,
  type DatabaseFailureReason
} from "@/lib/local-database";
import { useSocketStore } from "@/stores/useSocketStore";
import { useIdentityStore } from "@/stores/useIdentityStore";
import { Splash } from "./AppLoading";
import { LocalDataRecovery } from "./LocalDataRecovery";
import { useOnlineStatus, OfflineBanner } from "./OfflineBanner";
import { Dashboard } from "./screens/Dashboard";
import { Onboarding } from "./screens/Onboarding";

interface StartupFailure {
  reason: DatabaseFailureReason;
  message: string;
}

export function NadaApp(): JSX.Element {
  const [identity, setIdentity] = useState<IdentityRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failure, setFailure] = useState<StartupFailure | null>(null);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const isOnline = useOnlineStatus();
  const connect = useSocketStore((state) => state.connect);
  const disconnect = useSocketStore((state) => state.disconnect);
  const setUnlocked = useIdentityStore((state) => state.setUnlocked);

  useEffect(() => {
    let active = true;

    /**
     * Startup, with an exit from every branch.
     *
     * The previous version awaited `nadaDb.identity.get(...)` with no rejection
     * handler, so a database that would not open left `isLoading` true forever
     * and the splash screen became the whole product. Every path here now ends
     * in either an identity or a failure the user can act on — including the
     * one where opening simply never answers, which `openLocalDatabase` turns
     * into a timeout rather than an infinite wait.
     */
    const start = async (): Promise<void> => {
      const opened = await openLocalDatabase();
      if (!active) return;
      if (!opened.ok) {
        setFailure({ reason: opened.reason, message: opened.message });
        setIsLoading(false);
        return;
      }

      try {
        const record = await nadaDb.identity.get(primaryIdentityId);
        if (!active) return;

        setIdentity(record ?? null);
        if (record?.localPrivateKey) {
          setUnlocked({
            pubkey: record.pubkey,
            pubkeyHash: record.pubkeyHash,
            privateKey: record.localPrivateKey
          });
        } else {
          setUnlocked(null);
        }
        setFailure(null);
        setIsLoading(false);
      } catch (error) {
        // The database opened but the read failed — a closed connection, a
        // storage error mid-read. Still a recoverable state, not a dead end.
        if (!active) return;
        const classified = classifyDatabaseError(error);
        setFailure(classified);
        setIsLoading(false);
      }
    };

    void start();

    return () => {
      active = false;
    };
  }, [setUnlocked, startupAttempt]);

  useEffect(() => {
    if (!identity) {
      return;
    }

    connect({ pubkeyHash: identity.pubkeyHash });
    return () => {
      disconnect();
    };
  }, [connect, disconnect, identity]);

  const handleComplete = useCallback(
    (nextIdentity: IdentityRecord) => {
      setIdentity(nextIdentity);
      if (nextIdentity.localPrivateKey) {
        setUnlocked({
          pubkey: nextIdentity.pubkey,
          pubkeyHash: nextIdentity.pubkeyHash,
          privateKey: nextIdentity.localPrivateKey
        });
      }
    },
    [setUnlocked]
  );

  if (isLoading) {
    return <Splash />;
  }

  if (failure) {
    return (
      <LocalDataRecovery
        message={failure.message}
        onRecovered={() => {
          // Re-run startup from the top rather than assuming what recovery
          // left behind: it may have restored an identity, or none at all.
          setFailure(null);
          setIsLoading(true);
          setStartupAttempt((attempt) => attempt + 1);
        }}
        reason={failure.reason}
      />
    );
  }

  return (
    <main className="nada-shell min-h-dvh">
      <OfflineBanner isOnline={isOnline} />
      {identity ? (
        <Dashboard identity={identity} />
      ) : (
        <Onboarding onComplete={handleComplete} />
      )}
    </main>
  );
}
