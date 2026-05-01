"use client";

import { create } from "zustand";
import {
  stopLocalCallSession,
  type CallMode,
  type LocalCallSession
} from "@/lib/webrtc";

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
  startedAt: number | null;
  isMuted: boolean;
  isCameraOff: boolean;
  failureReason: string | null;
  // Pending SDP/ICE from signaling (before the session is created on callee side)
  pendingOfferSdp: string | null;
  pendingIceCandidates: RTCIceCandidateInit[];
}

interface CallStoreState {
  call: ActiveCallInfo | null;

  receiveIncomingOffer: (params: {
    callId: string;
    mode: CallMode;
    peerPubkeyHash: string;
    peerName: string;
    offerSdp: string;
  }) => void;

  setOutgoingCall: (params: {
    callId: string;
    mode: CallMode;
    peerPubkeyHash: string;
    peerName: string;
    localSession: LocalCallSession;
  }) => void;

  attachLocalSession: (session: LocalCallSession) => void;
  setPhase: (phase: CallPhase) => void;
  setStartedAt: (ts: number) => void;
  addPendingIce: (candidate: RTCIceCandidateInit) => void;
  clearPendingIce: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  endCall: () => void;
  failCall: (reason: string) => void;
}

export const useCallStore = create<CallStoreState>((set, get) => ({
  call: null,

  receiveIncomingOffer({ callId, mode, peerPubkeyHash, peerName, offerSdp }) {
    // If already in an active call, silently drop
    const existing = get().call;
    if (existing && existing.phase !== "idle" && existing.phase !== "ended") {
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
        startedAt: null,
        isMuted: false,
        isCameraOff: false,
        failureReason: null,
        pendingOfferSdp: offerSdp,
        pendingIceCandidates: []
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
        startedAt: null,
        isMuted: false,
        isCameraOff: false,
        failureReason: null,
        pendingOfferSdp: null,
        pendingIceCandidates: []
      }
    });
  },

  attachLocalSession(session) {
    set((s) =>
      s.call
        ? {
            call: {
              ...s.call,
              localSession: session,
              phase: "connecting"
            }
          }
        : s
    );
  },

  setPhase(phase) {
    set((s) => (s.call ? { call: { ...s.call, phase } } : s));
  },

  setStartedAt(ts) {
    set((s) => (s.call ? { call: { ...s.call, startedAt: ts } } : s));
  },

  addPendingIce(candidate) {
    set((s) =>
      s.call
        ? {
            call: {
              ...s.call,
              pendingIceCandidates: [...s.call.pendingIceCandidates, candidate]
            }
          }
        : s
    );
  },

  clearPendingIce() {
    set((s) => (s.call ? { call: { ...s.call, pendingIceCandidates: [] } } : s));
  },

  toggleMute() {
    const { call } = get();
    if (!call?.localSession) return;
    const nextMuted = !call.isMuted;
    call.localSession.stream.getAudioTracks().forEach((t) => {
      t.enabled = !nextMuted;
    });
    set((s) => (s.call ? { call: { ...s.call, isMuted: nextMuted } } : s));
  },

  toggleCamera() {
    const { call } = get();
    if (!call?.localSession) return;
    const nextOff = !call.isCameraOff;
    call.localSession.stream.getVideoTracks().forEach((t) => {
      t.enabled = !nextOff;
    });
    set((s) => (s.call ? { call: { ...s.call, isCameraOff: nextOff } } : s));
  },

  endCall() {
    const { call } = get();
    if (call?.localSession) {
      stopLocalCallSession(call.localSession);
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
        ? {
            call: {
              ...s.call,
              phase: "failed",
              failureReason: reason,
              localSession: null
            }
          }
        : s
    );
  }
}));
