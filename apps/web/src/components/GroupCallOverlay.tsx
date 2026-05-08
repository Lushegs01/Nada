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
      const proof = await signProof("livekit", room);
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
      <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black p-6 text-center text-white">
        <h2 className="text-2xl font-bold text-red-400 mb-4">Group Calling Unavailable</h2>
        <p className="text-white/70 max-w-md leading-relaxed">
          {error
            ? error
            : "Add NEXT_PUBLIC_LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET to your environment to enable encrypted group calls."}
        </p>
        <button onClick={endCall} className="mt-8 rounded-full bg-white/10 px-8 py-3 font-semibold hover:bg-white/20 transition-colors">
          Dismiss
        </button>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black">
        <div className="animate-pulse text-white/50 font-medium">Connecting to secure group mesh...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-black">
      <button 
        onClick={endCall}
        className="absolute left-6 top-6 z-[1010] p-3 rounded-full bg-black/40 backdrop-blur-md hover:bg-black/60 text-white transition-colors"
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
