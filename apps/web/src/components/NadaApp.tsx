"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  Copy,
  CreditCard,
  Download,
  Edit3,
  Gift,
  MessageCircle,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  Plus,
  QrCode,
  Reply,
  Search,
  Send,
  Settings,
  Share2,
  ShieldAlert,
  Trash2,
  Upload,
  Users,
  Smile,
  Video,
  WifiOff,
  X
} from "lucide-react";
import { IncomingCallModal, VoiceCallOverlay, VideoCallOverlay } from "@/components/CallOverlay";
import { VoiceNoteBubble, VoiceRecorderBar, isVoiceNoteMessage, parseVoiceNoteBody } from "@/components/VoiceNote";
import { EmojiPicker } from "@/components/EmojiPicker";
import { useCallStore } from "@/stores/useCallStore";
import { QRCodeSVG } from "qrcode.react";

import {
  createAnonymousIdentity,
  createSeedPhrase,
  createGroupSenderKey,
  encryptGroupMessage,
  mockEncryptMessage,
  mockDecryptMessage
} from "@nada/crypto";
import type {
  ChatRecord,
  ContactRecord,
  IdentityRecord,
  MessageRecord
} from "@nada/db";
import type {
  CallSignalEnvelope,
  GroupMessageEnvelope,
  GroupInvitePayload,
  InvitePayload,
  MessageEnvelope,
  PaidBillingPlan,
  SubscriptionStatusResponse
} from "@nada/types";
import { Avatar, Button, IconButton, cn } from "@nada/ui";

import {
  directChatId,
  loadMessagesForChat,
  nadaDb,
  primaryIdentityId
} from "@/lib/db";
import {
  fetchSubscriptionStatus,
  redeemReferral,
  startCheckout
} from "@/lib/billing";
import { requestBlindUploadSlot } from "@/lib/blind-upload";
import { encryptFileForBlindUpload } from "@/lib/file-encryption";
import {
  buildGroupMigrationPayload,
  parseGroupMigrationPayload
} from "@/lib/group-migration";
import {
  buildGroupInviteUrl,
  buildInviteUrl,
  parseGroupInviteInput,
  parseGroupInviteToken,
  parseInviteInput,
  parseInviteToken
} from "@/lib/invite";
import {
  buildShareCardPayload,
  shareInviteCard
} from "@/lib/share-card";
import { createLocalCallSession } from "@/lib/webrtc";
import type { CallMode } from "@/lib/webrtc";
import { useSocketStore } from "@/stores/useSocketStore";

type Panel =
  | "billing"
  | "contacts"
  | "group"
  | "migration"
  | "settings"
  | "share"
  | null;

