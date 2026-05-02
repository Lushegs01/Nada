"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Plus,
  Video,
  VideoOff
} from "lucide-react";
import { Avatar, cn } from "@nada/ui";
import { useCallStore, type CallPhase } from "@/stores/useCallStore";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDur(s: number): string {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
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
  return (
    <span className="text-sm tabular-nums text-white/70">{formatDur(elapsed)}</span>
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
        key="incoming-backdrop"
        className="fixed inset-0 z-[900] flex items-end justify-center p-6 md:items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <motion.div
          className="relative z-10 w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-b from-slate-800 to-slate-900 p-8 shadow-2xl"
          initial={{ y: 60, scale: 0.95, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 280 }}
        >
          <div className="flex flex-col items-center gap-4">
            {/* Pulsing avatar */}
            <div className="relative">
              <span className="absolute inset-0 animate-ping rounded-full bg-white/15" />
              <div className="relative grid h-24 w-24 place-items-center rounded-full bg-nada-accent shadow-lg">
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

            <div className="mt-4 flex w-full items-center justify-around">
              {/* Reject */}
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

              {/* Accept */}
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
// The hidden <audio> element is the KEY to remote audio playback.
// It must be always in the DOM while the call is active so the browser
// has a destination for the remote audio stream.

export function VoiceCallOverlay({ onEnd }: { onEnd: () => void }): JSX.Element | null {
  const call = useCallStore((s) => s.call);
  const toggleMute = useCallStore((s) => s.toggleMute);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  // Track last attached stream so we don't re-assign unnecessarily
  const attachedStreamRef = useRef<MediaStream | null>(null);
  const remoteStream = call?.localSession?.remoteStream ?? null;
  const callPhase = call?.phase ?? "idle";

  // Attach remote stream every render — the remoteStream object is stable but
  // tracks are added to it asynchronously. By running on every render we
  // guarantee the audio element gets the stream as soon as it exists.
  useEffect(() => {
    const el = remoteAudioRef.current;
    if (!el || !remoteStream) return;

    if (attachedStreamRef.current !== remoteStream) {
      attachedStreamRef.current = remoteStream;
      el.srcObject = remoteStream;
    }

    // Ensure audio is playing — call.phase may have just changed to "active"
    if (callPhase === "active" && el.paused) {
      el.play().catch(() => {
        // Autoplay policy: accepted call == user gesture, so this should succeed
      });
    }
  }, [callPhase, remoteStream]);

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
        {/*
          Hidden audio element — MUST be in the DOM for remote audio to play.
          autoPlay + playsInline + NOT muted = remote party's voice comes out.
        */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          style={{ position: "absolute", width: 0, height: 0, opacity: 0 }}
        />

        {/* Avatar + status */}
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
  const attachedRemoteRef = useRef<MediaStream | null>(null);
  const attachedLocalRef = useRef<MediaStream | null>(null);
  const [remoteTrackCount, setRemoteTrackCount] = useState(0);
  const remoteStream = call?.localSession?.remoteStream ?? null;
  const localStream = call?.localSession?.stream ?? null;
  const callPhase = call?.phase ?? "idle";

  useEffect(() => {
    const remoteEl = remoteVideoRef.current;
    if (remoteEl && remoteStream) {
      if (attachedRemoteRef.current !== remoteStream) {
        attachedRemoteRef.current = remoteStream;
        remoteEl.srcObject = remoteStream;
      }
      if (callPhase === "active" && remoteEl.paused) {
        remoteEl.play().catch(() => {});
      }
    }

    // Attach local stream to local (muted) PIP
    const localEl = localVideoRef.current;
    if (localEl && localStream && attachedLocalRef.current !== localStream) {
      attachedLocalRef.current = localStream;
      localEl.srcObject = localStream;
      localEl.play().catch(() => {});
    }
  }, [callPhase, localStream, remoteStream]);

  useEffect(() => {
    if (!remoteStream) {
      setRemoteTrackCount(0);
      return;
    }

    const updateTrackCount = (): void => {
      setRemoteTrackCount(remoteStream.getVideoTracks().length);
    };
    updateTrackCount();
    remoteStream.addEventListener("addtrack", updateTrackCount);
    remoteStream.addEventListener("removetrack", updateTrackCount);
    return () => {
      remoteStream.removeEventListener("addtrack", updateTrackCount);
      remoteStream.removeEventListener("removetrack", updateTrackCount);
    };
  }, [remoteStream]);

  if (!call || call.mode !== "video") return null;
  if (call.phase === "idle" || call.phase === "incoming-ringing") return null;

  const isActive = call.phase === "active";
  const showAvatar = !isActive || remoteTrackCount === 0;

  return (
    <AnimatePresence>
      <motion.div
        key="video-overlay"
        className="fixed inset-0 z-[800] flex flex-col bg-black"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Remote video — visible only when active */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={cn(
            "absolute inset-0 h-full w-full object-cover z-10",
            showAvatar ? "hidden" : "block"
          )}
        />

        {/* Fallback avatar/status when not yet active or no remote video */}
        {showAvatar && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5">
            <div className="relative">
              {(call.phase === "outgoing-ringing" || call.phase === "connecting") && (
                <span className="absolute inset-0 animate-ping rounded-full bg-white/20" />
              )}
              <div className="relative grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-nada-accent shadow-2xl ring-4 ring-white/20">
                <Avatar label={call.peerName} size="lg" />
              </div>
            </div>
            <p className="text-3xl font-semibold text-white drop-shadow-lg">{call.peerName}</p>
            <div className="flex flex-col items-center gap-1 drop-shadow-md">
              <PhaseLabel phase={call.phase} />
              <CallTimer startedAt={call.startedAt} />
            </div>
            {call.failureReason && (
              <p className="rounded-xl bg-red-500/80 px-4 py-2 text-sm text-white backdrop-blur-md">
                {call.failureReason}
              </p>
            )}
          </div>
        )}

        {/* Local video — full screen when ringing, PIP when active */}
        <motion.div 
          layout
          drag={isActive}
          dragConstraints={{ top: 16, right: -16, bottom: -120, left: -16 }}
          dragElastic={0.1}
          className={cn(
            "overflow-hidden bg-slate-900 shadow-2xl",
            isActive 
              ? "absolute right-4 top-4 z-[900] h-40 w-28 cursor-grab active:cursor-grabbing rounded-xl ring-1 ring-white/20 md:h-48 md:w-32" 
              : "absolute inset-0 z-0 h-full w-full rounded-none"
          )}
        >
          {!call.isCameraOff ? (
            <video
              ref={localVideoRef}
              autoPlay
              muted        // ← CRITICAL: local preview must be muted
              playsInline
              className={cn("h-full w-full object-cover transition-transform duration-700", !isActive && "scale-105")}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-slate-800">
              <VideoOff size={isActive ? 24 : 48} className="text-white/40" />
            </div>
          )}
          {/* Subtle gradient overlay when full screen so avatar text is readable */}
          {!isActive && <div className="absolute inset-0 bg-black/40 pointer-events-none" />}
        </motion.div>

        {/* Live call header info */}
        {isActive && (
          <div className="absolute left-0 right-0 top-0 flex flex-col items-center justify-center pt-12 bg-gradient-to-b from-black/80 via-black/40 to-transparent pb-10 pointer-events-none z-[850]">
             <div className="flex items-center gap-2 text-white/90 font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <CallTimer startedAt={call.startedAt} />
             </div>
             <span className="text-white text-lg font-semibold drop-shadow-md mt-1">{call.peerName}</span>
          </div>
        )}

        {/* Controls bar (WhatsApp style floating pill) */}
        <div className="absolute inset-x-0 bottom-8 flex justify-center pointer-events-none z-[950]">
          <div className="flex items-center gap-6 rounded-full bg-slate-900/60 backdrop-blur-xl px-6 py-4 shadow-2xl ring-1 ring-white/10 pointer-events-auto">
            <CallControl
              label={call.isCameraOff ? "Camera on" : "Camera off"}
              icon={call.isCameraOff ? VideoOff : Video}
              onClick={toggleCamera}
              active={call.isCameraOff}
              variant="neutral"
            />
            <CallControl
              label={call.isMuted ? "Unmute" : "Mute"}
              icon={call.isMuted ? MicOff : Mic}
              onClick={toggleMute}
              active={call.isMuted}
              variant="neutral"
            />
            <button
              aria-label="Add Participant"
              onClick={() => {
                 // Open an alert letting them know group calls require SFU
                 alert("Group calling requires a P2P Mesh or SFU backend upgrade. NADA's current WebRTC layer is strictly 1-on-1.");
              }}
              className="grid h-12 w-12 place-items-center rounded-full bg-white/10 transition-transform hover:scale-105 hover:bg-white/20 active:scale-95"
            >
              <Plus size={22} className="text-white" />
            </button>
            <button
              aria-label="End call"
              onClick={onEnd}
              className="grid h-14 w-14 place-items-center rounded-full bg-red-500 shadow-lg transition-transform hover:scale-105 active:scale-95 ml-2"
            >
              <PhoneOff size={24} className="text-white" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
