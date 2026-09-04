"use client";

import { create } from "zustand";

import {
  ServerSocketEnvelopeSchema,
  type CallSignalEnvelope,
  type DeletionEnvelope,
  type DeliveryEnvelope,
  type DeliveryStatus,
  type GroupMessageEnvelope,
  type MessageEnvelope,
  type PubkeyHash,
  type ReactionEnvelope,
  type TypingEnvelope
} from "@nada/types";
import { signIdentityProof } from "@nada/crypto";

import { getRelaySocketUrl } from "@/lib/relay-url";
import { useIdentityStore } from "@/stores/useIdentityStore";

type ReliableDeliveryStatus = DeliveryStatus | "read";
type ReliableDeliveryEnvelope = Omit<DeliveryEnvelope, "status"> & {
  status: ReliableDeliveryStatus;
};

type RelayStatus =
  | "idle"
  | "missing-url"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

interface RelayIdentity {
  pubkeyHash: PubkeyHash;
}

interface SocketState {
  callSignals: CallSignalEnvelope[];
  deliveries: Record<string, ReliableDeliveryStatus>;
  groupIncoming: GroupMessageEnvelope[];
  incoming: MessageEnvelope[];
  /** Map of chatId -> sender pubkeyHash for active typing indicators */
  typingIndicators: Record<string, string>;
  /** Incoming reactions from the relay [chatId:messageId:emoji:sender, ...] deduplicated via a set in useEffect */
  incomingReactions: ReactionEnvelope[];
  /** Incoming deletions from the relay */
  incomingDeletions: DeletionEnvelope[];
  lastError: string | null;
  reconnectAttempt: number;
  registeredIdentity: RelayIdentity | null;
  shouldReconnect: boolean;
  socket: WebSocket | null;
  status: RelayStatus;
  /** When true, typing events are NOT emitted and online status is suppressed */
  ghostMode: boolean;
  connect: (identity: RelayIdentity) => void;
  disconnect: () => void;
  sendEnvelope: (envelope: MessageEnvelope) => boolean;
  sendGroupEnvelope: (envelope: GroupMessageEnvelope) => boolean;
  sendCallSignal: (envelope: CallSignalEnvelope) => boolean;
  /**
   * Sends a typing event — no-ops silently when ghostMode is ON.
   */
  sendTyping: (envelope: TypingEnvelope) => boolean;
  sendReaction: (envelope: ReactionEnvelope) => boolean;
  sendDeletion: (envelope: DeletionEnvelope) => boolean;
  sendDelivery: (envelope: ReliableDeliveryEnvelope) => boolean;
  setGhostMode: (enabled: boolean) => void;
  /**
   * Drops events a consumer has finished with. Without this the buffers only
   * ever grew, and every consumer had to keep its own unbounded set of ids it
   * had already seen just to avoid reprocessing them.
   */
  acknowledge: (buffer: SocketBuffer, ids: string[]) => void;
}

/**
 * Ceiling on each inbound buffer.
 *
 * These arrays are a hand-off between the socket and the components that
 * persist their contents; consumers acknowledge what they have stored, which
 * is what normally empties them. The cap is the backstop: a PWA is meant to
 * stay installed for weeks, and before this every envelope, reaction and
 * delivery receipt a session ever saw stayed in memory for its whole life.
 * Evicting the oldest is the right failure mode — an envelope old enough to
 * be evicted has either been persisted already or is long superseded.
 */
export const MAX_BUFFERED_EVENTS = 500;
/** Delivery receipts are keyed by message id and equally unbounded. */
export const MAX_TRACKED_DELIVERIES = 1000;

export function appendBounded<T>(buffer: T[], item: T): T[] {
  const next = [...buffer, item];
  return next.length > MAX_BUFFERED_EVENTS
    ? next.slice(next.length - MAX_BUFFERED_EVENTS)
    : next;
}