export function NadaApp(): JSX.Element {
  const [identity, setIdentity] = useState<IdentityRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isOnline = useOnlineStatus();
  const connect = useSocketStore((state) => state.connect);
  const disconnect = useSocketStore((state) => state.disconnect);

  useEffect(() => {
    let active = true;

    void nadaDb.identity.get(primaryIdentityId).then((record) => {
      if (!active) {
        return;
      }

      setIdentity(record ?? null);
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!identity) {
      return;
    }

    connect({ pubkeyHash: identity.pubkeyHash });
    return () => {
      disconnect();
    };
  }, [connect, disconnect, identity]);

  const handleComplete = useCallback((nextIdentity: IdentityRecord) => {
    setIdentity(nextIdentity);
  }, []);

  if (isLoading) {
    return <Splash />;
  }

  return (
    <main className="nada-shell min-h-dvh">
      <OfflineBanner isOnline={isOnline} />
      {identity ? (
        <Dashboard identity={identity} />
      ) : (
        <Onboarding onComplete={handleComplete} />
      )}
    </main>
  );
}

function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const handleOnline = (): void => {
      setIsOnline(true);
    };
    const handleOffline = (): void => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

function OfflineBanner({ isOnline }: { isOnline: boolean }): JSX.Element | null {
  if (isOnline) {
    return null;
  }

  return (
    <motion.div
      animate={{ y: 0, opacity: 1 }}
      className="fixed inset-x-0 top-0 z-toast flex items-center justify-center gap-2 bg-nada-danger px-4 py-2.5 text-xs font-medium text-white shadow-md"
      initial={{ y: -40, opacity: 0 }}
    >
      <WifiOff size={14} />
      You are offline — messages will sync when reconnected
    </motion.div>
  );
}

function Splash(): JSX.Element {
  return (
    <main className="grid min-h-dvh place-items-center bg-nada-bg">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-xl font-bold text-white shadow-lg">
          N
        </div>
        <div className="flex items-center gap-2">
          <div className="nada-typing-dot" />
          <div className="nada-typing-dot" />
          <div className="nada-typing-dot" />
        </div>
      </div>
    </main>
  );
}

function Onboarding({
  onComplete
}: {
  onComplete: (identity: IdentityRecord) => void;
}): JSX.Element {
  const [displayName, setDisplayName] = useState("");
  const [draft, setDraft] = useState<IdentityRecord | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState("");
  const seedWords = useMemo(() => seedPhrase.split(" ").filter(Boolean), [seedPhrase]);

  const generateIdentity = async (): Promise<void> => {
    setIsGenerating(true);
    const phrase = createSeedPhrase();
    const anonymousIdentity = await createAnonymousIdentity(phrase);
    setSeedPhrase(phrase);
    setDraft({
      id: primaryIdentityId,
      pubkey: anonymousIdentity.pubkey,
      pubkeyHash: anonymousIdentity.pubkeyHash,
      encryptedPrivateKey: anonymousIdentity.encryptedPrivateKey,
      seedBackupStatus: "pending",
      createdAt: anonymousIdentity.createdAt
    });
    setIsGenerating(false);
  };

  const finish = async (): Promise<void> => {
    if (!draft || !saved) {
      return;
    }

    const confirmed: IdentityRecord = {
      ...draft,
      seedBackupStatus: "confirmed"
    };
    await nadaDb.identity.put(confirmed);
    await nadaDb.settings.put({
      key: "displayName",
      value: displayName.trim() || "NADA",
      updatedAt: Date.now()
    });
    onComplete(confirmed);
  };

  return (
    <section className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-12">
      <div className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-lg font-bold text-white shadow-lg animate-scale-in">
        N
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-nada-accent">
        NADA
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-nada-primary">Anonymous by default.</h1>
      <p className="mt-3 text-base text-nada-secondary leading-relaxed">
        Your identity is a keypair generated on this device. No phone number,
        email, or contact upload.
      </p>

      {!draft ? (
        <Button
          className="mt-8 w-full"
          disabled={isGenerating}
          onClick={() => {
            void generateIdentity();
          }}
          size="lg"
        >
          {isGenerating ? "Creating identity..." : "Create identity"}
        </Button>
      ) : (
        <div className="mt-8 space-y-5 animate-fade-in">
          <div className="nada-surface-elevated grid grid-cols-3 gap-2 rounded-2xl p-3">
            {seedWords.map((word, index) => (
              <div
                className="rounded-xl bg-nada-muted px-3 py-2.5 text-xs text-nada-primary"
                key={`${word}-${index}`}
              >
                <span className="mr-1 text-nada-secondary">{index + 1}</span>
                {word}
              </div>
            ))}
          </div>
          <label className="flex items-center gap-3 text-sm text-nada-primary cursor-pointer select-none">
            <input
              checked={saved}
              className="h-5 w-5 rounded accent-sky-500"
              onChange={(event) => {
                setSaved(event.target.checked);
              }}
              type="checkbox"
            />
            I saved my seed phrase
          </label>
          <input
            className="nada-input h-12 w-full px-4 text-base"
            maxLength={40}
            onChange={(event) => {
              setDisplayName(event.target.value);
            }}
            placeholder="Display name"
            value={displayName}
          />
          <Button className="w-full" disabled={!saved} onClick={() => void finish()} size="lg">
            Enter NADA
          </Button>
        </div>
      )}
    </section>
  );
}

function Dashboard({ identity }: { identity: IdentityRecord }): JSX.Element {
  const searchParams = useSearchParams();
  const groupInviteToken = searchParams.get("g") ?? "";
  const inviteToken = searchParams.get("n") ?? "";
  const callSignals = useSocketStore((state) => state.callSignals);
  const deliveries = useSocketStore((state) => state.deliveries);
  const groupIncoming = useSocketStore((state) => state.groupIncoming);
  const incoming = useSocketStore((state) => state.incoming);
  const relayStatus = useSocketStore((state) => state.status);
  const sendCallSignal = useSocketStore((state) => state.sendCallSignal);
  const sendEnvelope = useSocketStore((state) => state.sendEnvelope);
  const sendGroupEnvelope = useSocketStore((state) => state.sendGroupEnvelope);
  
  const callStore = useCallStore();
  const activeCall = callStore.call;
  
  const [chats, setChats] = useState<ChatRecord[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [disappearingTimer, setDisappearingTimer] = useState(0);
  const [displayName, setDisplayName] = useState("NADA");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [messageText, setMessageText] = useState("");
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContactHash, setSelectedContactHash] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const processedGroupIncoming = useRef<Set<string>>(new Set());
  const processedGroupInvite = useRef("");
  const processedIncoming = useRef<Set<string>>(new Set());
  const processedCallSignals = useRef<Set<string>>(new Set());
  const processedInvite = useRef("");

  const selectedContact = useMemo(
    () =>
      contacts.find((contact) => contact.pubkeyHash === selectedContactHash) ??
      null,
    [contacts, selectedContactHash]
  );
  const selectedGroup = useMemo(
    () => chats.find((chat) => chat.id === selectedGroupId) ?? null,
    [chats, selectedGroupId]
  );
  const selectedChatId = useMemo(
    () => {
      if (selectedGroup) {
        return selectedGroup.id;
      }

      return selectedContact
        ? directChatId(identity.pubkeyHash, selectedContact.pubkeyHash)
        : "";
    },
    [identity.pubkeyHash, selectedContact, selectedGroup]
  );
  const selectedTitle = selectedGroup?.title ?? selectedContact?.localDisplayName ?? "";
  const selectedSubtitle = selectedGroup
    ? `${selectedGroup.memberPubkeyHashes.length} members`
    : (selectedContact?.trustStatus ?? "");
  const replyMessage = useMemo(
    () => messages.find((message) => message.id === replyToId) ?? null,
    [messages, replyToId]
  );
  const editingMessage = useMemo(
    () => messages.find((message) => message.id === editingMessageId) ?? null,
    [editingMessageId, messages]
  );
  const visibleMessages = useMemo(
    () =>
      messages.filter((message) =>
        matchesSearch(
          `${message.body} ${message.status} ${message.mentions?.join(" ") ?? ""}`,
          messageSearchQuery
        )
      ),
    [messageSearchQuery, messages]
  );

  useEffect(() => {
    let active = true;

    void nadaDb.settings.get("displayName").then((record) => {
      if (!active) {
        return;
      }

      setDisplayName(record?.value ?? "NADA");
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void nadaDb.contacts.orderBy("addedAt").reverse().toArray().then((records) => {
      if (!active) {
        return;
      }

      setContacts(records);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void nadaDb.chats.orderBy("updatedAt").reverse().toArray().then((records) => {
      if (!active) {
        return;
      }

      setChats(records.filter((chat) => chat.type === "group"));
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!inviteToken || inviteToken === processedInvite.current) {
      return;
    }

    let active = true;
    const payload = parseInviteToken(inviteToken);
    if (!payload || payload.pubkeyHash === identity.pubkeyHash) {
      return;
    }

    processedInvite.current = inviteToken;
    void upsertContact(payload).then(async () => {
      const records = await nadaDb.contacts.orderBy("addedAt").reverse().toArray();
      if (!active) {
        return;
      }

      setContacts(records);
      setSelectedContactHash(payload.pubkeyHash);
      setMessageSearchQuery("");
    });

    return () => {
      active = false;
    };
  }, [identity.pubkeyHash, inviteToken]);

  useEffect(() => {
    if (
      !groupInviteToken ||
      groupInviteToken === processedGroupInvite.current
    ) {
      return;
    }

    const payload = parseGroupInviteToken(groupInviteToken);
    if (!payload) {
      return;
    }

    processedGroupInvite.current = groupInviteToken;
    let active = true;
    void upsertGroupFromInvite(identity, payload).then(async (chat) => {
      const chatRecords = await nadaDb.chats.orderBy("updatedAt").reverse().toArray();
      if (!active) {
        return;
      }

      setChats(chatRecords.filter((record) => record.type === "group"));
      setSelectedContactHash(null);
      setSelectedGroupId(chat.id);
      setDisappearingTimer(chat.disappearingTimer);
      setMessageSearchQuery("");
    });

    return () => {
      active = false;
    };
  }, [groupInviteToken, identity]);

  useEffect(() => {
    if (!selectedChatId) {
      setMessages((current) => (current.length === 0 ? current : []));
      return;
    }

    let active = true;
    void loadMessagesForChat(selectedChatId).then((records) => {
      if (!active) {
        return;
      }

      setMessages(records);
    });

    return () => {
      active = false;
    };
  }, [selectedChatId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      setMessages((current) =>
        current.filter((message) => !message.expiresAt || message.expiresAt > now)
      );
      void nadaDb.messages.where("expiresAt").belowOrEqual(now).delete();
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const deliveryEntries = Object.entries(deliveries);
    if (deliveryEntries.length === 0) {
      return;
    }

    let active = true;
    void Promise.all(
      deliveryEntries.map(([id, status]) => nadaDb.messages.update(id, { status }))
    ).then(() => {
      if (!active) {
        return;
      }

      setMessages((current) =>
        current.map((message) => {
          const nextStatus = deliveries[message.id];
          return nextStatus && message.status !== nextStatus
            ? { ...message, status: nextStatus }
            : message;
        })
      );
    });

    return () => {
      active = false;
    };
  }, [deliveries]);

  useEffect(() => {
    const newEnvelopes = incoming.filter(
      (envelope) =>
        envelope.recipient === identity.pubkeyHash &&
        !processedIncoming.current.has(envelope.id)
    );

    if (newEnvelopes.length === 0) {
      return;
    }

    let active = true;
    void persistIncomingMessages(identity, newEnvelopes).then(async () => {
      newEnvelopes.forEach((envelope) => processedIncoming.current.add(envelope.id));
      const contactRecords = await nadaDb.contacts.orderBy("addedAt").reverse().toArray();
      const messageRecords = selectedChatId
        ? await loadMessagesForChat(selectedChatId)
        : [];

      if (!active) {
        return;
      }

      setContacts(contactRecords);
      setMessages(messageRecords);
    });

    return () => {
      active = false;
    };
  }, [identity, incoming, selectedChatId]);

  useEffect(() => {
    const newGroupEnvelopes = groupIncoming.filter(
      (envelope) =>
        envelope.recipients.includes(identity.pubkeyHash) &&
        !processedGroupIncoming.current.has(envelope.id)
    );

    if (newGroupEnvelopes.length === 0) {
      return;
    }

    let active = true;
    void persistIncomingGroupMessages(identity, newGroupEnvelopes).then(async () => {
      newGroupEnvelopes.forEach((envelope) =>
        processedGroupIncoming.current.add(envelope.id)
      );
      const chatRecords = await nadaDb.chats.orderBy("updatedAt").reverse().toArray();
      const messageRecords = selectedChatId
        ? await loadMessagesForChat(selectedChatId)
        : [];

      if (!active) {
        return;
      }

      setChats(chatRecords.filter((chat) => chat.type === "group"));
      setMessages(messageRecords);
    });

    return () => {
      active = false;
    };
  }, [groupIncoming, identity, selectedChatId]);

  useEffect(() => {
    const latestSignal = callSignals.find(
      (signal) =>
        signal.recipient === identity.pubkeyHash &&
        !processedCallSignals.current.has(signal.id)
    );

    if (!latestSignal) return;
    processedCallSignals.current.add(latestSignal.id);

    switch (latestSignal.signalType) {
      case "offer": {
        // Incoming call — store the SDP so the accept handler can use it
        const contact = contacts.find(c => c.pubkeyHash === latestSignal.sender);
        callStore.receiveIncomingOffer({
          callId: latestSignal.callId,
          mode: latestSignal.mode,
          peerPubkeyHash: latestSignal.sender,
          peerName: contact?.localDisplayName ?? latestSignal.sender.slice(0, 8),
          offerSdp: latestSignal.payload
        });
        break;
      }
      case "answer": {
        // Caller receives the answer — set remote description on our PC
        const pc = callStore.call?.localSession?.peerConnection;
        if (!pc) break;
        const answerSdp = JSON.parse(latestSignal.payload) as RTCSessionDescriptionInit;
        pc.setRemoteDescription(new RTCSessionDescription(answerSdp))
          .then(() => {
            // Flush any ICE candidates that arrived before the answer
            const pending = callStore.call?.pendingIceCandidates ?? [];
            pending.forEach(c => void pc.addIceCandidate(new RTCIceCandidate(c)));
            callStore.clearPendingIce();
            callStore.setPhase("active");
            callStore.setStartedAt(Date.now());
          })
          .catch(() => callStore.failCall("Failed to set remote description."));
        break;
      }
      case "ice": {
        const pc = callStore.call?.localSession?.peerConnection;
        const candidate = JSON.parse(latestSignal.payload) as RTCIceCandidateInit;
        if (pc && pc.remoteDescription) {
          void pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          // Queue it until remote description is ready
          callStore.addPendingIce(candidate);
        }
        break;
      }
      case "reject":
      case "hangup":
        callStore.endCall();
        break;
    }
  }, [callSignals, identity.pubkeyHash, contacts, callStore]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmed = messageText.trim();
    if (!trimmed || !selectedChatId) {
      return;
    }

    if (editingMessageId) {
      const editedAt = Date.now();
      const encryptedPayload = await mockEncryptMessage(trimmed);
      await nadaDb.messages.update(editingMessageId, {
        body: trimmed,
        editedAt,
        encryptedPayload
      });
      setMessages((current) =>
        current.map((message) =>
          message.id === editingMessageId
            ? { ...message, body: trimmed, editedAt, encryptedPayload }
            : message
        )
      );
      setEditingMessageId(null);
      setMessageText("");
      return;
    }

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const expiresAt =
      disappearingTimer > 0 ? timestamp + disappearingTimer : undefined;
    const mentions = extractMentions(trimmed, contacts);
    const ciphertext = selectedGroup?.groupSenderKey
      ? JSON.stringify(
          await encryptGroupMessage(trimmed, selectedGroup.groupSenderKey)
        )
      : await mockEncryptMessage(trimmed);
    const statusFallback = selectedGroup ? "local" : "queued";
    let sent = false;

    if (selectedGroup) {
      const recipients = selectedGroup.memberPubkeyHashes.filter(
        (member) => member !== identity.pubkeyHash
      );
      const baseEnvelope = {
        type: "group-message" as const,
        id,
        groupId: selectedGroup.id,
        recipients,
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext,
        ...(replyToId ? { replyToId } : {}),
        ...(mentions.length > 0 ? { mentions } : {}),
        ...(expiresAt ? { expiresAt } : {})
      };
      const groupEnvelope: GroupMessageEnvelope =
        process.env["NODE_ENV"] === "production"
          ? baseEnvelope
          : {
              ...baseEnvelope,
              // ⚠️ MVP_ONLY — replace before production
              devPlaintext: trimmed
            };
      sent = sendGroupEnvelope(groupEnvelope);
    } else if (selectedContact) {
      const baseEnvelope = {
        type: "message" as const,
        id,
        recipient: selectedContact.pubkeyHash,
        sender: identity.pubkeyHash,
        timestamp,
        ciphertext
      };
      const envelope: MessageEnvelope =
        process.env["NODE_ENV"] === "production"
          ? baseEnvelope
          : {
              ...baseEnvelope,
              // ⚠️ MVP_ONLY — replace before production
              devPlaintext: trimmed
            };
      sent = sendEnvelope(envelope);
    }

    if (!selectedGroup && !selectedContact) {
      return;
    }

    const recipientHash =
      selectedGroup?.id ?? selectedContact?.pubkeyHash ?? identity.pubkeyHash;
    const record: MessageRecord = {
      id,
      chatId: selectedChatId,
      senderPubkeyHash: identity.pubkeyHash,
      recipientPubkeyHash: recipientHash,
      direction: "outbound",
      kind: "text",
      body: trimmed,
      encryptedPayload: ciphertext,
      status: sent ? "sent" : statusFallback,
      createdAt: timestamp,
      ...(expiresAt ? { expiresAt } : {}),
      ...(mentions.length > 0 ? { mentions } : {}),
      ...(replyToId ? { replyToId } : {})
    };

    await nadaDb.messages.put(record);
    if (selectedGroup) {
      await nadaDb.chats.update(selectedGroup.id, { updatedAt: timestamp });
      setChats((current) =>
        current.map((chat) =>
          chat.id === selectedGroup.id ? { ...chat, updatedAt: timestamp } : chat
        )
      );
    }
    setMessages((current) => [...current, record]);
    setMessageText("");
    setReplyToId(null);
    if ("vibrate" in navigator) {
      navigator.vibrate(8);
    }
  };

  const attachFile = async (file: File): Promise<void> => {
    if (!selectedContact || !selectedChatId) {
      return;
    }

    setUploadStatus("Encrypting file locally...");
    const encryptedFile = await encryptFileForBlindUpload(file);
    await nadaDb.encryptedFiles.put(encryptedFile);
    const uploadSlot = await requestBlindUploadSlot(encryptedFile);

    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const record: MessageRecord = {
      id,
      chatId: selectedChatId,
      senderPubkeyHash: identity.pubkeyHash,
      recipientPubkeyHash: selectedContact.pubkeyHash,
      direction: "outbound",
      kind: "file",
      body: `Encrypted file prepared: ${encryptedFile.name}`,
      encryptedPayload: encryptedFile.contentHash,
      status: "local",
      createdAt: timestamp,
      ...(encryptedFile.expiresAt ? { expiresAt: encryptedFile.expiresAt } : {})
    };

    await nadaDb.messages.put(record);
    setMessages((current) => [...current, record]);
    setUploadStatus(
      uploadSlot
        ? `Blind upload slot ready: ${encryptedFile.contentHash.slice(0, 16)}`
        : `Encrypted file stored locally: ${encryptedFile.contentHash.slice(0, 16)}`
    );
  };

  const createGroup = async (
    title: string,
    memberPubkeyHashes: string[]
  ): Promise<void> => {
    const now = Date.now();
    const groupId = crypto.randomUUID();
    const groupSenderKey = await createGroupSenderKey();
    const chat: ChatRecord = {
      id: groupId,
      type: "group",
      title,
      memberPubkeyHashes: Array.from(
        new Set([identity.pubkeyHash, ...memberPubkeyHashes])
      ),
      ownerPubkeyHash: identity.pubkeyHash,
      // ⚠️ MVP_ONLY — replace before production
      groupSenderKey,
      createdAt: now,
      updatedAt: now,
      disappearingTimer
    };

    await nadaDb.chats.put(chat);
    await nadaDb.groupKeys.put({
      groupId,
      senderKey: groupSenderKey,
      createdByPubkeyHash: identity.pubkeyHash,
      createdAt: now
    });
    setChats((current) => [chat, ...current]);
    setSelectedContactHash(null);
    setSelectedGroupId(chat.id);
    setPanel(null);
  };

  const startCall = async (mode: CallMode): Promise<void> => {
    if (!selectedContact) return;

    const callId = crypto.randomUUID();
    try {
      const session = await createLocalCallSession(mode, callId);

      // Wire ICE candidate forwarding before creating offer
      session.peerConnection.onicecandidate = (e) => {
        if (e.candidate) {
          sendCallSignal({
            type: "call-signal",
            id: crypto.randomUUID(),
            callId,
            recipient: selectedContact.pubkeyHash,
            sender: identity.pubkeyHash,
            timestamp: Date.now(),
            mode,
            signalType: "ice",
            payload: JSON.stringify(e.candidate.toJSON())
          });
        }
      };

      // Wire remote track receiver (for when the callee sends their stream back)
      session.peerConnection.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((track) => {
          session.remoteStream.addTrack(track);
        });
        // Force a Zustand re-render so overlays pick up the remote stream
        callStore.setPhase(callStore.call?.phase ?? "connecting");
      };

      // Create offer
      const offer = await session.peerConnection.createOffer();
      await session.peerConnection.setLocalDescription(offer);

      callStore.setOutgoingCall({
        callId,
        mode,
        peerPubkeyHash: selectedContact.pubkeyHash,
        peerName: selectedContact.localDisplayName,
        localSession: session
      });

      await nadaDb.calls.put({
        id: callId,
        chatId: selectedChatId,
        peerPubkeyHash: selectedContact.pubkeyHash,
        mode,
        status: "connecting",
        startedAt: Date.now()
      });

      sendCallSignal({
        type: "call-signal",
        id: crypto.randomUUID(),
        callId,
        recipient: selectedContact.pubkeyHash,
        sender: identity.pubkeyHash,
        timestamp: Date.now(),
        mode,
        signalType: "offer",
        payload: JSON.stringify(offer)
      });
    } catch {
      callStore.failCall("Could not start media capture.");
    }
  };

  const endCall = (): void => {
    const callId = activeCall?.callId;
    const peerPubkeyHash = activeCall?.peerPubkeyHash;
    const mode = activeCall?.mode;

    callStore.endCall();

    if (callId) {
      void nadaDb.calls.update(callId, {
        endedAt: Date.now(),
        status: "ended"
      });
      if (peerPubkeyHash && mode) {
        sendCallSignal({
          type: "call-signal",
          id: crypto.randomUUID(),
          callId,
          recipient: peerPubkeyHash,
          sender: identity.pubkeyHash,
          timestamp: Date.now(),
          mode,
          signalType: "hangup",
          payload: "hangup"
        });
      }
    }
  };

  const unsendMessage = async (messageId: string): Promise<void> => {
    const deletedAt = Date.now();
    await nadaDb.messages.update(messageId, {
      body: "Message unsent",
      deletedAt,
      status: "local"
    });
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, body: "Message unsent", deletedAt, status: "local" }
          : message
      )
    );
  };

  const copyGroupInvite = useCallback((): void => {
    if (!selectedGroup?.groupSenderKey || typeof window === "undefined") {
      return;
    }

    const payload: GroupInvitePayload = {
      version: 1,
      kind: "group",
      groupId: selectedGroup.id,
      title: selectedGroup.title,
      ownerPubkeyHash: selectedGroup.ownerPubkeyHash ?? identity.pubkeyHash,
      memberPubkeyHashes: selectedGroup.memberPubkeyHashes,
      // ⚠️ MVP_ONLY — replace before production
      senderKeyPackage: selectedGroup.groupSenderKey
    };

    void navigator.clipboard.writeText(
      buildGroupInviteUrl(window.location.origin, payload)
    );
  }, [identity.pubkeyHash, selectedGroup]);

  return (
    <section className="mx-auto flex min-h-dvh w-full max-w-7xl bg-nada-bg md:p-3 md:gap-3">
      <aside
        className={cn(
          "nada-sidebar relative flex w-full flex-col overflow-hidden md:w-[380px] md:rounded-2xl",
          selectedContact || selectedGroup ? "hidden md:flex" : "flex"
        )}
      >
        <header className="flex items-center justify-between px-5 pt-5 pb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-nada-accent">
              NADA
            </p>
            <h1 className="mt-0.5 text-xl font-semibold text-nada-primary">Chats</h1>
          </div>
          <div className="flex gap-1">
            <IconButton
              label="Add contact"
              onClick={() => {
                setPanel("contacts");
              }}
            >
              <Plus size={18} />
            </IconButton>
            <IconButton
              label="Create group"
              onClick={() => {
                setPanel("group");
              }}
            >
              <Users size={18} />
            </IconButton>
            <IconButton
              label="Settings"
              onClick={() => {
                setPanel("settings");
              }}
            >
              <Settings size={18} />
            </IconButton>
          </div>
        </header>

        <RelayStatus status={relayStatus} />

        <div className="px-4 pb-3">
          <label className="nada-input flex h-10 items-center gap-2.5 px-3.5 text-nada-secondary">
            <Search size={16} />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm text-nada-primary outline-none placeholder:text-nada-secondary/60"
              onChange={(event) => {
                setSearchQuery(event.target.value);
              }}
              placeholder="Search chats..."
              value={searchQuery}
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-20">
          {contacts.length === 0 && chats.length === 0 ? (
            <EmptyContacts
              onAdd={() => {
                setPanel("contacts");
              }}
            />
          ) : (
            <>
              {chats
                .filter((chat) => matchesSearch(chat.title, searchQuery))
                .map((chat) => (
                  <button
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-150",
                      selectedGroupId === chat.id
                        ? "bg-nada-accent/10"
                        : "hover:bg-nada-muted"
                    )}
                    key={chat.id}
                    onClick={() => {
                      setSelectedContactHash(null);
                      setSelectedGroupId(chat.id);
                      setDisappearingTimer(chat.disappearingTimer);
                      setMessageSearchQuery("");
                    }}
                    type="button"
                  >
                    <Avatar label={chat.title} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-nada-primary">
                        {chat.title}
                      </span>
                      <span className="block truncate text-xs text-nada-secondary mt-0.5">
                        {chat.memberPubkeyHashes.length} members
                      </span>
                    </span>
                    <span className="nada-status-online" />
                  </button>
                ))}
              {contacts
                .filter((contact) =>
                  matchesSearch(
                    `${contact.localDisplayName} ${contact.pubkeyHash}`,
                    searchQuery
                  )
                )
                .map((contact) => (
                  <button
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-150",
                      selectedContactHash === contact.pubkeyHash
                        ? "bg-nada-accent/10"
                        : "hover:bg-nada-muted"
                    )}
                    key={contact.id}
                    onClick={() => {
                      setSelectedGroupId(null);
                      setSelectedContactHash(contact.pubkeyHash);
                      setMessageSearchQuery("");
                    }}
                    type="button"
                  >
                    <Avatar label={contact.localDisplayName} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-nada-primary">
                        {contact.localDisplayName}
                      </span>
                      <span className="block truncate text-xs text-nada-secondary mt-0.5">
                        {contact.pubkeyHash.slice(0, 16)}...
                      </span>
                    </span>
                  </button>
                ))}
            </>
          )}
        </div>
        <FloatingNav
          onAddContact={() => {
            setPanel("contacts");
          }}
          onCreateGroup={() => {
            setPanel("group");
          }}
          onOpenSettings={() => {
            setPanel("settings");
          }}
          onOpenShare={() => {
            setPanel("share");
          }}
        />
      </aside>

      <ChatPanel
        canAttachFile={Boolean(selectedContact)}
        canCopyGroupInvite={Boolean(selectedGroup?.groupSenderKey)}
        contact={selectedContact}
        disappearingTimer={disappearingTimer}
        editingMessage={editingMessage}
        isGroup={Boolean(selectedGroup)}
        messageSearchQuery={messageSearchQuery}
        messageText={messageText}
        messages={visibleMessages}
        onBack={() => {
          setSelectedContactHash(null);
          setSelectedGroupId(null);
          setMessageSearchQuery("");
        }}
        onAttachFile={(file) => {
          void attachFile(file);
        }}
        onCancelEdit={() => {
          setEditingMessageId(null);
          setMessageText("");
        }}
        onCancelReply={() => {
          setReplyToId(null);
        }}
        onCopyGroupInvite={copyGroupInvite}
        onDisappearingTimerChange={(value) => {
          setDisappearingTimer(value);
          if (selectedGroup) {
            void nadaDb.chats.update(selectedGroup.id, {
              disappearingTimer: value
            });
          }
        }}
        onEditMessage={(message) => {
          setEditingMessageId(message.id);
          setMessageText(message.body);
        }}
        onMessageSearchChange={setMessageSearchQuery}
        onMessageTextChange={setMessageText}
        onReply={(message) => {
          setReplyToId(message.id);
        }}
        onSend={(event) => {
          void sendMessage(event);
        }}
        onStartCall={(mode) => {
          void startCall(mode);
        }}
        onUnsend={(messageId) => {
          void unsendMessage(messageId);
        }}
        replyMessage={replyMessage}
        subtitle={selectedSubtitle}
        title={selectedTitle}
        uploadStatus={uploadStatus}
      />

      <AnimatePresence>
        {panel === "contacts" ? (
          <ContactSheet
            identity={identity}
            onClose={() => {
              setPanel(null);
            }}
            onContactAdded={(contact) => {
              setContacts((current) => [contact, ...current]);
              setSelectedContactHash(contact.pubkeyHash);
              setMessageSearchQuery("");
              setPanel(null);
            }}
          />
        ) : null}
        {panel === "billing" ? (
          <BillingSheet
            identity={identity}
            onClose={() => {
              setPanel(null);
            }}
          />
        ) : null}
        {panel === "migration" ? (
          <MigrationSheet
            chats={chats}
            identity={identity}
            onImported={(records) => {
              setChats(records);
            }}
            onClose={() => {
              setPanel(null);
            }}
          />
        ) : null}
        {panel === "share" ? (
          <ShareSheet
            displayName={displayName}
            identity={identity}
            onClose={() => {
              setPanel(null);
            }}
          />
        ) : null}
        {panel === "group" ? (
          <GroupSheet
            contacts={contacts}
            onClose={() => {
              setPanel(null);
            }}
            onCreate={(title, members) => {
              void createGroup(title, members);
            }}
          />
        ) : null}
        {panel === "settings" ? (
          <SettingsSheet
            identity={identity}
            onOpenBilling={() => {
              setPanel("billing");
            }}
            onOpenMigration={() => {
              setPanel("migration");
            }}
            onOpenShare={() => {
              setPanel("share");
            }}
            onClose={() => {
              setPanel(null);
            }}
          />
        ) : null}
      </AnimatePresence>
      <IncomingCallModal
        onAccept={async () => {
          const snap = callStore.call;
          if (!snap || !snap.pendingOfferSdp) return;

          try {
            const session = await createLocalCallSession(snap.mode, snap.callId);

            // Wire ICE forwarding on the callee side
            session.peerConnection.onicecandidate = (e) => {
              if (e.candidate) {
                sendCallSignal({
                  type: "call-signal",
                  id: crypto.randomUUID(),
                  callId: snap.callId,
                  recipient: snap.peerPubkeyHash,
                  sender: identity.pubkeyHash,
                  timestamp: Date.now(),
                  mode: snap.mode,
                  signalType: "ice",
                  payload: JSON.stringify(e.candidate.toJSON())
                });
              }
            };

            // Wire remote track receiver
            session.peerConnection.ontrack = (e) => {
              e.streams[0]?.getTracks().forEach((track) => {
                session.remoteStream.addTrack(track);
              });
              callStore.setPhase("active");
              callStore.setStartedAt(Date.now());
            };

            // Set remote description from the offer
            const offerSdp = JSON.parse(snap.pendingOfferSdp) as RTCSessionDescriptionInit;
            await session.peerConnection.setRemoteDescription(
              new RTCSessionDescription(offerSdp)
            );

            // Flush queued ICE candidates
            const pending = snap.pendingIceCandidates;
            pending.forEach(c =>
              void session.peerConnection.addIceCandidate(new RTCIceCandidate(c))
            );
            callStore.clearPendingIce();

            // Create and send answer
            const answer = await session.peerConnection.createAnswer();
            await session.peerConnection.setLocalDescription(answer);

            callStore.attachLocalSession(session);

            sendCallSignal({
              type: "call-signal",
              id: crypto.randomUUID(),
              callId: snap.callId,
              recipient: snap.peerPubkeyHash,
              sender: identity.pubkeyHash,
              timestamp: Date.now(),
              mode: snap.mode,
              signalType: "answer",
              payload: JSON.stringify(answer)
            });
          } catch {
            callStore.failCall("Could not access camera/microphone.");
          }
        }}
        onReject={() => { endCall(); }}
      />
      <VoiceCallOverlay onEnd={endCall} />
      <VideoCallOverlay onEnd={endCall} />
    </section>
  );
}

