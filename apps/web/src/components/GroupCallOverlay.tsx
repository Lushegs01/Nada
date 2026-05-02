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

export function GroupCallOverlay() {
  const call = useCallStore((s) => s.call);
  const endCall = useCallStore((s) => s.endCall);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (call?.mode === "group" && call.callId) {
      const room = call.callId;
      const username = call.peerName || "Anonymous";
      fetch(`/api/livekit?room=${room}&username=${encodeURIComponent(username)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.token) setToken(data.token);
        })
        .catch(console.error);
    } else {
      setToken("");
    }
  }, [call]);

  if (!call || call.mode !== "group") return null;

  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  if (!serverUrl || token === "mock-token-please-set-livekit-keys") {
    return (
      <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black p-6 text-center text-white">
        <h2 className="text-2xl font-bold text-red-400 mb-4">Group Calling Not Configured</h2>
        <p className="text-white/70 max-w-md leading-relaxed">
          To enable encrypted 10+ person group calling, you must configure a WebRTC SFU backend.
          We have integrated LiveKit for this purpose. 
          <br /><br />
          Add <code>NEXT_PUBLIC_LIVEKIT_URL</code>, <code>LIVEKIT_API_KEY</code>, and <code>LIVEKIT_API_SECRET</code> to your Render environment or local <code>.env</code> file.
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