export function trackDelivery(
  deliveries: Record<string, ReliableDeliveryStatus>,
  id: string,
  status: ReliableDeliveryStatus
): Record<string, ReliableDeliveryStatus> {
  const next = { ...deliveries, [id]: status };
  const keys = Object.keys(next);
  if (keys.length <= MAX_TRACKED_DELIVERIES) {
    return next;
  }
  // Object key order is insertion order for string keys, so the oldest
  // receipts are at the front.
  for (const stale of keys.slice(0, keys.length - MAX_TRACKED_DELIVERIES)) {
    delete next[stale];
  }
  return next;
}

/** Buffers a consumer can acknowledge once it has persisted their contents. */
export type SocketBuffer =
  | "incoming"
  | "groupIncoming"
  | "callSignals"
  | "incomingReactions"
  | "incomingDeletions";

let reconnectTimer: number | null = null;

export const useSocketStore = create<SocketState>((set, get) => {
  const scheduleReconnect = (): void => {
    const state = get();
    if (!state.shouldReconnect || !state.registeredIdentity) {
      return;
    }

    // Full jitter over the backoff window. A relay deploy or restart drops
    // every socket at the same instant; with a deterministic 1s/2s/4s ladder
    // the whole population reconnects in lockstep and re-DDoSes the instance
    // that just came back. Randomising within the window spreads the retry
    // across it, which is what lets the fleet recover instead of thrashing.
    const ceiling = Math.min(30000, 1000 * 2 ** state.reconnectAttempt);
    const delay = 500 + Math.random() * ceiling;
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
    }

    reconnectTimer = window.setTimeout(() => {
      const identity = get().registeredIdentity;
      if (!identity) {
        return;
      }

      set((current) => ({
        reconnectAttempt: current.reconnectAttempt + 1
      }));
      get().connect(identity);
    }, delay);
  };

  return {
    callSignals: [],
    deliveries: {},
    groupIncoming: [],
    incoming: [],
    incomingReactions: [],
    incomingDeletions: [],
    lastError: null,
    reconnectAttempt: 0,
    registeredIdentity: null,
    shouldReconnect: false,
    socket: null,
    status: "idle",
    typingIndicators: {},
    ghostMode: false,
    connect: (identity) => {
      const current = get();
      if (
        current.socket &&
        (current.socket.readyState === WebSocket.CONNECTING ||
          current.socket.readyState === WebSocket.OPEN)
      ) {
        return;
      }

      const url = getRelaySocketUrl();
      if (!url) {
        set({
          lastError: "Relay URL is not configured.",
          registeredIdentity: identity,
          shouldReconnect: false,
          status: "missing-url"
        });
        return;
      }

      const socket = new WebSocket(url);
      set({
        lastError: null,
        registeredIdentity: identity,
        shouldReconnect: true,
        socket,
        status: "connecting"
      });

      socket.addEventListener("open", () => {
        // Don't send register here — wait for the server's challenge envelope
        // and reply with a signed register. Until then we are "connecting".
        set({ reconnectAttempt: 0 });
      });

      socket.addEventListener("message", (event: MessageEvent) => {
        if (typeof event.data !== "string") {
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          set({ lastError: "Relay sent invalid JSON.", status: "error" });
          return;
        }

        const result = ServerSocketEnvelopeSchema.safeParse(parsed);
        if (!result.success) {
          set({ lastError: "Relay sent an invalid envelope.", status: "error" });
          return;
        }

        switch (result.data.type) {
          case "challenge": {
            const nonce = result.data.nonce;
            const unlocked = useIdentityStore.getState().unlocked;
            if (!unlocked) {
              set({
                lastError:
                  "Cannot register with the relay: identity is locked.",
                status: "error"
              });
              socket.close();
              return;
            }
            const timestamp = Date.now();
            const message = `ws-register:${timestamp}:${unlocked.pubkeyHash}:${nonce}`;
            void signIdentityProof(unlocked.privateKey, message)
              .then((signature) => {
                if (socket.readyState !== WebSocket.OPEN) return;
                socket.send(
                  JSON.stringify({
                    type: "register",
                    pubkeyHash: unlocked.pubkeyHash,
                    pubkey: unlocked.pubkey,
                    signature,
                    nonce,
                    timestamp
                  })
                );
              })
              .catch(() => {
                set({
                  lastError: "Failed to sign WebSocket register challenge.",
                  status: "error"
                });
                socket.close();
              });
            break;
          }
          case "registered": {
            set({ status: "connected" });
            break;
          }
          case "message": {
            const envelope = result.data.envelope;
            set((state) => ({
              incoming: appendBounded(state.incoming, envelope)
            }));
            break;
          }
          case "group-message": {
            const envelope = result.data.envelope;
            set((state) => ({
              groupIncoming: appendBounded(state.groupIncoming, envelope)
            }));
            break;
          }
          case "call-signal": {
            const envelope = result.data.envelope;
            set((state) => ({
              callSignals: appendBounded(state.callSignals, envelope)
            }));
            break;
          }
          case "typing": {
            const envelope = result.data.envelope;
            if (envelope.isTyping) {
              set((state) => ({
                typingIndicators: {
                  ...state.typingIndicators,
                  [envelope.chatId]: envelope.sender
                }
              }));
              // Auto-clear after 5 seconds if no update
              setTimeout(() => {
                const current = get().typingIndicators[envelope.chatId];
                if (current === envelope.sender) {
                  set((state) => {
                    const next = { ...state.typingIndicators };
                    delete next[envelope.chatId];
                    return { typingIndicators: next };
                  });
                }
              }, 5000);
            } else {
              set((state) => {
                const next = { ...state.typingIndicators };
                delete next[envelope.chatId];
                return { typingIndicators: next };
              });
            }
            break;
          }
          case "reaction": {
            const envelope = result.data.envelope;
            set((state) => ({
              incomingReactions: appendBounded(state.incomingReactions, envelope)
            }));
            break;
          }
          case "deletion": {
            const envelope = result.data.envelope;
            set((state) => ({
              incomingDeletions: appendBounded(state.incomingDeletions, envelope)
            }));
            break;
          }
          case "delivery": {
            const { id, status } = result.data;
            set((state) => ({
              deliveries: trackDelivery(state.deliveries, id, status)
            }));
            break;
          }
          case "error": {
            const message = result.data.message;
            set({ lastError: message, status: "error" });
            break;
          }
        }
      });

      socket.addEventListener("close", () => {
        set({ socket: null, status: "disconnected" });
        scheduleReconnect();
      });

      socket.addEventListener("error", () => {
        set({ lastError: "Relay connection failed.", status: "error" });
      });
    },
    disconnect: () => {
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      const socket = get().socket;
      set({ shouldReconnect: false, socket: null, status: "idle" });
      if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close();
      }
    },
    sendEnvelope: (envelope) => {
      const socket = get().socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      socket.send(JSON.stringify(envelope));
      return true;
    },
    sendGroupEnvelope: (envelope) => {
      const socket = get().socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      socket.send(JSON.stringify(envelope));
      return true;
    },
    sendCallSignal: (envelope) => {
      const socket = get().socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      socket.send(JSON.stringify(envelope));
      return true;
    },
    sendTyping: (envelope) => {
      // Ghost mode: suppress typing indicator entirely
      if (get().ghostMode) return false;

      const socket = get().socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      socket.send(JSON.stringify(envelope));
      return true;
    },
    sendReaction: (envelope) => {
      const socket = get().socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      socket.send(JSON.stringify(envelope));
      return true;
    },
    sendDeletion: (envelope) => {
      const socket = get().socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      socket.send(JSON.stringify(envelope));
      return true;
    },
    sendDelivery: (envelope) => {
      const socket = get().socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      socket.send(JSON.stringify(envelope));
      return true;
    },
    setGhostMode: (enabled) => {
      set({ ghostMode: enabled });
    },
    acknowledge: (buffer, ids) => {
      if (ids.length === 0) return;
      const done = new Set(ids);
      set((state) => ({
        [buffer]: (state[buffer] as { id: string }[]).filter(
          (event) => !done.has(event.id)
        )
      }) as Partial<SocketState>);
    }
  };
});