function RelayStatus({ status }: { status: string }): JSX.Element {
  const isConnected = status === "connected";
  const copy =
    status === "connected"
      ? "Connected"
      : status === "missing-url"
        ? "Relay URL missing"
        : "Connecting...";

  return (
    <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl bg-nada-muted px-3 py-2 text-xs text-nada-secondary">
      <div className={cn(
        "h-2 w-2 rounded-full",
        isConnected ? "bg-emerald-500 animate-pulse-ring" : "bg-nada-danger"
      )} />
      {copy}
    </div>
  );
}

function EmptyContacts({ onAdd }: { onAdd: () => void }): JSX.Element {
  return (
    <div className="mx-2 mt-16 flex flex-col items-center text-center animate-fade-in">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-nada-accent/10 text-nada-accent">
        <MessageCircle size={24} />
      </div>
      <h2 className="mt-4 text-base font-semibold text-nada-primary">No chats yet</h2>
      <p className="mt-1.5 text-sm text-nada-secondary max-w-[240px]">
        Add a contact to start a private conversation. Your invite links stay local.
      </p>
      <Button className="mt-5" onClick={onAdd} size="sm">
        <Plus size={16} />
        Add contact
      </Button>
    </div>
  );
}

function FloatingNav({
  onAddContact,
  onCreateGroup,
  onOpenSettings,
  onOpenShare
}: {
  onAddContact: () => void;
  onCreateGroup: () => void;
  onOpenSettings: () => void;
  onOpenShare: () => void;
}): JSX.Element {
  return (
    <nav className="absolute inset-x-0 bottom-0 z-shell border-t border-nada-border/40 bg-nada-surface pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around px-2 py-1.5">
        <IconButton label="Chats">
          <MessageCircle size={20} />
        </IconButton>
        <IconButton label="Add contact" onClick={onAddContact}>
          <Plus size={20} />
        </IconButton>
        <IconButton label="Create group" onClick={onCreateGroup}>
          <Users size={20} />
        </IconButton>
        <IconButton label="Share NADA" onClick={onOpenShare}>
          <Share2 size={20} />
        </IconButton>
        <IconButton label="Settings" onClick={onOpenSettings}>
          <Settings size={20} />
        </IconButton>
      </div>
    </nav>
  );
}

