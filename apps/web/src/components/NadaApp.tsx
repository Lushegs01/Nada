"use client";
import "./app.css";
import "./shared.css";
import { useCallback, useEffect, useState } from "react";
import type { IdentityRecord } from "@nada/db";
import { nadaDb, primaryIdentityId } from "@/lib/db";
import { useSocketStore } from "@/stores/useSocketStore";
import { useIdentityStore } from "@/stores/useIdentityStore";
import { Splash } from "./AppLoading";
import { useOnlineStatus, OfflineBanner } from "./OfflineBanner";
import { Dashboard } from "./screens/Dashboard";
import { Onboarding } from "./screens/Onboarding";

export function NadaApp(): JSX.Element {
  const [identity, setIdentity] = useState<IdentityRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isOnline = useOnlineStatus();
  const connect = useSocketStore((state) => state.connect);
  const disconnect = useSocketStore((state) => state.disconnect);
  const setUnlocked = useIdentityStore((state) => state.setUnlocked);

  useEffect(() => {
    let active = true;

    void nadaDb.identity.get(primaryIdentityId).then((record) => {
      if (!active) {
        return;
      }

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
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [setUnlocked]);

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
