"use client";

import { create } from "zustand";

import {
  ServerSocketEnvelopeSchema,
  type CallSignalEnvelope,
  type DeliveryStatus,
  type GroupMessageEnvelope,
  type MessageEnvelope,
  type ProductionEnvelope,
  type PubkeyHash,
  type ReactionEnvelope,
  type TypingEnvelope
} from "@nada/types";

import { getRelaySocketUrl } from "@/lib/relay-url";

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
  deliveries: Record<string, DeliveryStatus>;
  groupIncoming: GroupMessageEnvelope[];
  incoming: MessageEnvelope[];
  sealedIncoming: ProductionEnvelope[];
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
  setGhostMode: (enabled: boolean) => void;
}

let reconnectTimer: number | null = null;

export const useSocketStore = create<SocketState>((set, get) => {
  const scheduleReconnect = (): void => {
    const state = get();
    if (!state.shouldReconnect || !state.registeredIdentity) {
      return;
    }

    const delay = Math.min(30000, 1000 * 2 ** state.reconnectAttempt);
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
    sealedIncoming: [],
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
        socket.send(
          JSON.stringify({ type: "register", pubkeyHash: identity.pubkeyHash })
        );
        set({ reconnectAttempt: 0, status: "connected" });
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
          case "message": {
            const envelope = result.data.envelope;
            set((state) => ({
              incoming: [...state.incoming, envelope]
            }));
            break;
          }
          case "group-message": {
            const envelope = result.data.envelope;
            set((state) => ({
              groupIncoming: [...state.groupIncoming, envelope]
            }));
            break;
          }
          case "call-signal": {
            const envelope = result.data.envelope;
            set((state) => ({
              callSignals: [...state.callSignals, envelope]
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
              incomingReactions: [...state.incomingReactions, envelope]
            }));
            break;
          }
          case "deletion": {
            const envelope = result.data.envelope;
            set((state) => ({
              incomingDeletions: [...state.incomingDeletions, envelope]
            }));
            break;
          }
          case "sealed-message": {
            const envelope = result.data.envelope;
            set((state) => ({
              sealedIncoming: [...state.sealedIncoming, envelope]
            }));
            break;
          }
          case "delivery": {
            const { id, status } = result.data;
            set((state) => ({
              deliveries: {
                ...state.deliveries,
                [id]: status
              }
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
    setGhostMode: (enabled) => {
      set({ ghostMode: enabled });
    }
  };
});
