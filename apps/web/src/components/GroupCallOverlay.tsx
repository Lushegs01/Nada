"use client";

import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useCallStore } from "@/stores/useCallStore";
import { useIdentityStore } from "@/stores/useIdentityStore";

export function GroupCallOverlay() {
  const call = useCallStore((s) => s.call);
  const endCall = useCallStore((s) => s.endCall);
  const signProof = useIdentityStore((s) => s.signProof);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (call?.mode !== "group" || !call.callId) {
      setToken("");
      setError(null);
      return;
    }

    const room = call.callId;
    const controller = new AbortController();
    setError(null);

    void (async () => {
      // Binding must match the server: `${room}:${pubkeyHash}` so a
      // captured proof can't be replayed under a different identity.
      const unlocked = useIdentityStore.getState().unlocked;
      if (!unlocked) {
        setError("Identity is locked — re-open NADA after creating an identity.");
        return;
      }
      const proof = await signProof("livekit", `${room}:${unlocked.pubkeyHash}`);
      if (controller.signal.aborted) return;
      if (!proof) {
        setError("Identity is locked — re-open NADA after creating an identity.");
        return;
      }

      try {
        const response = await fetch("/api/livekit", {
          method: "POST",
          signal: controller.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ room, proof })
        });
        if (!response.ok) {
          setError(`LiveKit token request failed (${response.status}).`);
          return;
        }
        const data = (await response.json()) as { token?: string };
        if (data.token) setToken(data.token);
        else setError("LiveKit token response was empty.");
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        setError("Could not reach the LiveKit token endpoint.");
      }
    })();

    return () => {
      controller.abort();
    };
  }, [call?.mode, call?.callId, signProof]);

  if (!call || call.mode !== "group") return null;

  const serverUrl = process.env['NEXT_PUBLIC_LIVEKIT_URL'];

  if (!serverUrl || error) {
    return (
      <div className="nada-call-screen fixed inset-0 z-[1000] flex flex-col items-center justify-center p-6 text-center text-white">
        <h2 className="mb-4 text-2xl font-bold tracking-[-0.02em] text-n-danger">Group Calling Unavailable</h2>
        <p className="max-w-md leading-relaxed text-white/70">
          {error
            ? error
            : "Add NEXT_PUBLIC_LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET to your environment to enable encrypted group calls."}
        </p>
        <button onClick={endCall} className="nada-btn nada-btn-ghost mt-8 px-8">
          Dismiss
        </button>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="nada-call-screen fixed inset-0 z-[1000] flex items-center justify-center">
        <div className="animate-pulse font-mono text-[12px] uppercase tracking-[0.14em] text-n-tx2">Connecting to secure group mesh…</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-n-base">
      <button
        onClick={endCall}
        className="absolute left-[max(1.5rem,env(safe-area-inset-left))] top-[max(1.5rem,env(safe-area-inset-top))] z-[1010] grid h-11 w-11 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md transition-colors hover:bg-black/60"
      >
        <X size={24} />
      </button>
      <LiveKitRoom
        video={true}
        audio={true}
        token={token}
        serverUrl={serverUrl}
        onDisconnected={endCall}
        style={{ height: '100dvh' }}
        data-lk-theme="default"
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}
