"use client";

import { create } from "zustand";
import { stopLocalCallSession, type CallMode, type LocalCallSession } from "@/lib/webrtc";

// ─── Call State Machine ───────────────────────────────────────────────────────
// idle → outgoing-ringing → connecting → active
//      ↑                                      ↓
//      ← ← ← ← ← ← ← ended ← ← ← ← ← ← ← ←
// idle → incoming-ringing → (accepted → connecting → active) | (rejected → idle)

export type CallPhase =
  | "idle"
  | "outgoing-ringing"
  | "incoming-ringing"
  | "connecting"
  | "active"
  | "ended"
  | "failed";

export interface ActiveCallInfo {
  callId: string;
  mode: CallMode;
  peerPubkeyHash: string;
  peerName: string;
  phase: CallPhase;
  localSession: LocalCallSession | null;
  remoteStream: MediaStream | null;
  startedAt: number | null;   // timestamp when phase became "active"
  isMuted: boolean;
  isCameraOff: boolean;
  failureReason: string | null;
}

interface CallStoreState {
  call: ActiveCallInfo | null;
  /** Called by Dashboard when a call:offer signal arrives */
  receiveIncomingOffer: (params: {
    callId: string;
    mode: CallMode;
    peerPubkeyHash: string;
    peerName: string;
    offerSdp: string;
  }) => void;
  /** Set after we create the local session for an outgoing call */
  setOutgoingCall: (params: {
    callId: string;
    mode: CallMode;
    peerPubkeyHash: string;
    peerName: string;
    localSession: LocalCallSession;
  }) => void;
  setPhase: (phase: CallPhase) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setStartedAt: (ts: number) => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  endCall: () => void;
  failCall: (reason: string) => void;
}

export const useCallStore = create<CallStoreState>((set, get) => ({
  call: null,

  receiveIncomingOffer({ callId, mode, peerPubkeyHash, peerName }) {
    // If already in a call, reject silently
    if (get().call && get().call!.phase !== "idle" && get().call!.phase !== "ended") {
      return;
    }
    set({
      call: {
        callId,
        mode,
        peerPubkeyHash,
        peerName,
        phase: "incoming-ringing",
        localSession: null,
        remoteStream: null,
        startedAt: null,
        isMuted: false,
        isCameraOff: false,
        failureReason: null
      }
    });
  },

  setOutgoingCall({ callId, mode, peerPubkeyHash, peerName, localSession }) {
    set({
      call: {
        callId,
        mode,
        peerPubkeyHash,
        peerName,
        phase: "outgoing-ringing",
        localSession,
        remoteStream: null,
        startedAt: null,
        isMuted: false,
        isCameraOff: false,
        failureReason: null
      }
    });
  },

  setPhase(phase) {
    set((s) => s.call ? { call: { ...s.call, phase } } : s);
  },

  setRemoteStream(stream) {
    set((s) => s.call ? { call: { ...s.call, remoteStream: stream } } : s);
  },

  setStartedAt(ts) {
    set((s) => s.call ? { call: { ...s.call, startedAt: ts } } : s);
  },

  toggleMute() {
    const { call } = get();
    if (!call?.localSession) return;
    const nextMuted = !call.isMuted;
    call.localSession.stream.getAudioTracks().forEach((t) => {
      t.enabled = !nextMuted;
    });
    set((s) => s.call ? { call: { ...s.call, isMuted: nextMuted } } : s);
  },

  toggleCamera() {
    const { call } = get();
    if (!call?.localSession) return;
    const nextOff = !call.isCameraOff;
    call.localSession.stream.getVideoTracks().forEach((t) => {
      t.enabled = !nextOff;
    });
    set((s) => s.call ? { call: { ...s.call, isCameraOff: nextOff } } : s);
  },

  endCall() {
    const { call } = get();
    if (call?.localSession) {
      stopLocalCallSession(call.localSession);
    }
    if (call?.remoteStream) {
      call.remoteStream.getTracks().forEach((t) => t.stop());
    }
    set({ call: null });
  },

  failCall(reason) {
    const { call } = get();
    if (call?.localSession) {
      stopLocalCallSession(call.localSession);
    }
    set((s) =>
      s.call
        ? { call: { ...s.call, phase: "failed", failureReason: reason } }
        : s
    );
  }
}));