function ChatPanel({
  canAttachFile,
  canCopyGroupInvite,
  contact,
  disappearingTimer,
  editingMessage,
  isGroup,
  messageSearchQuery,
  messageText,
  messages,
  onBack,
  onAttachFile,
  onCancelEdit,
  onCancelReply,
  onCopyGroupInvite,
  onDisappearingTimerChange,
  onEditMessage,
  onMessageSearchChange,
  onMessageTextChange,
  onReply,
  onSend,
  onStartCall,
  onUnsend,
  replyMessage,
  subtitle,
  title,
  uploadStatus
}: {
  canAttachFile: boolean;
  canCopyGroupInvite: boolean;
  contact: ContactRecord | null;
  disappearingTimer: number;
  editingMessage: MessageRecord | null;
  isGroup: boolean;
  messageSearchQuery: string;
  messageText: string;
  messages: MessageRecord[];
  onBack: () => void;
  onAttachFile: (file: File) => void;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onCopyGroupInvite: () => void;
  onDisappearingTimerChange: (value: number) => void;
  onEditMessage: (message: MessageRecord) => void;
  onMessageSearchChange: (value: string) => void;
  onMessageTextChange: (value: string) => void;
  onReply: (message: MessageRecord) => void;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
  onStartCall: (mode: CallMode) => void;
  onUnsend: (messageId: string) => void;
  replyMessage: MessageRecord | null;
  subtitle: string;
  title: string;
  uploadStatus: string | null;
}): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [activeMessageMenu, setActiveMessageMenu] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const recordingTimer = useRef<number | null>(null);

  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunks.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };
      
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunks.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          const fakeEvent = { preventDefault: () => {} } as FormEvent<HTMLFormElement>;
          onMessageTextChange(`${base64data}|${recordingSeconds}`);
          // Send on the next tick so state updates
          setTimeout(() => onSend(fakeEvent), 50);
        };
        reader.readAsDataURL(blob);
      };
      
      mediaRecorder.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      
      recordingTimer.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      alert("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
      if (recordingTimer.current) window.clearInterval(recordingTimer.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
      if (recordingTimer.current) window.clearInterval(recordingTimer.current);
    }
  };

  if (!contact && !isGroup) {
    return (
      <section className="hidden flex-1 place-items-center bg-nada-bg md:grid">
        <div className="max-w-xs text-center animate-fade-in">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-nada-accent/10 text-nada-accent">
            <MessageCircle size={28} />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-nada-primary">NADA</h2>
          <p className="mt-2 text-sm text-nada-secondary leading-relaxed">
            Select a contact to start a private conversation.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-nada-bg md:rounded-2xl">
      <header className="nada-surface z-header flex h-16 shrink-0 items-center gap-3 border-b border-nada-border/50 px-4">
        <IconButton className="md:hidden" label="Back" onClick={onBack}>
          <ArrowLeft size={20} />
        </IconButton>
        <Avatar label={title} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-nada-primary">{title}</h2>
          <p className="truncate text-xs text-nada-secondary">{subtitle}</p>
        </div>
        {isGroup ? (
          <IconButton
            disabled={!canCopyGroupInvite}
            label="Copy group invite"
            onClick={onCopyGroupInvite}
          >
            <Copy size={16} />
          </IconButton>
        ) : (
          <>
            <IconButton
              label="Voice call"
              onClick={() => {
                onStartCall("voice");
              }}
            >
              <Phone size={16} />
            </IconButton>
            <IconButton
              label="Video call"
              onClick={() => {
                onStartCall("video");
              }}
            >
              <Video size={16} />
            </IconButton>
            <div className="relative">
              <IconButton
                label="More options"
                onClick={() => {
                  setShowOptions(!showOptions);
                }}
              >
                <MoreVertical size={16} />
              </IconButton>
              {showOptions && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => {
                      setShowOptions(false);
                    }}
                  />
                  <div className="absolute right-0 top-full z-50 mt-2 w-48 origin-top-right rounded-xl border border-nada-border/50 bg-nada-surface py-1 shadow-lg animate-scale-in">
                    <button
                      className="w-full px-4 py-2.5 text-left text-sm text-nada-primary hover:bg-nada-muted transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                      }}
                    >
                      View profile
                    </button>
                    <button
                      className="w-full px-4 py-2.5 text-left text-sm text-nada-primary hover:bg-nada-muted transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                      }}
                    >
                      Search in chat
                    </button>
                    <button
                      className="w-full px-4 py-2.5 text-left text-sm text-nada-primary hover:bg-nada-muted transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                      }}
                    >
                      Mute notifications
                    </button>
                    <div className="my-1 border-t border-nada-border/30" />
                    <button
                      className="w-full px-4 py-2.5 text-left text-sm text-nada-danger hover:bg-nada-muted transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                      }}
                    >
                      Clear chat
                    </button>
                    <button
                      className="w-full px-4 py-2.5 text-left text-sm text-nada-danger hover:bg-nada-muted transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                      }}
                    >
                      Block user
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </header>

      <div className="flex items-center gap-2 border-b border-nada-border/30 bg-nada-muted/50 px-4 py-1.5 text-2xs text-nada-secondary">
        <Clock size={12} />
        <select
          className="rounded-lg border border-nada-border bg-nada-surface px-2 py-1 text-2xs text-nada-primary outline-none"
          onChange={(event) => {
            onDisappearingTimerChange(Number(event.target.value));
          }}
          value={disappearingTimer}
        >
          <option value={0}>Keep messages</option>
          <option value={60000}>1 min</option>
          <option value={3600000}>1 hour</option>
          <option value={86400000}>1 day</option>
        </select>
        <div className="ml-auto">
          <label className="flex h-8 items-center gap-2 rounded-lg border border-nada-border bg-nada-surface px-2.5">
            <Search size={13} />
            <input
              className="w-28 bg-transparent text-2xs text-nada-primary outline-none placeholder:text-nada-secondary/60"
              onChange={(event) => {
                onMessageSearchChange(event.target.value);
              }}
              placeholder="Search..."
              value={messageSearchQuery}
            />
          </label>
        </div>
      </div>
      {uploadStatus ? (
        <div className="border-b border-nada-border/30 bg-nada-accent/5 px-4 py-2 text-xs text-nada-accent">
          {uploadStatus}
        </div>
      ) : null}

      <div className="nada-chat-bg flex-1 space-y-0.5 overflow-y-auto px-3 py-4 pb-32">
        {messages.map((message, index) => {
          const prevMessage = messages[index - 1];
          const showDateSep = !prevMessage || new Date(message.createdAt).toDateString() !== new Date(prevMessage.createdAt).toDateString();
          const isMenuOpen = activeMessageMenu === message.id;

          return (
            <div key={message.id}>
              {showDateSep && (
                <div className="flex justify-center py-3">
                  <span className="rounded-full bg-nada-muted px-3 py-1 text-[11px] font-medium text-nada-secondary">
                    {new Date(message.createdAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                </div>
              )}
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "group relative flex px-1 py-0.5",
                  message.direction === "outbound" ? "justify-end" : "justify-start"
                )}
                initial={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setActiveMessageMenu(isMenuOpen ? null : message.id);
                }}
                onPointerDown={() => {
                  longPressTimer.current = setTimeout(() => {
                    setActiveMessageMenu(message.id);
                  }, 500);
                }}
                onPointerUp={() => {
                  if (longPressTimer.current) clearTimeout(longPressTimer.current);
                }}
                onPointerLeave={() => {
                  if (longPressTimer.current) clearTimeout(longPressTimer.current);
                }}
              >
                <div
                  className={cn(
                    "relative max-w-[75%] px-3 py-2",
                    message.direction === "outbound"
                      ? "nada-bubble-sent"
                      : "nada-bubble-received"
                  )}
                >
                  {message.replyToId ? (
                    <div className="mb-1.5 rounded-lg bg-black/10 px-2.5 py-1.5 text-xs opacity-80">
                      Reply
                    </div>
                  ) : null}
                  {message.deletedAt ? (
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed italic opacity-50">
                      Message deleted
                    </p>
                  ) : isVoiceNoteMessage(message.body) ? (
                    <VoiceNoteBubble 
                      src={parseVoiceNoteBody(message.body).src} 
                      durationSeconds={parseVoiceNoteBody(message.body).durationSeconds}
                      outbound={message.direction === "outbound"}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                      {message.body}
                    </p>
                  )}
                  {message.mentions?.length ? (
                    <p className="mt-0.5 text-[11px] opacity-60">
                      @{message.mentions.length} mention{message.mentions.length === 1 ? "" : "s"}
                    </p>
                  ) : null}
                  <div
                    className={cn(
                      "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
                      message.direction === "outbound"
                        ? "text-white/60"
                        : "text-nada-secondary"
                    )}
                  >
                    {message.editedAt ? <span>edited ·</span> : null}
                    <span>{formatTime(message.createdAt)}</span>
                    {message.direction === "outbound" && (
                      <span className="ml-0.5">
                        {message.status === "delivered" ? "✓✓" : "✓"}
                      </span>
                    )}
                  </div>

                  {/* Hover actions — desktop only */}
                  <div className={cn(
                    "absolute -top-8 right-0 flex items-center gap-0.5 rounded-lg border border-nada-border/40 bg-nada-surface px-1 py-0.5 shadow-md transition-all",
                    isMenuOpen ? "opacity-100 visible" : "opacity-0 invisible group-hover:opacity-100 group-hover:visible"
                  )}>
                    <button
                      aria-label="Reply"
                      className="rounded-md p-1.5 text-nada-secondary transition hover:bg-nada-muted hover:text-nada-primary"
                      onClick={() => { onReply(message); setActiveMessageMenu(null); }}
                      type="button"
                    >
                      <Reply size={14} />
                    </button>
                    {message.direction === "outbound" && !message.deletedAt ? (
                      <>
                        <button
                          aria-label="Edit"
                          className="rounded-md p-1.5 text-nada-secondary transition hover:bg-nada-muted hover:text-nada-primary"
                          onClick={() => { onEditMessage(message); setActiveMessageMenu(null); }}
                          type="button"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          aria-label="Delete"
                          className="rounded-md p-1.5 text-nada-secondary transition hover:bg-nada-muted hover:text-nada-danger"
                          onClick={() => { onUnsend(message.id); setActiveMessageMenu(null); }}
                          type="button"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Click-away to close message menu */}
      {activeMessageMenu && (
        <div className="fixed inset-0 z-30" onClick={() => setActiveMessageMenu(null)} />
      )}

      <form
        className="sticky bottom-0 z-header border-t border-nada-border/40 bg-nada-surface px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]"
        onSubmit={onSend}
      >
        {replyMessage ? (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-nada-muted px-3 py-2 text-xs text-nada-secondary">
            <span className="truncate">Replying to {replyMessage.body}</span>
            <button className="ml-2 shrink-0" onClick={onCancelReply} type="button">
              <X size={14} />
            </button>
          </div>
        ) : null}
        {editingMessage ? (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-nada-accent/10 px-3 py-2 text-xs text-nada-accent">
            <span className="truncate">Editing message</span>
            <button className="ml-2 shrink-0" onClick={onCancelEdit} type="button">
              <X size={14} />
            </button>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          {!isRecording ? (
            <>
              <input
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    onAttachFile(file);
                  }
                  event.target.value = "";
                }}
                ref={fileInputRef}
                type="file"
              />
              <div className="relative">
                <button
                  aria-label="Emoji"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-nada-secondary transition hover:bg-nada-muted hover:text-nada-primary"
                  onClick={() => setShowEmojiPicker((prev) => !prev)}
                  type="button"
                >
                  <Smile size={20} />
                </button>
                {showEmojiPicker && (
                  <EmojiPicker
                    onClose={() => setShowEmojiPicker(false)}
                    onSelect={(emoji) => {
                      onMessageTextChange(messageText + emoji);
                    }}
                  />
                )}
              </div>
              <button
                aria-label="Attach file"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-nada-secondary transition hover:bg-nada-muted hover:text-nada-primary disabled:opacity-30"
                disabled={!canAttachFile}
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                type="button"
              >
                <Paperclip size={20} />
              </button>
              <input
                className="nada-input h-10 min-w-0 flex-1 px-4 text-sm"
                onChange={(event) => {
                  onMessageTextChange(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    const syntheticEvent = { preventDefault: () => {} } as FormEvent<HTMLFormElement>;
                    onSend(syntheticEvent);
                  }
                }}
                placeholder="Type a message..."
                value={messageText}
              />
              {messageText.trim() ? (
                <button
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-nada-accent text-white shadow-sm transition-all duration-150 hover:shadow-md active:scale-95"
                  type="submit"
                >
                  <Send size={18} />
                </button>
              ) : (
                <button
                  aria-label="Voice note"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-nada-secondary transition hover:bg-nada-muted hover:text-nada-primary"
                  onPointerDown={startRecording}
                  type="button"
                >
                  <Mic size={20} />
                </button>
              )}
            </>
          ) : (
            <div className="flex-1">
              <VoiceRecorderBar 
                seconds={recordingSeconds} 
                onStop={stopRecording} 
                onCancel={cancelRecording} 
              />
            </div>
          )}
        </div>
      </form>
    </section>
  );
}

function ContactSheet({
  identity,
  onClose,
  onContactAdded
}: {
  identity: IdentityRecord;
  onClose: () => void;
  onContactAdded: (contact: ContactRecord) => void;
}): JSX.Element {
  const [inviteUrl, setInviteUrl] = useState("");
  const [pasteValue, setPasteValue] = useState("");
  const ownInvite = useMemo<InvitePayload>(
    () => ({
      version: 1,
      pubkeyHash: identity.pubkeyHash,
      publicKey: identity.pubkey
    }),
    [identity.pubkey, identity.pubkeyHash]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextInviteUrl = buildInviteUrl(window.location.origin, ownInvite);
    setInviteUrl((current) =>
      current === nextInviteUrl ? current : nextInviteUrl
    );
  }, [ownInvite]);

  const addContact = async (): Promise<void> => {
    const payload = parseInviteInput(pasteValue);
    if (!payload || payload.pubkeyHash === identity.pubkeyHash) {
      return;
    }

    const contact = await upsertContact(payload);
    onContactAdded(contact);
  };

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-nada-primary">Add Contact</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div className="mt-5 grid place-items-center rounded-2xl bg-white p-5 shadow-sm">
        {inviteUrl ? (
          <QRCodeSVG
            bgColor="#FFFFFF"
            fgColor="#0A0A0F"
            level="M"
            size={184}
            value={inviteUrl}
          />
        ) : null}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          className="nada-input h-10 min-w-0 flex-1 px-3 text-xs"
          readOnly
          value={inviteUrl}
        />
        <IconButton
          label="Copy invite"
          onClick={() => {
            if (inviteUrl) {
              void navigator.clipboard.writeText(inviteUrl);
            }
          }}
        >
          <Copy size={16} />
        </IconButton>
      </div>

      <div className="mt-6 border-t border-nada-border/50 pt-5">
        <div className="flex items-center gap-2 text-xs text-nada-secondary">
          <QrCode size={14} />
          Paste an invite link to add a contact
        </div>
        <textarea
          className="nada-input mt-3 min-h-24 w-full resize-none p-3 text-sm"
          onChange={(event) => {
            setPasteValue(event.target.value);
          }}
          placeholder="Paste invite link..."
          value={pasteValue}
        />
        <Button className="mt-3 w-full" onClick={() => void addContact()}>
          Save contact
        </Button>
      </div>
    </Sheet>
  );
}

function GroupSheet({
  contacts,
  onClose,
  onCreate
}: {
  contacts: ContactRecord[];
  onClose: () => void;
  onCreate: (title: string, memberPubkeyHashes: string[]) => void;
}): JSX.Element {
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [title, setTitle] = useState("");

  const canCreate = title.trim().length > 0 && selectedMembers.length > 0;

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-nada-primary">New Group</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <input
        className="nada-input mt-5 h-11 w-full px-4 text-sm"
        maxLength={80}
        onChange={(event) => {
          setTitle(event.target.value);
        }}
        placeholder="Group name"
        value={title}
      />

      <div className="mt-4 space-y-1.5">
        {contacts.map((contact) => {
          const checked = selectedMembers.includes(contact.pubkeyHash);
          return (
            <label
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-nada-muted"
              key={contact.pubkeyHash}
            >
              <input
                checked={checked}
                className="h-4 w-4 rounded accent-sky-500"
                onChange={(event) => {
                  setSelectedMembers((current) =>
                    event.target.checked
                      ? [...current, contact.pubkeyHash]
                      : current.filter((member) => member !== contact.pubkeyHash)
                  );
                }}
                type="checkbox"
              />
              <Avatar label={contact.localDisplayName} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-nada-primary">
                  {contact.localDisplayName}
                </span>
                <span className="block truncate text-xs text-nada-secondary">
                  {contact.pubkeyHash.slice(0, 20)}...
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl bg-nada-muted p-3 text-xs text-nada-secondary leading-relaxed">
        Group sender keys are a Phase 3 scaffold. Real production groups need
        audited Signal Sender Keys or MLS before launch.
      </div>

      <Button
        className="mt-5 w-full"
        disabled={!canCreate}
        onClick={() => {
          onCreate(title.trim(), selectedMembers);
        }}
      >
        Create group
      </Button>
    </Sheet>
  );
}


const BILLING_PLANS: Array<{
  description: string;
  label: string;
  plan: PaidBillingPlan;
}> = [
  {
    description: "Larger files, longer relay retention, themes, backups.",
    label: "Pro",
    plan: "pro"
  },
  {
    description: "Verified anonymous profile, catalog, bot API, ZK analytics.",
    label: "Business",
    plan: "business"
  },
  {
    description: "Self-hosted relay, SLA, admin controls, compliance docs.",
    label: "Enterprise",
    plan: "enterprise"
  }
];

function BillingSheet({
  identity,
  onClose
}: {
  identity: IdentityRecord;
  onClose: () => void;
}): JSX.Element {
  const [referralCode, setReferralCode] = useState("");
  const [status, setStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [statusMessage, setStatusMessage] = useState("Checking plan...");

  useEffect(() => {
    let active = true;

    void fetchSubscriptionStatus(identity.pubkeyHash).then((snapshot) => {
      if (!active) {
        return;
      }

      setStatus(snapshot);
      setStatusMessage(snapshot ? `${snapshot.plan} / ${snapshot.status}` : "Relay billing is not configured.");
    });

    return () => {
      active = false;
    };
  }, [identity.pubkeyHash]);

  const checkout = async (plan: PaidBillingPlan): Promise<void> => {
    if (typeof window === "undefined") {
      return;
    }

    setStatusMessage("Opening Stripe Checkout...");
    const trimmedReferralCode = referralCode.trim();
    const response = await startCheckout({
      cancelUrl: window.location.href,
      plan,
      pubkeyHash: identity.pubkeyHash,
      successUrl: window.location.href,
      ...(trimmedReferralCode ? { referralCode: trimmedReferralCode } : {})
    });
    if (response?.checkoutUrl) {
      window.location.assign(response.checkoutUrl);
      return;
    }

    setStatusMessage(response?.message ?? "Checkout is not available.");
  };

  const redeem = async (): Promise<void> => {
    const trimmed = referralCode.trim();
    if (!trimmed) {
      return;
    }

    const response = await redeemReferral({
      pubkeyHash: identity.pubkeyHash,
      referralCode: trimmed
    });
    setStatusMessage(response?.message ?? "Referral could not be redeemed.");
  };

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-nada-primary">Plans</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div className="mt-5 rounded-xl bg-nada-muted p-4 text-sm text-nada-secondary">
        <div className="mb-2 flex items-center gap-2 font-medium text-nada-primary">
          <CreditCard size={16} />
          {statusMessage}
        </div>
        Paid plans are linked to your public-key hash and Stripe customer ID,
        never message content.
      </div>

      <div className="mt-4 grid gap-2.5">
        {BILLING_PLANS.map((plan) => (
          <div className="nada-surface-elevated rounded-xl p-4" key={plan.plan}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-nada-primary">{plan.label}</h3>
                <p className="mt-1 text-xs text-nada-secondary">{plan.description}</p>
              </div>
              <Button
                onClick={() => {
                  void checkout(plan.plan);
                }}
                size="sm"
              >
                Choose
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-nada-border/50 pt-5">
        <div className="flex items-center gap-2 text-xs text-nada-secondary">
          <Gift size={14} />
          Referral
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="nada-input h-10 min-w-0 flex-1 px-3 text-sm"
            onChange={(event) => {
              setReferralCode(event.target.value);
            }}
            placeholder="Referral code"
            value={referralCode}
          />
          <Button onClick={() => void redeem()} variant="secondary" size="sm">
            Redeem
          </Button>
        </div>
      </div>

      {status?.capabilityToken ? (
        <div className="mt-4 rounded-xl bg-nada-muted p-3 text-xs text-nada-secondary">
          Capability token issued locally for this pubkey hash.
        </div>
      ) : null}
    </Sheet>
  );
}

function MigrationSheet({
  chats,
  identity,
  onClose,
  onImported
}: {
  chats: ChatRecord[];
  identity: IdentityRecord;
  onClose: () => void;
  onImported: (chats: ChatRecord[]) => void;
}): JSX.Element {
  const [importText, setImportText] = useState("");
  const [status, setStatus] = useState("Export group migration data locally.");

  const exportGroups = (): void => {
    if (typeof window === "undefined") {
      return;
    }

    const payload = buildGroupMigrationPayload({
      groups: chats,
      identity,
      origin: window.location.origin
    });
    void navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setStatus(`${payload.groups.length} groups copied for migration.`);
  };

  const importGroups = async (): Promise<void> => {
    const payload = parseGroupMigrationPayload(importText);
    if (!payload) {
      setStatus("Migration payload is invalid.");
      return;
    }

    for (const group of payload.groups) {
      if (!group.inviteUrl) {
        continue;
      }

      const invite = parseGroupInviteInput(group.inviteUrl);
      if (invite) {
        await upsertGroupFromInvite(identity, invite);
      }
    }

    const records = await nadaDb.chats.orderBy("updatedAt").reverse().toArray();
    onImported(records.filter((record) => record.type === "group"));
    setStatus(`${payload.groups.length} group entries processed locally.`);
  };

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-nada-primary">Group Migration</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div className="mt-5 rounded-xl bg-nada-muted p-3 text-sm text-nada-secondary">
        {status}
      </div>

      <div className="mt-4 grid gap-2.5">
        <Button onClick={exportGroups} variant="secondary">
          <Download size={16} />
          Export groups
        </Button>
        <textarea
          className="nada-input min-h-36 resize-none p-3 text-sm"
          onChange={(event) => {
            setImportText(event.target.value);
          }}
          placeholder="Paste group migration JSON"
          value={importText}
        />
        <Button onClick={() => void importGroups()} variant="secondary">
          <Upload size={16} />
          Import groups
        </Button>
      </div>
    </Sheet>
  );
}

function ShareSheet({
  displayName,
  identity,
  onClose
}: {
  displayName: string;
  identity: IdentityRecord;
  onClose: () => void;
}): JSX.Element {
  const [inviteUrl, setInviteUrl] = useState("");
  const [status, setStatus] = useState("Share without uploading contacts.");
  const ownInvite = useMemo<InvitePayload>(
    () => ({
      version: 1,
      pubkeyHash: identity.pubkeyHash,
      publicKey: identity.pubkey
    }),
    [identity.pubkey, identity.pubkeyHash]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const nextInviteUrl = buildInviteUrl(window.location.origin, ownInvite);
    setInviteUrl((current) =>
      current === nextInviteUrl ? current : nextInviteUrl
    );
  }, [ownInvite]);

  const share = async (): Promise<void> => {
    if (!inviteUrl) {
      return;
    }

    const payload = buildShareCardPayload({
      version: 1,
      pubkeyHash: identity.pubkeyHash,
      displayName,
      inviteUrl
    });
    const usedNativeShare = await shareInviteCard(payload);
    setStatus(usedNativeShare ? "Native share sheet opened." : "Invite text copied.");
  };

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-nada-primary">Share NADA</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl bg-gradient-to-br from-nada-accent/10 via-nada-surface to-nada-muted p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-nada-secondary">
          NADA
        </p>
        <h3 className="mt-3 text-lg font-semibold text-nada-primary">{displayName}</h3>
        <p className="mt-1.5 text-sm text-nada-secondary">
          Anonymous messaging. No phone number. No email.
        </p>
        <p className="mt-4 break-all text-xs text-nada-secondary/70 font-mono">
          {identity.pubkeyHash}
        </p>
      </div>

      <p className="mt-4 text-xs text-nada-secondary">{status}</p>
      <Button className="mt-4 w-full" onClick={() => void share()}>
        <Share2 size={16} />
        Share invite card
      </Button>
    </Sheet>
  );
}

function SettingsSheet({
  identity,
  onOpenBilling,
  onOpenMigration,
  onOpenShare,
  onClose
}: {
  identity: IdentityRecord;
  onOpenBilling: () => void;
  onOpenMigration: () => void;
  onOpenShare: () => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-nada-primary">Settings</h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>

      <div className="mt-5 space-y-2">
        <SettingsRow label="Theme" value="System" />
        <SettingsRow label="Pubkey" value={identity.pubkeyHash} />
        <SettingsRow label="Seed backup" value={identity.seedBackupStatus} />
        <SettingsRow label="Plan" value="Free" />
      </div>

      <div className="mt-5 grid gap-2">
        <Button onClick={onOpenBilling} variant="secondary">
          <CreditCard size={16} />
          Plans
        </Button>
        <Button onClick={onOpenShare} variant="secondary">
          <Share2 size={16} />
          Share card
        </Button>
        <Button onClick={onOpenMigration} variant="secondary">
          <Download size={16} />
          Group migration
        </Button>
      </div>

      <div className="mt-5 rounded-xl bg-nada-muted p-4 text-sm text-nada-secondary">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-nada-primary">
          <ShieldAlert size={16} />
          IP anonymity
        </div>
        A browser PWA cannot control network routing. Use Tor Browser, Orbot,
        VPN, or a future mixnet relay for IP-level anonymity.
      </div>
    </Sheet>
  );
}

function SettingsRow({
  label,
  value
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="rounded-xl bg-nada-muted px-4 py-3">
      <p className="text-xs text-nada-secondary">{label}</p>
      <p className="mt-0.5 break-all text-sm font-medium text-nada-primary">{value}</p>
    </div>
  );
}

function Sheet({
  children,
  onClose
}: {
  children: ReactNode;
  onClose: () => void;
}): JSX.Element {
  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="nada-overlay fixed inset-0 z-overlay p-3"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        animate={{ y: 0, opacity: 1 }}
        className="nada-sheet ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto rounded-2xl p-5"
        exit={{ y: 24, opacity: 0 }}
        initial={{ y: 24, opacity: 0 }}
        onClick={(event) => {
          event.stopPropagation();
        }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

async function upsertContact(payload: InvitePayload): Promise<ContactRecord> {
  const existing = await nadaDb.contacts.get(payload.pubkeyHash);
  const contact: ContactRecord = {
    id: payload.pubkeyHash,
    pubkeyHash: payload.pubkeyHash,
    publicKey: payload.publicKey,
    localDisplayName:
      existing?.localDisplayName ?? `NADA ${payload.pubkeyHash.slice(0, 8)}`,
    addedAt: existing?.addedAt ?? Date.now(),
    trustStatus: existing?.trustStatus ?? "unverified"
  };

  await nadaDb.contacts.put(contact);
  return contact;
}

async function upsertGroupFromInvite(
  identity: IdentityRecord,
  payload: GroupInvitePayload
): Promise<ChatRecord> {
  const existing = await nadaDb.chats.get(payload.groupId);
  const now = Date.now();
  const chat: ChatRecord = {
    id: payload.groupId,
    type: "group",
    title: existing?.title ?? payload.title,
    memberPubkeyHashes: Array.from(
      new Set([...payload.memberPubkeyHashes, identity.pubkeyHash])
    ),
    ownerPubkeyHash: payload.ownerPubkeyHash,
    // ⚠️ MVP_ONLY — replace before production
    groupSenderKey: payload.senderKeyPackage,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    disappearingTimer: existing?.disappearingTimer ?? 0,
    ...(existing?.avatar ? { avatar: existing.avatar } : {})
  };

  await nadaDb.chats.put(chat);
  await nadaDb.groupKeys.put({
    groupId: payload.groupId,
    senderKey: payload.senderKeyPackage,
    createdByPubkeyHash: payload.ownerPubkeyHash,
    createdAt: now
  });
  return chat;
}

async function persistIncomingMessages(
  identity: IdentityRecord,
  envelopes: MessageEnvelope[]
): Promise<void> {
  for (const envelope of envelopes) {
    const contactPayload: InvitePayload = {
      version: 1,
      pubkeyHash: envelope.sender,
      // ⚠️ MVP_ONLY — replace before production
      publicKey: envelope.sender
    };
    await upsertContact(contactPayload);
    const chatId = directChatId(identity.pubkeyHash, envelope.sender);
    const existing = await nadaDb.messages.get(envelope.id);
    if (existing) {
      continue;
    }

    // Try to decrypt the message body. Use devPlaintext first (dev mode),
    // then fall back to mockDecryptMessage (base64 decode), then raw ciphertext.
    let body: string;
    if (envelope.devPlaintext) {
      body = envelope.devPlaintext;
    } else {
      try {
        body = await mockDecryptMessage(envelope.ciphertext);
      } catch {
        body = envelope.ciphertext;
      }
    }

    await nadaDb.messages.put({
      id: envelope.id,
      chatId,
      senderPubkeyHash: envelope.sender,
      recipientPubkeyHash: identity.pubkeyHash,
      direction: "inbound",
      kind: "text",
      body,
      encryptedPayload: envelope.ciphertext,
      status: "delivered",
      createdAt: envelope.timestamp
    });
  }
}

async function persistIncomingGroupMessages(
  identity: IdentityRecord,
  envelopes: GroupMessageEnvelope[]
): Promise<void> {
  for (const envelope of envelopes) {
    const existingChat = await nadaDb.chats.get(envelope.groupId);
    if (!existingChat) {
      const now = Date.now();
      await nadaDb.chats.put({
        id: envelope.groupId,
        type: "group",
        title: `Group ${envelope.groupId.slice(0, 8)}`,
        memberPubkeyHashes: Array.from(
          new Set([identity.pubkeyHash, envelope.sender, ...envelope.recipients])
        ),
        ownerPubkeyHash: envelope.sender,
        createdAt: now,
        updatedAt: envelope.timestamp,
        disappearingTimer: 0
      });
    } else {
      await nadaDb.chats.update(envelope.groupId, {
        updatedAt: envelope.timestamp
      });
    }

    const existingMessage = await nadaDb.messages.get(envelope.id);
    if (existingMessage) {
      continue;
    }

    // Try to decrypt the group message body
    let body: string;
    if (envelope.devPlaintext) {
      body = envelope.devPlaintext;
    } else {
      try {
        body = await mockDecryptMessage(envelope.ciphertext);
      } catch {
        body = envelope.ciphertext;
      }
    }

    await nadaDb.messages.put({
      id: envelope.id,
      chatId: envelope.groupId,
      senderPubkeyHash: envelope.sender,
      recipientPubkeyHash: envelope.groupId,
      direction: "inbound",
      kind: "text",
      body,
      encryptedPayload: envelope.ciphertext,
      status: "delivered",
      createdAt: envelope.timestamp,
      ...(envelope.expiresAt ? { expiresAt: envelope.expiresAt } : {}),
      ...(envelope.mentions ? { mentions: envelope.mentions } : {}),
      ...(envelope.replyToId ? { replyToId: envelope.replyToId } : {})
    });
  }
}

function extractMentions(
  text: string,
  contacts: ContactRecord[]
): string[] {
  const normalizedText = text.toLowerCase();
  return contacts
    .filter((contact) =>
      normalizedText.includes(`@${contact.localDisplayName.toLowerCase()}`)
    )
    .map((contact) => contact.pubkeyHash);
}

function matchesSearch(value: string, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return true;
  }

  return value.toLowerCase().includes(trimmed);
}
