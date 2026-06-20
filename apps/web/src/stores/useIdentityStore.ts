"use client";

import { create } from "zustand";

import { buildIdentityProof, type IdentityProofPayload } from "@nada/crypto";

// Holds the unlocked identity in memory so non-NadaApp components (call
// overlays, TURN credential fetchers, the WebSocket store) can sign identity
// proofs. The private key is only present when the user has unlocked their
// identity; consumers that need to sign should bail out gracefully when
// `unlocked` is null.
export interface UnlockedIdentity {
  pubkey: string;
  pubkeyHash: string;
  /** base64 (libsodium ORIGINAL). */
  privateKey: string;
}

interface IdentityStoreState {
  unlocked: UnlockedIdentity | null;
  setUnlocked: (identity: UnlockedIdentity | null) => void;
  signProof: (
    context: string,
    binding?: string
  ) => Promise<IdentityProofPayload | null>;
}

export const useIdentityStore = create<IdentityStoreState>((set, get) => ({
  unlocked: null,
  setUnlocked(identity) {
    set({ unlocked: identity });
  },
  async signProof(context, binding) {
    const unlocked = get().unlocked;
    if (!unlocked) return null;
    return buildIdentityProof({
      privateKeyBase64: unlocked.privateKey,
      pubkey: unlocked.pubkey,
      pubkeyHash: unlocked.pubkeyHash,
      context,
      ...(binding ? { binding } : {})
    });
  }
}));
