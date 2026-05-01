"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Video, VideoOff, Phone, PhoneOff, PhoneIncoming
} from "lucide-react";
import { Avatar, cn } from "@nada/ui";
import { useCallStore, type CallPhase } from "@/stores/useCallStore";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDur(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function PhaseLabel({ phase }: { phase: CallPhase }): JSX.Element {
  const copy: Record<CallPhase, string> = {
    idle: "",
    "outgoing-ringing": "Calling…",
    "incoming-ringing": "Incoming call",
    connecting: "Connecting…",
    active: "Connected",
    ended: "Call ended",
    failed: "Call failed"
  };
  return <span className="text-sm font-medium text-white/80">{copy[phase]}</span>;
}

// ── Call duration timer ───────────────────────────────────────────────────────

function CallTimer({ startedAt }: { startedAt: number | null }): JSX.Element | null {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return null;
  return <span className="text-sm tabular-nums text-white/70">{formatDur(elapsed)}</span>;
}

// ── Ringing animation ─────────────────────────────────────────────────────────

function RingPulse(): JSX.Element {
  return (
    <span className="absolute inset-0 animate-ping rounded-full bg-white/20" />
  );
}

// ── Incoming call modal ───────────────────────────────────────────────────────

export function IncomingCallModal({
  onAccept,
  onReject
}: {
  onAccept: () => void;
  onReject: () => void;
}): JSX.Element | null {
  const call = useCallStore((s) => s.call);
  if (!call || call.phase !== "incoming-ringing") return null;

  return (
    <AnimatePresence>
      <motion.div
        key="incoming"
        className="fixed inset-0 z-[900] flex items-end justify-center p-6 md:items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <motion.div
          className="relative z-10 w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-b from-slate-800 to-slate-900 p-8 shadow-2xl"
          initial={{ y: 60, scale: 0.95, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 280 }}
        >
          {/* avatar */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <RingPulse />
              <div className="relative grid h-24 w-24 place-items-center rounded-full bg-nada-accent text-4xl font-bold text-white shadow-lg">
                <Avatar label={call.peerName} size="lg" />
              </div>
            </div>

            <div className="text-center">
              <p className="text-xl font-semibold text-white">{call.peerName}</p>
              <div className="mt-1 flex items-center justify-center gap-1.5">
                {call.mode === "video" ? (
                  <Video size={13} className="text-white/60" />
                ) : (
                  <Phone size={13} className="text-white/60" />
                )}
                <span className="text-sm text-white/60">
                  Incoming {call.mode} call
                </span>
              </div>
            </div>

            {/* accept / reject */}
            <div className="mt-4 flex w-full items-center justify-around">
              <div className="flex flex-col items-center gap-2">
                <button
                  aria-label="Reject call"
                  onClick={onReject}
                  className="grid h-16 w-16 place-items-center rounded-full bg-red-500 shadow-lg transition-all hover:scale-105 hover:bg-red-400 active:scale-95"
                >
                  <PhoneOff size={26} className="text-white" />
                </button>
                <span className="text-xs text-white/50">Decline</span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <button
                  aria-label="Accept call"
                  onClick={onAccept}
                  className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500 shadow-lg transition-all hover:scale-105 hover:bg-emerald-400 active:scale-95"
                >
                  <PhoneIncoming size={26} className="text-white" />
                </button>
                <span className="text-xs text-white/50">Accept</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Voice Call Overlay ────────────────────────────────────────────────────────

export function VoiceCallOverlay({ onEnd }: { onEnd: () => void }): JSX.Element | null {
  const call = useCallStore((s) => s.call);
  const toggleMute = useCallStore((s) => s.toggleMute);

  if (!call || call.mode !== "voice") return null;
  if (call.phase === "idle" || call.phase === "incoming-ringing") return null;

  return (
    <AnimatePresence>
      <motion.div
        key="voice-overlay"
        className="fixed inset-0 z-[800] flex flex-col items-center justify-between bg-gradient-to-b from-slate-800 via-slate-900 to-black pb-16 pt-20"
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        {/* Avatar / status */}
        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            {(call.phase === "outgoing-ringing" || call.phase === "connecting") && (
              <span className="absolute inset-0 animate-ping rounded-full bg-white/10" />
            )}
            <div className="relative grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-nada-accent shadow-2xl ring-4 ring-white/10">
              <Avatar label={call.peerName} size="lg" />
            </div>
          </div>

          <div className="text-center">
            <p className="text-2xl font-semibold text-white">{call.peerName}</p>
            <div className="mt-2 flex flex-col items-center gap-1">
              <PhaseLabel phase={call.phase} />
              <CallTimer startedAt={call.startedAt} />
            </div>
          </div>

          {call.failureReason && (
            <p className="rounded-xl bg-red-500/20 px-4 py-2 text-sm text-red-300">
              {call.failureReason}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-6">
          <CallControl
            label={call.isMuted ? "Unmute" : "Mute"}
            icon={call.isMuted ? MicOff : Mic}
            onClick={toggleMute}
            active={call.isMuted}
            variant="neutral"
          />
          <button
            aria-label="End call"
            onClick={onEnd}
            className="grid h-20 w-20 place-items-center rounded-full bg-red-500 shadow-2xl transition-all hover:scale-105 hover:bg-red-400 active:scale-95"
          >
            <PhoneOff size={30} className="text-white" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Video Call Overlay ────────────────────────────────────────────────────────

export function VideoCallOverlay({ onEnd }: { onEnd: () => void }): JSX.Element | null {
  const call = useCallStore((s) => s.call);
  const toggleMute = useCallStore((s) => s.toggleMute);
  const toggleCamera = useCallStore((s) => s.toggleCamera);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (remoteVideoRef.current && call?.remoteStream) {
      remoteVideoRef.current.srcObject = call.remoteStream;
    }
  }, [call?.remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && call?.localSession?.stream) {
      localVideoRef.current.srcObject = call.localSession.stream;
    }
  }, [call?.localSession?.stream]);

  if (!call || call.mode !== "video") return null;
  if (call.phase === "idle" || call.phase === "incoming-ringing") return null;

  const showRemoteVideo = call.phase === "active" && call.remoteStream;

  return (
    <AnimatePresence>
      <motion.div
        key="video-overlay"
        className="fixed inset-0 z-[800] flex flex-col bg-black"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Remote video (full screen) */}
        {showRemoteVideo ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-5 bg-gradient-to-b from-slate-800 to-black">
            <div className="relative">
              {(call.phase === "outgoing-ringing" || call.phase === "connecting") && (
                <span className="absolute inset-0 animate-ping rounded-full bg-white/10" />
              )}
              <div className="relative grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-nada-accent shadow-2xl ring-4 ring-white/10">
                <Avatar label={call.peerName} size="lg" />
              </div>
            </div>
            <p className="text-2xl font-semibold text-white">{call.peerName}</p>
            <div className="flex flex-col items-center gap-1">
              <PhaseLabel phase={call.phase} />
              <CallTimer startedAt={call.startedAt} />
            </div>
            {call.failureReason && (
              <p className="rounded-xl bg-red-500/20 px-4 py-2 text-sm text-red-300">
                {call.failureReason}
              </p>
            )}
          </div>
        )}

        {/* Local video PIP */}
        <div className="absolute right-4 top-4 h-36 w-24 overflow-hidden rounded-2xl border-2 border-white/20 bg-black shadow-2xl md:h-44 md:w-32">
          {call.localSession?.stream && !call.isCameraOff ? (
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-800">
              <VideoOff size={20} className="text-white/40" />
            </div>
          )}
        </div>

        {/* Status overlay (when active) */}
        {call.phase === "active" && (
          <div className="absolute left-4 top-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <CallTimer startedAt={call.startedAt} />
          </div>
        )}

        {/* Controls bar */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-5 bg-gradient-to-t from-black/90 to-transparent px-6 pb-14 pt-10">
          <CallControl
            label={call.isMuted ? "Unmute" : "Mute"}
            icon={call.isMuted ? MicOff : Mic}
            onClick={toggleMute}
            active={call.isMuted}
            variant="neutral"
          />
          <button
            aria-label="End call"
            onClick={onEnd}
            className="grid h-16 w-16 place-items-center rounded-full bg-red-500 shadow-2xl transition-all hover:scale-105 hover:bg-red-400 active:scale-95"
          >
            <PhoneOff size={26} className="text-white" />
          </button>
          <CallControl
            label={call.isCameraOff ? "Camera on" : "Camera off"}
            icon={call.isCameraOff ? VideoOff : Video}
            onClick={toggleCamera}
            active={call.isCameraOff}
            variant="neutral"
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Shared control button ─────────────────────────────────────────────────────

function CallControl({
  label,
  icon: Icon,
  onClick,
  active,
  variant
}: {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  active: boolean;
  variant: "neutral" | "danger";
}): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        aria-label={label}
        onClick={onClick}
        className={cn(
          "grid h-14 w-14 place-items-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95",
          variant === "danger"
            ? "bg-red-500 hover:bg-red-400"
            : active
            ? "bg-white/30 ring-2 ring-white/40"
            : "bg-white/15 hover:bg-white/25"
        )}
      >
        <Icon size={22} className="text-white" />
      </button>
      <span className="text-xs text-white/50">{label}</span>
    </div>
  );
}
