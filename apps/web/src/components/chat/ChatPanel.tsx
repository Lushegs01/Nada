"use client";
import { textFromMessage, messageKindFromRecord, previewForMessage, mediaFromMessage, decodeMessagePayload } from "@/lib/media-message";
import { type PreparedMediaFile, validateMediaFile, prepareMediaFile, openDecryptedMedia, formatBytes } from "@/lib/media-upload";
import type { CallMode } from "@/lib/webrtc";
import { deliveryStatusGlyph } from "@/utils/helpers";
import type { ContactRecord, MessageRecord } from "@nada/db";
import type { PollData, PollOption } from "@nada/types";
import { IconButton, IdentityOrb, Avatar, cn } from "@nada/ui";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Video, Copy, MoreVertical, Search, Eye, EyeOff, Trash2, Phone, User, BellOff, Bell, ShieldAlert, Flag, ShieldOff, Pin, ChevronUp, ChevronDown, X, BarChart2, Send, MessageCircle, Clock, Reply, Flame, Check, CheckCheck, ArrowDown, Share2, Edit3, Plus, Mic, Download, FileText, Loader2, Users, CircleDashed } from "lucide-react";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { type VirtuosoHandle, Virtuoso } from "react-virtuoso";
import type { MessageContextAction } from "../panels/Dialogs";
import { isVoiceNoteMessage, VoiceRecorderBar, VoiceNoteBubble, parseVoiceNoteBody, isInlineImageMessage, parseInlineFileMessage, isInlineFileMessage } from "../VoiceNote";
import { AttachmentPreview, AttachmentMenu } from "./AttachmentMenu";
import type { MessageContextMenuState, GlobalSearchResult } from "@/utils/dashboard-types";

export function ChatPanel({
      canAttachFile,
      canCopyGroupInvite,
      canDeleteGroup,
      contact,
      disappearingTimer,
      editingMessage,
      isGroup,
      messageSearchQuery,
      messages,
      onBack,
      onAttachFile,
      onCancelEdit,
      onCancelReply,
      onCopyGroupInvite,
      onDeleteGroup,
      onDisappearingTimerChange,
      onEditMessage,
      onMessageSearchChange,
      onReply,
      onRetryMessage,
      onSend,
      onSendVoiceNote,
      onStartCall,
      onUnsend,
      onDeleteForMe,
      replyMessage,
      subtitle,
      title,
      uploadStatus,
      chatIsMuted,
      peerIsBlocked,
      peerIsTyping,
      onViewProfile,
      onMute,
      onClearChat,
      onBlock,
      onUnblock,
      onTyping,
      onTypingStop,
      onReact,
      onPin,
      onReportMessage,
      onReportPeer,
      contacts,
      pinnedMessageId,
      pinnedMessageBody,
      myPubkeyHash,
      blurShieldActive,
      blurShieldRevealed,
      onToggleBlurShield,
      onRevealBlurShield,
      wallpaperUrl,
      onSetWallpaper,
      onSendPoll,
      onForward
    }: {
          canAttachFile: boolean;
          canCopyGroupInvite: boolean;
          canDeleteGroup: boolean;
          contact: ContactRecord | null;
          disappearingTimer: number;
          editingMessage: MessageRecord | null;
          isGroup: boolean;
          messageSearchQuery: string;
          messages: MessageRecord[];
          onBack: () => void;
          onAttachFile: (file: File) => Promise<boolean>;
          onCancelEdit: () => void;
          onCancelReply: () => void;
          onCopyGroupInvite: () => void;
          onDeleteGroup: () => void;
          onDisappearingTimerChange: (value: number) => void;
          onEditMessage: (message: MessageRecord) => void;
          onMessageSearchChange: (value: string) => void;
          onReply: (message: MessageRecord) => void;
          onRetryMessage: (message: MessageRecord) => void;
          onSend: (text: string) => void;
          onSendVoiceNote: (body: string) => void;
          onStartCall: (mode: CallMode) => void;
          onUnsend: (messageId: string) => void;
          onDeleteForMe: (messageId: string) => void;
          replyMessage: MessageRecord | null;
          subtitle: string;
          title: string;
          uploadStatus: string | null;
          chatIsMuted: boolean;
          peerIsBlocked: boolean;
          peerIsTyping: boolean;
          onViewProfile: () => void;
          onMute: (duration: number) => void;
          onClearChat: () => void;
          onBlock: () => void;
          onUnblock: () => void;
          onForward: (messageId: string) => void;
          onTyping: (isTyping: boolean) => void;
          onReact: (message: MessageRecord, emoji: string) => void;
          onPin: (message: MessageRecord) => void;
          onReportMessage: (message: MessageRecord) => void;
          onReportPeer: () => void;
          pinnedMessageId: string | null;
          pinnedMessageBody: string | null;
          wallpaperUrl: string | null;
          myPubkeyHash: string;
          blurShieldActive: boolean;
          blurShieldRevealed: boolean;
          onToggleBlurShield: () => void;
          onRevealBlurShield: () => void;
          onSetWallpaper: (url: string | null) => void;
          onSendPoll: (poll: PollData) => void;
          onTypingStop: () => void;
          contacts: ContactRecord[];
        }): JSX.Element {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [showOptions, setShowOptions] = useState(false);
    const [messageMenu, setMessageMenu] = useState<MessageContextMenuState | null>(null);
    const [showWallpaperPrompt, setShowWallpaperPrompt] = useState(false);
    const [showPollModal, setShowPollModal] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [showMuteModal, setShowMuteModal] = useState(false);
    const [showClearModal, setShowClearModal] = useState(false);
    const [showBlockModal, setShowBlockModal] = useState(false);
    const [showProfilePanel, setShowProfilePanel] = useState(false);
    const [showVerifyKeyModal, setShowVerifyKeyModal] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [deleteSheetMessageId, setDeleteSheetMessageId] = useState<string | null>(null);
    const [messageText, setMessageText] = useState("");
    const [activeVoiceNoteId, setActiveVoiceNoteId] = useState<string | null>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [voiceAutoplayRequest, setVoiceAutoplayRequest] = useState<{
            messageId: string;
            token: number;
          } | null>(null);
    const editingMessageId = editingMessage?.id ?? null;
    const editingMessageBody = editingMessage ? textFromMessage(editingMessage) : "";
    useEffect(() => {
    if (editingMessageId) {
      setMessageText(editingMessageBody);
    } else {
      setMessageText("");
    }
    }, [editingMessageId, editingMessageBody]);
    const submitMessage = useCallback((): void => {
            const trimmed = messageText.trim();
            if (!trimmed) return;
            onSend(trimmed);
            setMessageText("");
          }, [messageText, onSend]);
    const voiceNoteMessageIds = useMemo(
            () =>
              messages
                .filter(
                  (message) =>
                    !message.deletedAt &&
                    (messageKindFromRecord(message) === "voice_note" ||
                      isVoiceNoteMessage(message.body))
                )
                .map((message) => message.id),
            [messages]
          );
    const handleCancelEdit = useCallback((): void => {
            setMessageText("");
            onCancelEdit();
          }, [onCancelEdit]);
    useEffect(() => {
    const anyOpen =
      showWallpaperPrompt ||
      showPollModal ||
      showMuteModal ||
      showClearModal ||
      showBlockModal ||
      showProfilePanel ||
      showVerifyKeyModal ||
      deleteSheetMessageId !== null ||
      messageMenu !== null;
    if (!anyOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showWallpaperPrompt) setShowWallpaperPrompt(false);
      else if (showPollModal) setShowPollModal(false);
      else if (showMuteModal) setShowMuteModal(false);
      else if (showClearModal) setShowClearModal(false);
      else if (showBlockModal) setShowBlockModal(false);
      else if (showProfilePanel) setShowProfilePanel(false);
      else if (showVerifyKeyModal) setShowVerifyKeyModal(false);
      else if (deleteSheetMessageId !== null) setDeleteSheetMessageId(null);
      else if (messageMenu !== null) setMessageMenu(null);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
    }, [
    showWallpaperPrompt,
    showPollModal,
    showMuteModal,
    showClearModal,
    showBlockModal,
    showProfilePanel,
    showVerifyKeyModal,
    deleteSheetMessageId,
    messageMenu
    ]);
    const [chatSearchActive, setChatSearchActive] = useState(false);
    const [chatSearchIdx, setChatSearchIdx] = useState(0);
    const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
    const [attachmentAccept, setAttachmentAccept] = useState("*/*");
    const [attachmentCapture, setAttachmentCapture] = useState<"environment" | undefined>();
    const [attachmentDraft, setAttachmentDraft] = useState<PreparedMediaFile | null>(null);
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const [attachmentSending, setAttachmentSending] = useState(false);
    const [mediaViewer, setMediaViewer] = useState<{
            name: string;
            url: string;
            mimeType: string;
          } | null>(null);
    const virtuosoRef = useRef<VirtuosoHandle | null>(null);
    const [ribbonFraction, setRibbonFraction] = useState(1);
    const [ribbonLabel, setRibbonLabel] = useState<string>("");
    const [ribbonActive, setRibbonActive] = useState(false);
    const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const audioChunks = useRef<Blob[]>([]);
    const recordingTimer = useRef<number | null>(null);
    const recordingAudioContext = useRef<AudioContext | null>(null);
    const [recordingAnalyser, setRecordingAnalyser] = useState<AnalyserNode | null>(null);
    const recordingSecondsRef = useRef(0);
    const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wasTyping = useRef(false);
    const lastTypingEmitAt = useRef(0);
    const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👎"];
    const activeMessageMenu = messageMenu?.messageId ?? null;
    const messageIndexById = useMemo(() => {
            return new Map(messages.map((message, index) => [message.id, index]));
          }, [messages]);
    const contextMenuMessage = useMemo(() => {
            if (!messageMenu) return null;
            return messages.find((message) => message.id === messageMenu.messageId) ?? null;
          }, [messageMenu, messages]);
    const setMessageRef = useCallback((messageId: string, el: HTMLDivElement | null): void => {
            if (el) {
              messageRefs.current[messageId] = el;
            } else {
              delete messageRefs.current[messageId];
            }
          }, []);
    const highlightMessage = useCallback((messageId: string): void => {
            const el = messageRefs.current[messageId];
            if (!el) return;

            el.animate(
              [
                { backgroundColor: "rgb(var(--nada-accent) / 0.24)" },
                { backgroundColor: "transparent" }
              ],
              { duration: 1600, easing: "ease-out" }
            );
          }, []);
    const scrollToMessage = useCallback((messageId: string): void => {
            const index = messageIndexById.get(messageId);
            if (index === undefined) return;

            const renderedMessage = messageRefs.current[messageId];
            if (renderedMessage) {
              renderedMessage.scrollIntoView({ behavior: "smooth", block: "center" });
              highlightMessage(messageId);
              return;
            }

            virtuosoRef.current?.scrollToIndex({
              index,
              align: "center",
              behavior: "smooth"
            });
            window.setTimeout(() => highlightMessage(messageId), 420);
          }, [highlightMessage, messageIndexById]);
    const handleVoicePlaybackStart = useCallback((messageId: string): void => {
            setActiveVoiceNoteId(messageId);
          }, []);
    const handleVoicePlaybackEnd = useCallback((messageId: string): void => {
            const currentIndex = voiceNoteMessageIds.indexOf(messageId);
            const nextMessageId =
              currentIndex >= 0 ? voiceNoteMessageIds[currentIndex + 1] : undefined;

            if (!nextMessageId) {
              setActiveVoiceNoteId(null);
              return;
            }

            scrollToMessage(nextMessageId);
            setActiveVoiceNoteId(nextMessageId);
            window.setTimeout(() => {
              setVoiceAutoplayRequest({
                messageId: nextMessageId,
                token: Date.now()
              });
            }, 220);
          }, [scrollToMessage, voiceNoteMessageIds]);
    const closeMessageContextMenu = useCallback((): void => {
            setMessageMenu(null);
          }, []);
    const openMessageContextMenu = useCallback((
            message: MessageRecord,
            point: { x: number; y: number }
          ): void => {
            if (message.deletedAt) return;

            const menuWidth = 232;
            const menuHeight = message.direction === "outbound" ? 356 : 312;
            const padding = 12;
            const x = Math.min(
              Math.max(point.x, padding),
              Math.max(padding, window.innerWidth - menuWidth - padding)
            );
            const y = Math.min(
              Math.max(point.y, padding),
              Math.max(padding, window.innerHeight - menuHeight - padding)
            );

            setMessageMenu({ messageId: message.id, x, y });
          }, []);
    const copyMessageToClipboard = (message: MessageRecord): void => {
            const copyText = previewForMessage(message);
            if (!navigator.clipboard) {
              showToast("Clipboard is not available.");
              return;
            }

            void navigator.clipboard.writeText(copyText).then(
              () => showToast("Message copied."),
              () => showToast("Copy failed.")
            );
          };
    const showToast = (msg: string) => {
            setToast(msg);
            setTimeout(() => setToast(null), 2500);
          };
    const searchMatchIds = useMemo(() => {
            if (!messageSearchQuery.trim()) return [];
            return messages
              .filter((m) =>
                !m.deletedAt &&
                previewForMessage(m).toLowerCase().includes(messageSearchQuery.toLowerCase())
              )
              .map((m) => m.id);
          }, [messages, messageSearchQuery]);
    const formatTime = (ts: number): string => {
            const d = new Date(ts);
            return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
          };
    useEffect(() => {
    if (messages.length === 0) return;
    virtuosoRef.current?.scrollToIndex({
      index: messages.length - 1,
      align: "end",
      behavior: "smooth"
    });
    }, [messages.length]);
    useEffect(() => {
    if (chatSearchActive && searchMatchIds.length > 0) {
      const matchId = searchMatchIds[chatSearchIdx];
      if (matchId) {
        scrollToMessage(matchId);
      }
    }
    }, [chatSearchIdx, chatSearchActive, scrollToMessage, searchMatchIds]);
    useEffect(() => {
    if (!messageMenu) return;
    const close = (): void => {
      setMessageMenu(null);
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
    }, [messageMenu]);
    useEffect(() => {
    return () => {
      // Cleanup any active recordings when the chat panel unmounts
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (recordingTimer.current) window.clearInterval(recordingTimer.current);
      void recordingAudioContext.current?.close();
      if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
        mediaRecorder.current.stream?.getTracks().forEach((t) => t.stop());
        mediaRecorder.current.stop();
      }
    };
    }, []);
    useEffect(() => {
    return () => {
      if (attachmentDraft?.previewUrl) {
        URL.revokeObjectURL(attachmentDraft.previewUrl);
      }
    };
    }, [attachmentDraft]);
    useEffect(() => {
    return () => {
      if (wasTyping.current) {
        wasTyping.current = false;
        onTypingStop();
      }
      if (typingTimeout.current) {
        window.clearTimeout(typingTimeout.current);
      }
    };
    }, [contact?.pubkeyHash, isGroup, onTypingStop]);
    const startRecording = async () => {
            if (isRecording) return; // prevent double-start
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              const AudioContextClass =
                window.AudioContext ??
                (window as unknown as { webkitAudioContext?: typeof AudioContext })
                  .webkitAudioContext;
              if (AudioContextClass) {
                const audioContext = new AudioContextClass();
                const source = audioContext.createMediaStreamSource(stream);
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;
                source.connect(analyser);
                recordingAudioContext.current = audioContext;
                setRecordingAnalyser(analyser);
              }

              // Detect supported MIME type — Safari needs audio/mp4
              const mimeType = [
                "audio/webm;codecs=opus",
                "audio/webm",
                "audio/ogg;codecs=opus",
                "audio/mp4"
              ].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";

              const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
              audioChunks.current = [];
              recordingSecondsRef.current = 0;

              recorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.current.push(e.data);
              };

              recorder.onstop = () => {
                // Stop all mic tracks
                stream.getTracks().forEach((t) => t.stop());
                void recordingAudioContext.current?.close();
                recordingAudioContext.current = null;
                setRecordingAnalyser(null);

                const chunks = audioChunks.current;
                if (chunks.length === 0) {
                  showToast("No audio was captured. Please try again.");
                  return;
                }

                // Use the actual recorded MIME type from the recorder
                const actualMime = recorder.mimeType || mimeType || "audio/webm";
                const blob = new Blob(chunks, { type: actualMime });

                if (blob.size === 0) {
                  showToast("Recording failed. Please try again.");
                  return;
                }

                // Use the ref value — NOT the stale state variable
                const duration = recordingSecondsRef.current;

                if (duration < 1) {
                  // Silently discard ultra-short recordings (usually accidental clicks)
                  return;
                }

                const reader = new FileReader();
                reader.onloadend = () => {
                  const base64data = reader.result as string;
                  // Pass directly to parent — do NOT go through messageText setState
                  onSendVoiceNote(`${base64data}|${duration}`);
                };
                reader.readAsDataURL(blob);
              };

              mediaRecorder.current = recorder;
              // Use timeslice so ondataavailable fires frequently
              recorder.start(250);
              setIsRecording(true);
              setRecordingSeconds(0);
              recordingSecondsRef.current = 0;

              recordingTimer.current = window.setInterval(() => {
                recordingSecondsRef.current += 1;
                setRecordingSeconds((s) => s + 1);
              }, 1000);
            } catch { /* ignore recording error */
              showToast("Microphone access denied. Please allow microphone access and try again.");
            }
          };
    const stopRecording = () => {
            if (mediaRecorder.current && isRecording) {
              if (recordingTimer.current) window.clearInterval(recordingTimer.current);
              void recordingAudioContext.current?.close();
              recordingAudioContext.current = null;
              setRecordingAnalyser(null);
              setIsRecording(false);
              // stop() triggers onstop async — chunks are finalized there
              mediaRecorder.current.stop();
            }
          };
    const cancelRecording = () => {
            if (mediaRecorder.current) {
              if (recordingTimer.current) window.clearInterval(recordingTimer.current);
              // Clear ondataavailable so onstop won't send
              mediaRecorder.current.ondataavailable = null;
              mediaRecorder.current.onstop = () => {
                mediaRecorder.current?.stream.getTracks().forEach((t) => t.stop());
                void recordingAudioContext.current?.close();
                recordingAudioContext.current = null;
                setRecordingAnalyser(null);
              };
              mediaRecorder.current.stop();
              audioChunks.current = [];
              setIsRecording(false);
            }
          };
    const openAttachmentPicker = (
            accept: string,
            capture?: "environment"
          ): void => {
            setAttachmentAccept(accept);
            setAttachmentCapture(capture);
            setAttachmentMenuOpen(false);
            window.setTimeout(() => {
              fileInputRef.current?.click();
            }, 0);
          };
    const prepareAttachmentDraft = async (file: File): Promise<void> => {
            const validationError = validateMediaFile(file);
            if (validationError) {
              setAttachmentError(validationError);
              showToast(validationError);
              return;
            }

            try {
              setAttachmentError(null);
              const prepared = await prepareMediaFile(file);
              setAttachmentDraft((current) => {
                if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
                return prepared;
              });
            } catch {
              setAttachmentError("Could not prepare this attachment.");
              showToast("Could not prepare this attachment.");
            }
          };
    const sendAttachmentDraft = async (): Promise<void> => {
            if (!attachmentDraft || attachmentSending) return;
            setAttachmentSending(true);
            setAttachmentError(null);
            onTypingStop();
            const ok = await onAttachFile(attachmentDraft.file);
            setAttachmentSending(false);
            if (ok) {
              if (attachmentDraft.previewUrl) URL.revokeObjectURL(attachmentDraft.previewUrl);
              setAttachmentDraft(null);
              setAttachmentError(null);
            } else {
              setAttachmentError("Upload failed. You can retry or cancel.");
            }
          };
    const cancelAttachmentDraft = (): void => {
            setAttachmentDraft((current) => {
              if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
              return null;
            });
            setAttachmentError(null);
            setAttachmentSending(false);
          };
    if (!contact && !isGroup) {
    return (
      <section className="nada-empty-state relative hidden flex-1 flex-col items-center justify-center overflow-hidden md:flex nada-chat-bg">
        {/* Aurora ambient glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-[120px] animate-aurora"
            style={{ background: "radial-gradient(circle, rgba(30,215,130,0.55) 0%, transparent 70%)" }}
          />
        </div>

        <div className="relative z-10 flex max-w-md flex-col items-center px-8 text-center animate-fade-in">
          {/* Logo */}
          <div className="relative mb-8">
            <div className="absolute inset-0 rounded-[24px] blur-2xl opacity-60 animate-logo-glow nada-logo-aura" />
            <div className="relative grid h-[80px] w-[80px] place-items-center overflow-hidden rounded-[24px] nada-logo-aura">
              <img src="/logo.webp" alt="NADA Logo" className="h-full w-full object-cover" />
            </div>
          </div>

          <p className="text-[10px] font-bold uppercase text-nada-accent/85">
            Say less. Reveal nothing.
          </p>
          <h2 className="mt-3 text-[28px] font-bold text-nada-primary">
            Nothing to reveal.
          </h2>
          <p className="mt-3 text-[14.5px] leading-relaxed text-nada-secondary/75">
            Start a private conversation without a name, phone number, or trace.
          </p>

          {/* Decorative chips */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
            {["No phone", "No email", "Local keys", "Encrypted", "Anonymous by default"].map((label) => (
              <span key={label} className="nada-privacy-chip">{label}</span>
            ))}
          </div>
        </div>
      </section>
    );
    }

    return (
    <section
      className="relative flex min-h-dvh flex-1 flex-col overflow-hidden"
      style={{
        background: wallpaperUrl ? `url(${wallpaperUrl}) center/cover no-repeat` : "rgb(var(--n-base))"
      }}
    >
      {!wallpaperUrl && (
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 32%, rgba(124,58,237,0.08) 0%, transparent 55%), radial-gradient(circle at 82% 78%, rgba(37,99,235,0.06) 0%, transparent 55%), radial-gradient(circle at 50% 110%, rgba(16,217,138,0.05) 0%, transparent 50%)"
          }}
        />
      )}
      {wallpaperUrl && <div className="absolute inset-0 bg-black/45 z-0 pointer-events-none" />}
      
      {/* Chat Header */}
      <header
        className="nada-chat-header z-header relative flex shrink-0 items-center gap-3 md:px-5"
        style={{
          paddingLeft: "max(env(safe-area-inset-left), 12px)",
          paddingRight: "max(env(safe-area-inset-right), 12px)"
        }}
      >
        <IconButton className="md:hidden" label="Back" onClick={onBack}>
          <ArrowLeft size={18} />
        </IconButton>
        {/* Identity orb — shared-element seed matches the chat list */}
        <motion.div layoutId={`orb-${title}`} className="relative shrink-0">
          <IdentityOrb seed={title} size="lg" label={title} className="!h-[48px] !w-[48px]" />
        </motion.div>
        <div className="min-w-0 flex-1 py-2">
          <h2 className="truncate text-[16px] font-bold text-nada-primary">{title}</h2>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="nada-security-pill py-1 text-[10.5px]">
              {isGroup ? "Invite-only encrypted room" : "End-to-end encrypted"}
            </span>
            <span className="truncate text-[11.5px] font-medium text-nada-text-muted">
              {subtitle || "Unverified key"}
            </span>
          </div>
        </div>
        {isGroup ? (
          <>
            <IconButton
              label="Group Call"
              onClick={() => {
                onStartCall("group");
              }}
            >
              <Video size={16} />
            </IconButton>
            <IconButton
              disabled={!canCopyGroupInvite}
              label="Copy group invite"
              onClick={onCopyGroupInvite}
            >
              <Copy size={16} />
            </IconButton>
            <div className="relative">
              <IconButton
                label="Group options"
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
                  <div
                    className="absolute right-0 top-full z-50 mt-2 w-60 origin-top-right rounded-2xl border border-nada-border/24 py-1.5 animate-scale-in"
                    style={{
                      background: "linear-gradient(155deg, rgb(var(--nada-surface-elevated) / 0.95), rgb(var(--nada-surface) / 0.95))",
                      backdropFilter: "blur(28px) saturate(150%)",
                      boxShadow: "0 20px 56px rgba(0,0,0,0.55), 0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgb(var(--nada-border) / 0.10)"
                    }}
                  >
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        setChatSearchActive(true);
                      }}
                    >
                      <Search size={14} className="text-nada-accent/70" />
                      Search in group
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        setShowWallpaperPrompt(true);
                      }}
                    >
                      <Image size={14} className="text-nada-accent/70" />
                      Set group wallpaper
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        onToggleBlurShield();
                        if (!blurShieldActive) {
                          showToast("Privacy shield enabled. Tap messages to reveal.");
                        }
                      }}
                    >
                      {blurShieldActive ? <Eye size={14} className="text-nada-accent" /> : <EyeOff size={14} className="text-nada-secondary/[.50]" />}
                      {blurShieldActive ? "Disable privacy shield" : "Enable privacy shield"}
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-danger hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        setShowClearModal(true);
                      }}
                    >
                      <Trash2 size={14} className="text-nada-danger/70" />
                      Clear group chat
                    </button>
                    {canDeleteGroup ? (
                      <>
                        <div className="my-1 border-t border-nada-border/[.08]" />
                        <button
                          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-nada-danger hover:bg-red-500/10 transition-colors"
                          onClick={() => {
                            setShowOptions(false);
                            onDeleteGroup();
                          }}
                        >
                          <Trash2 size={14} className="text-nada-danger" />
                          Delete group
                        </button>
                      </>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </>
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
                  <div
                    className="absolute right-0 top-full z-50 mt-2 w-56 origin-top-right rounded-2xl border border-nada-border/24 py-1.5 animate-scale-in"
                    style={{
                      background: "linear-gradient(155deg, rgb(var(--nada-surface-elevated) / 0.95), rgb(var(--nada-surface) / 0.95))",
                      backdropFilter: "blur(28px) saturate(150%)",
                      boxShadow: "0 20px 56px rgba(0,0,0,0.55), 0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgb(var(--nada-border) / 0.10)"
                    }}
                  >
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        setShowProfilePanel(true);
                        onViewProfile();
                      }}
                    >
                      <User size={14} className="text-nada-accent/70" />
                      View profile
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        setChatSearchActive(true);
                      }}
                    >
                      <Search size={14} className="text-nada-accent/70" />
                      Search in chat
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        if (chatIsMuted) {
                          onMute(0);
                          showToast("Notifications unmuted.");
                        } else {
                          setShowMuteModal(true);
                        }
                      }}
                    >
                      {chatIsMuted ? <BellOff size={14} className="text-nada-accent/70" /> : <Bell size={14} className="text-nada-accent/70" />}
                      {chatIsMuted ? "Unmute notifications" : "Mute notifications"}
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        setShowWallpaperPrompt(true);
                      }}
                    >
                      <Image size={14} className="text-nada-accent/70" />
                      Set Chat Wallpaper
                    </button>
                    <div className="my-1 border-t border-nada-border/[.08]" />
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        onToggleBlurShield();
                        if (!blurShieldActive) {
                          showToast("Privacy shield enabled. Tap messages to reveal.");
                        }
                      }}
                    >
                      {blurShieldActive ? <Eye size={14} className="text-nada-accent" /> : <EyeOff size={14} className="text-nada-secondary/[.50]" />}
                      {blurShieldActive ? "Disable privacy shield" : "Enable privacy shield"}
                    </button>
                    {!isGroup && (
                      <button
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                        onClick={() => {
                          setShowOptions(false);
                          setShowVerifyKeyModal(true);
                        }}
                      >
                        <ShieldAlert size={14} className="text-nada-gold/80" />
                        Verify key
                      </button>
                    )}
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        onReportPeer();
                      }}
                    >
                      <Flag size={14} className="text-nada-danger/70" />
                      Report user
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-danger hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        setShowClearModal(true);
                      }}
                    >
                      <Trash2 size={14} className="text-nada-danger/70" />
                      Clear chat
                    </button>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-nada-danger hover:bg-nada-surface-elevated/40 transition-colors"
                      onClick={() => {
                        setShowOptions(false);
                        if (peerIsBlocked) {
                          onUnblock();
                          showToast("User unblocked.");
                        } else {
                          setShowBlockModal(true);
                        }
                      }}
                    >
                      <ShieldOff size={14} className="text-nada-danger/70" />
                      {peerIsBlocked ? "Unblock user" : "Block user"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </header>

      {/* Typing indicator — inline bubble style */}
      {peerIsTyping && !peerIsBlocked && (
        <div className="flex items-center gap-2.5 px-4 py-2 animate-fade-in border-b border-nada-border/8"
          style={{ background: "rgb(var(--nada-surface) / 0.5)" }}
        >
          <div
            className="flex items-center gap-1 rounded-2xl rounded-bl-[4px] px-3 py-2"
            style={{
              background: "rgb(var(--nada-surface-elevated) / 0.9)",
              border: "1px solid rgb(var(--nada-border) / 0.15)"
            }}
          >
            <span className="nada-typing-dot" />
            <span className="nada-typing-dot" />
            <span className="nada-typing-dot" />
          </div>
          <span className="text-[11.5px] text-nada-secondary/50">{title} is typing…</span>
        </div>
      )}

      {/* Blocked banner */}
      {peerIsBlocked && (
        <div className="flex items-center justify-between border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          <span className="flex items-center gap-2">
            <ShieldOff size={14} />
            You have blocked this user.
          </span>
          <button
            className="rounded-lg bg-red-500/20 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-500/30 transition-colors"
            onClick={() => { onUnblock(); showToast("User unblocked."); }}
            type="button"
          >
            Unblock
          </button>
        </div>
      )}

      {/* Pinned message banner */}
      {pinnedMessageId && pinnedMessageBody && (
        <button
          className="nada-pinned-banner flex w-full items-center gap-2.5 px-4 py-2 text-left animate-fade-in"
          onClick={() => {
            scrollToMessage(pinnedMessageId);
          }}
          type="button"
        >
          <Pin size={13} className="shrink-0 text-nada-accent" />
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-nada-accent">Pinned</span>
            <span className="block truncate text-xs text-nada-secondary">{pinnedMessageBody}</span>
          </span>
        </button>
      )}

      {/* Vanish mode banner */}
      {disappearingTimer > 0 && (
        <div className="nada-vanish-banner flex items-center gap-2 px-4 py-1.5 text-xs animate-fade-in">
          <span className="nada-vanish-dot" />
          Vanish mode: messages disappear after {
            disappearingTimer >= 86400000 ? "1 day" :
            disappearingTimer >= 3600000 ? "1 hour" :
            disappearingTimer >= 60000 ? "1 min" : "custom"
          }
        </div>
      )}


      {/* Chat search bar */}
      {chatSearchActive && (
        <div className="z-10 flex items-center gap-2 border-b border-nada-border/30 bg-nada-surface px-4 py-2 animate-fade-in">
          <Search size={14} className="text-nada-secondary" />
          <input
            autoFocus
            className="flex-1 bg-transparent text-sm text-nada-primary outline-none placeholder:text-nada-secondary/[.60]"
            onChange={(e) => {
              onMessageSearchChange(e.target.value);
              setChatSearchIdx(0);
            }}
            placeholder="Search messages…"
            value={messageSearchQuery}
          />
          {searchMatchIds.length > 0 && (
            <span className="text-xs text-nada-secondary tabular-nums">
              {chatSearchIdx + 1}/{searchMatchIds.length}
            </span>
          )}
          <button
            className="rounded-md p-1 text-nada-secondary hover:bg-nada-muted"
            onClick={() => setChatSearchIdx((i) => Math.max(0, i - 1))}
            type="button"
            disabled={chatSearchIdx <= 0}
          >
            <ChevronUp size={16} />
          </button>
          <button
            className="rounded-md p-1 text-nada-secondary hover:bg-nada-muted"
            onClick={() => setChatSearchIdx((i) => Math.min(searchMatchIds.length - 1, i + 1))}
            type="button"
            disabled={chatSearchIdx >= searchMatchIds.length - 1}
          >
            <ChevronDown size={16} />
          </button>
          <button
            className="rounded-md p-1.5 text-nada-secondary hover:bg-nada-muted"
            onClick={() => {
              setChatSearchActive(false);
              onMessageSearchChange("");
              setChatSearchIdx(0);
            }}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="absolute left-1/2 top-20 z-[100] -translate-x-1/2 rounded-2xl border border-nada-border/30 px-4 py-2.5 text-[13.5px] font-medium text-nada-primary shadow-2xl backdrop-blur-xl"
            style={{
              background: "linear-gradient(155deg, rgb(var(--nada-surface-elevated) / 0.95), rgb(var(--nada-surface) / 0.95))",
              boxShadow: "0 16px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgb(var(--nada-border) / 0.10)"
            }}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mute modal */}
      <AnimatePresence>
        {showMuteModal && (
          <motion.div
            className="fixed inset-0 z-[900] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMuteModal(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/10 p-6 shadow-2xl"
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            >
              <h3 className="text-lg font-semibold text-nada-primary mb-4">Mute notifications</h3>
              <div className="space-y-2">
                {[
                  { label: "8 hours", value: 8 * 60 * 60 * 1000 },
                  { label: "1 week", value: 7 * 24 * 60 * 60 * 1000 },
                  { label: "Always", value: -1 }
                ].map((opt) => (
                  <button
                    key={opt.label}
                    className="w-full rounded-xl px-4 py-3 text-left text-sm text-nada-primary hover:bg-nada-muted transition-colors"
                    onClick={() => {
                      onMute(opt.value);
                      setShowMuteModal(false);
                      showToast("Notifications muted.");
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm text-nada-secondary hover:bg-nada-muted transition-colors"
                onClick={() => setShowMuteModal(false)}
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clear chat confirmation modal */}
      <AnimatePresence>
        {showClearModal && (
          <motion.div
            className="fixed inset-0 z-[900] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowClearModal(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/10 p-6 shadow-2xl"
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            >
              <h3 className="text-lg font-semibold text-nada-primary mb-2">Clear chat</h3>
              <p className="text-sm text-nada-secondary mb-5">
                This will clear all messages from your view. The other user will still see the messages. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm text-nada-secondary bg-nada-muted hover:bg-nada-border/40 transition-colors"
                  onClick={() => setShowClearModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-400 transition-colors"
                  onClick={() => {
                    onClearChat();
                    setShowClearModal(false);
                    showToast("Chat cleared.");
                  }}
                >
                  Clear chat
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Verify key modal */}
      <AnimatePresence>
        {showVerifyKeyModal && contact && !isGroup && (
          <motion.div
            className="fixed inset-0 z-[900] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowVerifyKeyModal(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/10 p-6 shadow-2xl"
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            >
              <div className="mb-4 flex items-center gap-2">
                <ShieldAlert size={18} className="text-nada-gold/80" />
                <h3 className="text-lg font-semibold text-nada-primary">Verify safety numbers</h3>
              </div>
              <p className="mb-4 text-sm text-nada-secondary">
                Compare these fingerprints with {title} over another channel (in person, voice call). If they match, this conversation is end-to-end secured.
              </p>
              <div className="mb-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-nada-secondary/70">{title}</p>
                <code className="block break-all rounded-xl border border-nada-border/10 bg-black/40 px-3 py-2.5 font-mono text-[12.5px] text-nada-primary">
                  {contact.pubkeyHash.match(/.{1,5}/g)?.join(" ") ?? contact.pubkeyHash}
                </code>
              </div>
              <div className="mb-5">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-nada-secondary/70">You</p>
                <code className="block break-all rounded-xl border border-nada-border/10 bg-black/40 px-3 py-2.5 font-mono text-[12.5px] text-nada-primary">
                  {myPubkeyHash.match(/.{1,5}/g)?.join(" ") ?? myPubkeyHash}
                </code>
              </div>
              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm text-nada-secondary bg-nada-muted hover:bg-nada-border/40 transition-colors"
                  onClick={() => setShowVerifyKeyModal(false)}
                >
                  Close
                </button>
                <button
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-nada-bg bg-nada-accent hover:bg-nada-accent/90 transition-colors"
                  onClick={() => {
                    const text = `${title}: ${contact.pubkeyHash}\nYou: ${myPubkeyHash}`;
                    if (navigator.clipboard?.writeText) {
                      void navigator.clipboard.writeText(text).then(
                        () => showToast("Safety numbers copied."),
                        () => showToast("Copy failed.")
                      );
                    } else {
                      showToast("Clipboard is not available.");
                    }
                  }}
                >
                  Copy both
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Block user confirmation modal */}
      <AnimatePresence>
        {showBlockModal && (
          <motion.div
            className="fixed inset-0 z-[900] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowBlockModal(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/10 p-6 shadow-2xl"
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            >
              <h3 className="text-lg font-semibold text-nada-primary mb-2">Block user</h3>
              <p className="text-sm text-nada-secondary mb-5">
                Blocked users cannot send you messages, call you, or send voice notes. You can unblock them at any time.
              </p>
              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm text-nada-secondary bg-nada-muted hover:bg-nada-border/40 transition-colors"
                  onClick={() => setShowBlockModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-400 transition-colors"
                  onClick={() => {
                    onBlock();
                    setShowBlockModal(false);
                    showToast("User blocked.");
                  }}
                >
                  Block
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WhatsApp-style Delete Bottom Sheet */}
      <AnimatePresence>
        {deleteSheetMessageId && (() => {
          const targetMsg = messages.find((m) => m.id === deleteSheetMessageId);
          const isOwn = targetMsg?.direction === "outbound";
          return (
            <motion.div
              className="fixed inset-0 z-[870] flex items-end justify-center"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteSheetMessageId(null)} />
              <motion.div
                className="relative z-10 w-full max-w-lg rounded-t-2xl bg-nada-surface border-t border-nada-border/10 p-2 pb-safe shadow-2xl"
                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 350 }}
              >
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-nada-border/60" />
                <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-nada-secondary">Delete message</p>
                {isOwn && (
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-medium text-nada-danger hover:bg-nada-muted transition-colors"
                    onClick={() => {
                      onUnsend(deleteSheetMessageId);
                      setDeleteSheetMessageId(null);
                      showToast("Message deleted for everyone.");
                    }}
                  >
                    <Trash2 size={18} className="text-nada-danger/80" />
                    Delete for everyone
                  </button>
                )}
                <button
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm text-nada-primary hover:bg-nada-muted transition-colors"
                  onClick={() => {
                    onDeleteForMe(deleteSheetMessageId);
                    setDeleteSheetMessageId(null);
                    showToast("Message deleted for you.");
                  }}
                >
                  <Trash2 size={18} className="text-nada-secondary" />
                  Delete for me
                </button>
                <button
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm text-nada-secondary hover:bg-nada-muted transition-colors"
                  onClick={() => setDeleteSheetMessageId(null)}
                >
                  <X size={18} />
                  Cancel
                </button>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Wallpaper Prompt */}
      <AnimatePresence>
        {showWallpaperPrompt && (
          <motion.div
            className="fixed inset-0 z-[900] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowWallpaperPrompt(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/10 p-6 shadow-2xl"
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            >
              <h3 className="text-lg font-semibold text-nada-primary mb-4">Set Chat Wallpaper</h3>
              <p className="text-xs text-nada-secondary mb-4">Enter an image URL for this chat&apos;s background.</p>
              <form onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const url = fd.get("url") as string;
                if (url) {
                  onSetWallpaper(url);
                } else {
                  onSetWallpaper(null);
                }
                setShowWallpaperPrompt(false);
                showToast(url ? "Wallpaper updated." : "Wallpaper removed.");
              }}>
                <input
                  name="url"
                  placeholder="https://example.com/image.jpg"
                  defaultValue={wallpaperUrl ?? ""}
                  className="w-full rounded-xl border border-nada-border/10 bg-black/40 px-3 py-2 text-sm text-nada-primary placeholder-nada-secondary/50 focus:border-nada-accent focus:outline-none mb-4"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { onSetWallpaper(null); setShowWallpaperPrompt(false); showToast("Wallpaper removed."); }} className="flex-1 rounded-xl bg-nada-muted py-2 text-sm text-nada-secondary hover:text-nada-primary transition-colors">Clear</button>
                  <button type="submit" className="flex-1 rounded-xl bg-nada-accent py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90">Save</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Poll Creation Modal */}
      <AnimatePresence>
        {showPollModal && (
          <motion.div
            className="fixed inset-0 z-[900] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPollModal(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-2xl bg-nada-surface border border-nada-border/10 p-6 shadow-2xl flex flex-col max-h-[80vh]"
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            >
              <h3 className="text-lg font-semibold text-nada-primary mb-4 flex items-center gap-2">
                <BarChart2 size={18} className="text-nada-accent" /> Create Poll
              </h3>
              <form 
                className="flex flex-col gap-3 min-h-0 flex-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const question = fd.get("question") as string;
                  const multipleAnswers = fd.get("multipleAnswers") === "true";
                  
                  const options: PollOption[] = [];
                  let i = 0;
                  while (fd.has(`opt${i}`)) {
                    const text = (fd.get(`opt${i}`) as string).trim();
                    if (text) {
                      options.push({ id: String(i), text, voterPubkeyHashes: [] });
                    }
                    i++;
                  }
                  
                  if (!question.trim()) { showToast("Question is required."); return; }
                  if (options.length < 2) { showToast("At least 2 options required."); return; }
                  if (options.length > 10) { showToast("Maximum 10 options allowed."); return; }
                  
                  onSendPoll({ question: question.trim(), options, multipleAnswers });
                  setShowPollModal(false);
                }}
              >
                <input
                  name="question"
                  placeholder="Ask a question..."
                  className="w-full rounded-xl border border-nada-border/10 bg-black/40 px-3 py-2 text-sm text-nada-primary placeholder-nada-secondary/50 focus:border-nada-accent focus:outline-none font-medium"
                  autoFocus
                />
                
                <div className="flex flex-col gap-2 overflow-y-auto pr-1 flex-1 py-2">
                  {[0,1,2,3,4,5,6,7,8,9].map((i) => (
                    <input
                      key={i}
                      name={`opt${i}`}
                      placeholder={`Option ${i + 1}${i >= 2 ? ' (optional)' : ''}`}
                      className="w-full rounded-xl border border-nada-border/10 bg-black/20 px-3 py-2 text-sm text-nada-primary placeholder-nada-secondary/30 focus:border-nada-accent focus:outline-none"
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2 mt-2 px-1">
                  <input type="checkbox" id="multipleAnswers" name="multipleAnswers" value="true" className="rounded bg-black/40 border-nada-border/10 text-nada-accent focus:ring-nada-accent focus:ring-offset-nada-surface" />
                  <label htmlFor="multipleAnswers" className="text-xs text-nada-secondary cursor-pointer select-none">Allow multiple answers</label>
                </div>

                <div className="flex gap-2 mt-4 shrink-0">
                  <button type="button" onClick={() => setShowPollModal(false)} className="flex-1 rounded-xl bg-nada-muted py-2.5 text-sm font-medium text-nada-secondary hover:text-nada-primary transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 rounded-xl bg-nada-accent py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 flex items-center justify-center gap-2 shadow-gold-glow">
                    <Send size={14} /> Send
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile panel */}
      <AnimatePresence>
        {showProfilePanel && contact && (
          <motion.div
            className="fixed inset-0 z-[850] flex justify-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowProfilePanel(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm h-full bg-nada-surface border-l border-nada-border/10 overflow-y-auto"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-nada-primary">Profile</h3>
                  <button
                    className="rounded-full p-2 text-nada-secondary hover:bg-nada-muted transition-colors"
                    onClick={() => setShowProfilePanel(false)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="flex flex-col items-center gap-4 mb-8">
                  <div className="grid h-24 w-24 place-items-center rounded-full bg-nada-accent shadow-lg">
                    <Avatar label={contact.localDisplayName} size="lg" />
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-semibold text-nada-primary">{contact.localDisplayName}</p>
                    <p className="mt-1 text-xs text-nada-secondary font-mono">{contact.pubkeyHash.slice(0, 24)}…</p>
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-nada-muted px-3 py-1 text-xs text-nada-secondary">
                      {contact.trustStatus === "trusted" ? "✓ Verified" : contact.trustStatus === "blocked" ? "⚠ Blocked" : "Unverified"}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-nada-primary hover:bg-nada-muted transition-colors"
                    onClick={() => setShowProfilePanel(false)}
                  >
                    <MessageCircle size={16} className="text-nada-secondary" /> Message
                  </button>
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-nada-primary hover:bg-nada-muted transition-colors"
                    onClick={() => {
                      if (chatIsMuted) { onMute(0); showToast("Notifications unmuted."); }
                      else { setShowProfilePanel(false); setShowMuteModal(true); }
                    }}
                  >
                    {chatIsMuted ? <BellOff size={16} className="text-nada-secondary" /> : <Bell size={16} className="text-nada-secondary" />}
                    {chatIsMuted ? "Unmute" : "Mute"}
                  </button>
                  <div className="my-2 border-t border-nada-border/30" />
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-nada-danger hover:bg-nada-muted transition-colors"
                    onClick={() => { setShowProfilePanel(false); setShowClearModal(true); }}
                  >
                    <Trash2 size={16} /> Clear chat
                  </button>
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-nada-danger hover:bg-nada-muted transition-colors"
                    onClick={() => {
                      if (peerIsBlocked) { onUnblock(); showToast("User unblocked."); }
                      else { setShowProfilePanel(false); setShowBlockModal(true); }
                    }}
                  >
                    <ShieldOff size={16} /> {peerIsBlocked ? "Unblock" : "Block"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact sub-toolbar: timer + search */}
      <div
        className="flex items-center gap-2 border-b border-nada-border/8 px-4 py-1.5"
        style={{ background: "rgb(var(--nada-surface) / 0.4)", backdropFilter: "blur(8px)" }}
      >
        <Clock size={11} className="text-nada-secondary/35 shrink-0" />
        <select
          className="rounded-lg border border-nada-border/15 px-2 py-1 text-[11px] text-nada-secondary/70 outline-none cursor-pointer transition-colors hover:border-nada-accent/30"
          style={{ background: "rgb(var(--nada-surface-elevated) / 0.6)" }}
          onChange={(event) => { onDisappearingTimerChange(Number(event.target.value)); }}
          value={disappearingTimer}
        >
          <option value={0}>Keep messages</option>
          <option value={60000}>1 min</option>
          <option value={3600000}>1 hour</option>
          <option value={86400000}>1 day</option>
        </select>
        <div className="ml-auto">
          <label
            className="flex h-7 items-center gap-1.5 rounded-lg border border-nada-border/15 px-2.5 cursor-text transition-colors focus-within:border-nada-accent/35"
            style={{ background: "rgb(var(--nada-surface-elevated) / 0.6)" }}
          >
            <Search size={11} className="text-nada-secondary/40" />
            <input
              className="w-24 bg-transparent text-[11px] text-nada-primary outline-none placeholder:text-nada-secondary/35"
              onChange={(event) => { onMessageSearchChange(event.target.value); }}
              placeholder="Search..."
              value={messageSearchQuery}
            />
          </label>
        </div>
      </div>
      {uploadStatus ? (
        <div
          className="border-b border-nada-accent/15 px-4 py-2 text-[11.5px] font-medium text-nada-accent flex items-center gap-2"
          style={{ background: "rgb(var(--nada-accent) / 0.06)" }}
        >
          <div className="h-1.5 w-1.5 rounded-full bg-nada-accent animate-pulse" />
          {uploadStatus}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1" style={{ background: "transparent" }}>
        {blurShieldActive && !blurShieldRevealed && (
          <div className="nada-blur-shield" onClick={onRevealBlurShield}>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-nada-surface/80 text-nada-secondary">
                <EyeOff size={22} />
              </div>
            </div>
          </div>
        )}
        {/* ── Time Ribbon — leading-edge spine + scroll-tracking gradient node ── */}
        {messages.length > 3 && (
          <div className="n-ribbon">
            <motion.div
              className="absolute -left-[3.5px] flex items-center gap-2"
              style={{ top: `calc(${Math.min(100, Math.max(0, ribbonFraction * 100))}% - 4px)` }}
              animate={{ top: `calc(${Math.min(100, Math.max(0, ribbonFraction * 100))}% - 4px)` }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.9}
              onDragStart={() => setRibbonActive(true)}
              onDrag={(_e, info) => {
                const track = (info.point.y);
                const host = (_e.target as HTMLElement)?.closest(".n-ribbon") as HTMLElement | null;
                if (!host) return;
                const rect = host.getBoundingClientRect();
                const frac = Math.min(1, Math.max(0, (track - rect.top) / rect.height));
                const idx = Math.round(frac * (messages.length - 1));
                const msg = messages[idx];
                if (msg) setRibbonLabel(new Date(msg.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
                virtuosoRef.current?.scrollToIndex({ index: idx, align: "center" });
              }}
              onDragEnd={() => setRibbonActive(false)}
            >
              <span className="n-ribbon-node" />
              <AnimatePresence>
                {ribbonActive && ribbonLabel && (
                  <motion.span
                    className="n-ribbon-label"
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                  >
                    {ribbonLabel}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
        <Virtuoso
          key={messages[0]?.chatId ?? contact?.pubkeyHash ?? title}
          ref={virtuosoRef}
          alignToBottom
          atBottomStateChange={(atBottom) => {
            setIsAtBottom(atBottom);
            if (atBottom) setRibbonFraction(1);
          }}
          atBottomThreshold={120}
          className="nada-message-virtuoso"
          computeItemKey={(_index, message) => message.id}
          components={{
            Header: () => <div className="h-3" />,
            Footer: () => <div className="h-32" />
          }}
          data={messages}
          followOutput="smooth"
          rangeChanged={(range) => {
            if (ribbonActive) return;
            const denom = Math.max(1, messages.length - 1);
            setRibbonFraction(Math.min(1, Math.max(0, range.endIndex / denom)));
          }}
          increaseViewportBy={{ top: 700, bottom: 900 }}
          initialTopMostItemIndex={Math.max(0, messages.length - 1)}
          itemContent={(index, message) => {
          const prevMessage = messages[index - 1];
          const showDateSep = !prevMessage || new Date(message.createdAt).toDateString() !== new Date(prevMessage.createdAt).toDateString();
          const isMenuOpen = activeMessageMenu === message.id;

          const reactions = message.reactions ?? {};
          const hasReactions = Object.keys(reactions).length > 0;
          const isPinned = pinnedMessageId === message.id;
          const isVanishing = Boolean(message.expiresAt && disappearingTimer > 0);

          // ── Call log bubble (centred system event, like WhatsApp) ─────────────
          if (message.kind === "call") {
            let callLog: { mode?: string; status?: string; duration?: number } = {};
            try { callLog = JSON.parse(message.body); } catch { /* ignore */ }
            const isVideo = callLog.mode === "video" || callLog.mode === "group";
            const dur = callLog.duration ?? 0;
            const durLabel = dur > 0
              ? dur >= 3600
                ? `${Math.floor(dur / 3600)}h ${Math.floor((dur % 3600) / 60)}m`
                : dur >= 60
                  ? `${Math.floor(dur / 60)}m ${dur % 60}s`
                  : `${dur}s`
              : "";
            const label = callLog.status === "ended"
              ? `${isVideo ? "Video" : "Voice"} call${durLabel ? ` · ${durLabel}` : ""}`
              : callLog.status === "missed"
                ? `Missed ${isVideo ? "video" : "voice"} call`
                : callLog.status === "declined"
                  ? `${isVideo ? "Video" : "Voice"} call declined`
                  : `${isVideo ? "Video" : "Voice"} call started`;
            const isMissed = callLog.status === "missed" || callLog.status === "declined";
            return (
              <div key={message.id} ref={(el) => setMessageRef(message.id, el)} className="px-3">
                {showDateSep && (
                  <div className="flex justify-center py-3">
                    <span className="nada-date-pill">
                      {new Date(message.createdAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                  </div>
                )}
                <div className="flex justify-center py-2">
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11.5px] font-medium",
                      isMissed
                        ? "border-nada-danger/20 text-nada-danger"
                        : "border-nada-border/12 text-nada-secondary/60"
                    )}
                    style={{ background: isMissed ? "rgb(252 165 165 / 0.07)" : "rgb(var(--nada-surface-elevated) / 0.5)" }}
                  >
                    {isVideo
                      ? <Video size={12} />
                      : <Phone size={12} />}
                    {label}
                  </div>
                </div>
              </div>
            );
          }
          // ─────────────────────────────────────────────────────────────────────

          const prevMsgSameSender = prevMessage && prevMessage.senderPubkeyHash === message.senderPubkeyHash && !showDateSep;
          const nextMessage = messages[index + 1];
          const nextMsgSameSender = nextMessage && nextMessage.senderPubkeyHash === message.senderPubkeyHash && (new Date(nextMessage.createdAt).toDateString() === new Date(message.createdAt).toDateString());

          const isFirstInCluster = !prevMsgSameSender;
          const isLastInCluster = !nextMsgSameSender;
          const shouldAnimateIn = index >= Math.max(0, messages.length - 3);

          return (
            <div
              key={message.id}
              ref={(el) => setMessageRef(message.id, el)}
              className={cn("nada-message-row", isFirstInCluster ? "mt-3" : "mt-1")}
            >
              {/* Date separator */}
              {showDateSep && (
                <div className="flex justify-center py-3">
                  <span className="nada-date-pill">
                    {new Date(message.createdAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                </div>
              )}
              <motion.div
                className={cn(
                  "group relative flex touch-pan-y px-1 py-0.5",
                  message.direction === "outbound" ? "justify-end" : "justify-start"
                )}
                drag="x"
                dragConstraints={
                  message.direction === "outbound"
                    ? { left: -96, right: 0 }
                    : { left: 0, right: 96 }
                }
                dragDirectionLock
                dragElastic={0.25}
                dragSnapToOrigin={true}
                dragTransition={{ bounceStiffness: 600, bounceDamping: 15 }}
                onDragEnd={(_event, info) => {
                  if (Math.abs(info.offset.x) > 64) {
                    onReply(message);
                    if ("vibrate" in navigator) navigator.vibrate(10);
                  }
                }}
                initial={shouldAnimateIn ? { opacity: 0, y: 8, scale: 0.98 } : false}
                animate={shouldAnimateIn ? { opacity: 1, y: 0, scale: 1 } : false}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMessageContextMenu(message, { x: e.clientX, y: e.clientY });
                }}
                onPointerDown={(e) => {
                  if (e.pointerType === "mouse") return;
                  if (longPressTimer.current) clearTimeout(longPressTimer.current);
                  const point = { x: e.clientX, y: e.clientY };
                  longPressTimer.current = setTimeout(() => {
                    openMessageContextMenu(message, point);
                    if ("vibrate" in navigator) navigator.vibrate(10);
                  }, 500);
                }}
                onPointerCancel={() => {
                  if (longPressTimer.current) clearTimeout(longPressTimer.current);
                }}
                onPointerUp={() => {
                  if (longPressTimer.current) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                }}
                onPointerLeave={() => {
                  if (longPressTimer.current) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                }}
              >
                <div
                  className={cn(
                    "pointer-events-none absolute top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-nada-accent/15 text-nada-accent opacity-0 transition-opacity group-active:opacity-100",
                    message.direction === "outbound" ? "right-2" : "left-2"
                  )}
                >
                  <Reply size={16} />
                </div>
                <div
                  className={cn(
                    "relative w-fit max-w-full text-[14.5px]",
                    message.direction === "outbound"
                      ? cn("nada-bubble-sent", isLastInCluster && "has-tail")
                      : cn("nada-bubble-received", isLastInCluster && "has-tail"),
                    isPinned && "ring-1 ring-nada-accent/40",
                    isMenuOpen && "ring-1 ring-nada-accent/25"
                  )}
                >
                  {message.replyToId ? (
                    <button
                      type="button"
                      className="nada-reply-quote mb-2 flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-opacity hover:opacity-90"
                      onClick={() => {
                        if (message.replyToId) scrollToMessage(message.replyToId);
                      }}
                    >
                      {(() => {
                        const original = messages.find((m) => m.id === message.replyToId);
                        const snapshot = message.replyTo;
                        const senderName = original
                          ? original.senderPubkeyHash === myPubkeyHash
                            ? "You"
                            : contacts.find(c => c.pubkeyHash === original.senderPubkeyHash)?.localDisplayName || "Someone"
                          : snapshot?.senderName ?? "Someone";
                        const previewText = original
                          ? previewForMessage(original)
                          : snapshot?.textPreview ?? snapshot?.fileName ?? "Message unavailable.";

                        return (
                          <>
                            <span className="nada-reply-sender text-[10.5px] font-semibold leading-tight">
                              {senderName}
                            </span>
                            <span className="nada-reply-preview truncate text-[12px] leading-tight">
                              {previewText.length > 48 ? `${previewText.slice(0, 48)}...` : previewText}
                            </span>
                          </>
                        );
                      })()}
                    </button>
                  ) : null}
                  <MessageContent
                    activeVoiceNoteId={activeVoiceNoteId}
                    message={message}
                    outbound={message.direction === "outbound"}
                    onOpenMedia={setMediaViewer}
                    onReact={onReact}
                    onVoicePlaybackEnd={handleVoicePlaybackEnd}
                    onVoicePlaybackStart={handleVoicePlaybackStart}
                    voiceAutoplayToken={
                      voiceAutoplayRequest?.messageId === message.id
                        ? voiceAutoplayRequest.token
                        : 0
                    }
                  />
                  {message.mentions?.length ? (
                    <p className="mt-0.5 text-[11px] opacity-60">
                      @{message.mentions.length} mention{message.mentions.length === 1 ? "" : "s"}
                    </p>
                  ) : null}
                  <div
                    className={cn(
                      "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
                      message.direction === "outbound"
                        ? "text-white/70"
                        : "text-nada-secondary/55"
                    )}
                  >
                    {message.editedAt ? <span className="italic">edited ·</span> : null}
                    {isVanishing && <Flame size={10} className="opacity-60" />}
                    <span className="tabular-nums">{formatTime(message.createdAt)}</span>
                    {message.direction === "outbound"
                      ? (() => {
                          if (message.status === "failed") {
                            return (
                              <button
                                aria-label="Retry sending message"
                                className="ml-0.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-red-300 hover:text-red-200"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRetryMessage(message);
                                }}
                                type="button"
                              >
                                Retry
                              </button>
                            );
                          }
                          const glyphMeta = deliveryStatusGlyph(message.status);
                          const glyphClass = cn(
                            "ml-0.5 inline-flex shrink-0",
                            glyphMeta.tone === "read"
                              ? "text-sky-300"
                              : "text-white"
                          );
                          if (glyphMeta.glyph === "clock") {
                            return (
                              <Clock
                                aria-label={glyphMeta.label}
                                className={glyphClass}
                                size={12}
                                strokeWidth={2.4}
                              />
                            );
                          }
                          if (glyphMeta.glyph === "check") {
                            return (
                              <Check
                                aria-label={glyphMeta.label}
                                className={glyphClass}
                                size={13}
                                strokeWidth={2.6}
                              />
                            );
                          }
                          return (
                            <CheckCheck
                              aria-label={glyphMeta.label}
                              className={glyphClass}
                              size={14}
                              strokeWidth={2.6}
                            />
                          );
                        })()
                      : null}
                  </div>

                </div>

                {/* Reaction chips */}
                {hasReactions && (
                  <div className={cn(
                    "absolute bottom-0 flex flex-wrap gap-1",
                    message.direction === "outbound" ? "right-3 translate-y-4" : "left-3 translate-y-4"
                  )}>
                    {Object.entries(reactions).map(([emoji, senders]) => (
                      <button
                        key={emoji}
                        type="button"
                        className={cn(
                          "nada-reaction-chip",
                          senders.includes(myPubkeyHash) && "nada-reaction-mine"
                        )}
                        onClick={() => onReact(message, emoji)}
                      >
                        {emoji}
                        {senders.length > 1 && (
                          <span className="text-[10px] font-medium opacity-70">{senders.length}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
              {hasReactions && <div className="h-5" />}
            </div>
          );
          }}
        />

        <AnimatePresence>
          {!isAtBottom && (
            <motion.button
              key="nada-scroll-fab"
              aria-label="Scroll to latest messages"
              type="button"
              onClick={() => {
                virtuosoRef.current?.scrollToIndex({
                  index: Math.max(0, messages.length - 1),
                  align: "end",
                  behavior: "smooth"
                });
              }}
              className="nada-scroll-fab absolute bottom-4 right-4 z-20 grid h-11 w-11 place-items-center rounded-full"
              initial={{ opacity: 0, scale: 0.85, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 8 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            >
              <ArrowDown size={18} strokeWidth={2.4} className="text-nada-primary" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {contextMenuMessage && messageMenu ? (
          <>
            <motion.button
              aria-label="Close message menu"
              className="fixed inset-0 z-[60] cursor-default bg-transparent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMessageContextMenu}
              type="button"
            />
            <motion.div
              className="nada-message-context-menu fixed z-[70] w-[232px] overflow-hidden rounded-2xl p-1.5"
              style={{ left: messageMenu.x, top: messageMenu.y }}
              initial={{ opacity: 0, scale: 0.94, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ type: "spring", stiffness: 520, damping: 34 }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div className="mb-1 flex items-center justify-between rounded-full border border-nada-border/10 bg-white/[0.04] px-1.5 py-1">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    aria-label={`React with ${emoji}`}
                    className="grid h-7 w-7 place-items-center rounded-full text-[14px] transition hover:bg-white/10 hover:scale-110"
                    onClick={() => {
                      onReact(contextMenuMessage, emoji);
                      closeMessageContextMenu();
                    }}
                    type="button"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="my-1 h-px bg-white/8" />
              <MessageContextAction
                icon={<Reply size={15} />}
                label="Reply"
                onClick={() => {
                  onReply(contextMenuMessage);
                  closeMessageContextMenu();
                }}
              />
              <MessageContextAction
                icon={<Copy size={15} />}
                label="Copy"
                onClick={() => {
                  copyMessageToClipboard(contextMenuMessage);
                  closeMessageContextMenu();
                }}
              />
              <MessageContextAction
                icon={<Share2 size={15} />}
                label="Forward"
                onClick={() => {
                  onForward(contextMenuMessage.id);
                  closeMessageContextMenu();
                }}
              />
              <MessageContextAction
                active={pinnedMessageId === contextMenuMessage.id}
                icon={<Pin size={15} />}
                label={pinnedMessageId === contextMenuMessage.id ? "Unpin" : "Pin"}
                onClick={() => {
                  onPin(contextMenuMessage);
                  closeMessageContextMenu();
                }}
              />
              {contextMenuMessage.direction === "outbound" &&
              messageKindFromRecord(contextMenuMessage) === "text" ? (
                <MessageContextAction
                  icon={<Edit3 size={15} />}
                  label="Edit"
                  onClick={() => {
                    onEditMessage(contextMenuMessage);
                    closeMessageContextMenu();
                  }}
                />
              ) : null}
              <MessageContextAction
                icon={<Flag size={15} />}
                label="Report"
                onClick={() => {
                  onReportMessage(contextMenuMessage);
                  closeMessageContextMenu();
                }}
              />
              <div className="my-1 h-px bg-white/10" />
              <MessageContextAction
                danger
                icon={<Trash2 size={15} />}
                label="Delete"
                onClick={() => {
                  setDeleteSheetMessageId(contextMenuMessage.id);
                  closeMessageContextMenu();
                }}
              />
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <form
        className={cn(
          "nada-input-bar relative sticky bottom-0 z-header px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6",
          peerIsBlocked && "pointer-events-none opacity-40"
        )}
        onSubmit={(event) => {
          event.preventDefault();
          submitMessage();
        }}
      >
        {/* Message reply preview */}

        {replyMessage ? (
          <div
            className="mb-2 flex items-center justify-between rounded-[14px] px-3 py-2.5 border-l-2 border-nada-accent"
            style={{ background: "rgb(var(--nada-accent) / 0.08)", backdropFilter: "blur(8px)" }}
          >
            <div className="flex flex-col min-w-0 pl-2">
              <span className="text-[10px] font-semibold text-nada-accent uppercase tracking-wider">
                Replying to {replyMessage.senderPubkeyHash === myPubkeyHash ? "yourself" :
                  contact?.pubkeyHash === replyMessage.senderPubkeyHash ? contact?.localDisplayName : "someone"}
              </span>
              <span className="truncate text-xs text-white/60 mt-0.5">
                {previewForMessage(replyMessage)}
              </span>
            </div>
            <button className="ml-2 shrink-0 p-1 text-nada-secondary/[.60] hover:text-white transition-colors rounded-lg" onClick={onCancelReply} type="button">
              <X size={14} />
            </button>
          </div>
        ) : null}
        {editingMessage ? (
          <div
            className="mb-2 flex items-center justify-between rounded-[14px] px-3 py-2.5 text-xs text-nada-accent"
            style={{ background: "rgb(var(--nada-accent) / 0.08)" }}
          >
            <span className="font-medium">Editing message</span>
            <button className="ml-2 shrink-0 rounded-lg p-1 hover:bg-nada-accent/10 transition-colors" onClick={handleCancelEdit} type="button">
              <X size={14} />
            </button>
          </div>
        ) : null}
        {attachmentDraft ? (
          <AttachmentPreview
            draft={attachmentDraft}
            error={attachmentError}
            isSending={attachmentSending}
            onCancel={cancelAttachmentDraft}
            onSend={() => {
              void sendAttachmentDraft();
            }}
          />
        ) : null}
        <div className="nada-message-lane flex items-center gap-2 px-4 md:px-6">
          {!isRecording ? (
            <>
              <input
                accept={attachmentAccept}
                capture={attachmentCapture}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void prepareAttachmentDraft(file);
                  }
                  event.target.value = "";
                }}
                ref={fileInputRef}
                type="file"
              />
              <button
                aria-label="Attach file"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-nada-secondary/70 transition-all duration-150 hover:text-nada-accent hover:scale-105 active:scale-90"
                style={{
                  background: "rgb(var(--nada-surface-elevated) / 0.7)",
                  backdropFilter: "blur(12px)"
                }}
                disabled={!canAttachFile || peerIsBlocked}
                onClick={() => { setAttachmentMenuOpen((current) => !current); }}
                type="button"
              >
                <Plus size={19} strokeWidth={2.2} />
              </button>
              {attachmentMenuOpen ? (
                <AttachmentMenu
                  onPickAudio={() => openAttachmentPicker("audio/*")}
                  onPickCamera={() => openAttachmentPicker("image/*", "environment")}
                  onPickDocument={() =>
                    openAttachmentPicker(
                      ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,application/pdf,application/zip,text/*"
                    )
                  }
                  onPickImage={() => openAttachmentPicker("image/*")}
                  onPickVideo={() => openAttachmentPicker("video/*")}
                  {...(isGroup && {
                    onPickPoll: () => {
                      setAttachmentMenuOpen(false);
                      setShowPollModal(true);
                    }
                  })}
                />
              ) : null}
              <input
                className="nada-composer-input h-12 min-w-0 flex-1 px-4 text-[14.5px] text-nada-primary outline-none transition-all duration-200 placeholder:text-nada-secondary/45 disabled:opacity-40"
                disabled={peerIsBlocked}
                onChange={(event) => {
                  const val = event.target.value;
                  setMessageText(val);

                  if (val.trim() === "") {
                    wasTyping.current = false;
                    if (typingTimeout.current) clearTimeout(typingTimeout.current);
                    onTypingStop();
                    return;
                  }

                  if (!wasTyping.current) {
                    wasTyping.current = true;
                    onTyping(true);
                    lastTypingEmitAt.current = Date.now();
                  } else if (Date.now() - lastTypingEmitAt.current > 2500) {
                    onTyping(true);
                    lastTypingEmitAt.current = Date.now();
                  }
                  if (typingTimeout.current) clearTimeout(typingTimeout.current);
                  typingTimeout.current = setTimeout(() => {
                    wasTyping.current = false;
                    onTyping(false);
                  }, 2000);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitMessage();
                  }
                }}
                placeholder="Type a message..."
                value={messageText}
              />
              {messageText.trim() ? (
                <button
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-all duration-200 hover:scale-105 active:scale-90 nada-logo-aura"
                  type="submit"
                  aria-label="Send message"
                >
                  <Send size={16} strokeWidth={2.4} />
                </button>
              ) : (
                <button
                  aria-label="Voice note"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-all duration-200 hover:scale-105 active:scale-90 nada-logo-aura"
                  onPointerDown={startRecording}
                  type="button"
                >
                  <Mic size={17} strokeWidth={2.2} />
                </button>
              )}
            </>
          ) : (
            <div className="flex-1">
              <VoiceRecorderBar 
                seconds={recordingSeconds} 
                onStop={stopRecording} 
                onCancel={cancelRecording} 
                analyser={recordingAnalyser}
              />
            </div>
          )}
        </div>
      </form>
      <AnimatePresence>
        {mediaViewer ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[960] flex flex-col bg-black/90 p-4 backdrop-blur-xl"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            <div className="mb-3 flex items-center justify-between gap-3 text-white">
              <p className="min-w-0 truncate text-sm font-semibold">{mediaViewer.name}</p>
              <div className="flex gap-2">
                <a
                  className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white"
                  download={mediaViewer.name}
                  href={mediaViewer.url}
                >
                  <Download size={18} />
                </a>
                <button
                  className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white"
                  onClick={() => setMediaViewer(null)}
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="grid min-h-0 flex-1 place-items-center">
              {mediaViewer.mimeType.startsWith("image/") ? (
                <img
                  alt={mediaViewer.name}
                  className="max-h-full max-w-full rounded-2xl object-contain"
                  src={mediaViewer.url}
                />
              ) : mediaViewer.mimeType.startsWith("video/") ? (
                <video
                  className="max-h-full max-w-full rounded-2xl"
                  controls
                  src={mediaViewer.url}
                />
              ) : (
                <a
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black"
                  download={mediaViewer.name}
                  href={mediaViewer.url}
                >
                  Open file
                </a>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
    );
}

export function MessageContent({
      activeVoiceNoteId,
      message,
      outbound,
      onOpenMedia,
      onReact,
      onVoicePlaybackEnd,
      onVoicePlaybackStart,
      voiceAutoplayToken = 0
    }: {
          activeVoiceNoteId?: string | null;
          message: MessageRecord;
          outbound: boolean;
          onOpenMedia: (viewer: { name: string; url: string; mimeType: string }) => void;
          onReact?: (message: MessageRecord, emoji: string) => void;
          onVoicePlaybackEnd?: (messageId: string) => void;
          onVoicePlaybackStart?: (messageId: string) => void;
          voiceAutoplayToken?: number;
        }): JSX.Element {
    const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const media = useMemo(() => mediaFromMessage(message), [message]);
    const payload = useMemo(() => decodeMessagePayload(message.body), [message.body]);
    const kind = useMemo(() => messageKindFromRecord(message), [message]);
    const mediaUrl = media?.url ?? "";
    const mediaKeyBase64 = media?.keyBase64 ?? "";
    const mediaNonceBase64 = media?.nonceBase64 ?? "";
    useEffect(() => {
    let active = true;
    setLoadError(null);
    setResolvedUrl(null);

    if (!media) {
      return () => {
        active = false;
      };
    }

    if (media.url.startsWith("data:") || media.url.startsWith("blob:")) {
      setResolvedUrl(media.url);
      return () => {
        active = false;
      };
    }

    if (kind === "image" || kind === "video" || kind === "audio" || kind === "voice_note") {
      void openDecryptedMedia(media)
        .then((url) => {
          if (active) setResolvedUrl(url);
        })
        .catch(() => {
          if (active) setLoadError("Media unavailable");
        });
    }

    return () => {
      active = false;
    };
    }, [kind, media, mediaKeyBase64, mediaNonceBase64, mediaUrl]);
    if (message.deletedAt) {
    return (
      <p className="whitespace-pre-wrap break-words text-[15px] italic leading-relaxed opacity-50">
        Message deleted
      </p>
    );
    }

    if (kind === "poll" && payload?.poll) {
    const poll = payload.poll;
    // Calculate total votes across all options
    const votesByOption: Record<string, number> = {};
    let totalVotes = 0;
    for (const opt of poll.options) {
      // Reactions on polls use option id as emoji
      const voterCount = message.reactions?.[opt.id]?.length ?? 0;
      votesByOption[opt.id] = voterCount;
      totalVotes += voterCount;
    }

    return (
      <div className="flex flex-col gap-2 min-w-[240px]">
        <h4 className="font-semibold text-[15px] mb-2">{poll.question}</h4>
        <div className="flex flex-col gap-1.5">
          {poll.options.map((opt) => {
            const votes = votesByOption[opt.id] || 0;
            const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            return (
              <button
                key={opt.id}
                type="button"
                className="relative overflow-hidden rounded-xl border border-nada-border/20 bg-black/20 text-left transition hover:bg-black/40"
                onClick={() => onReact?.(message, opt.id)}
              >
                <div 
                  className="absolute inset-y-0 left-0 bg-nada-accent/20 transition-all duration-500" 
                  style={{ width: `${percentage}%` }}
                />
                <div className="relative flex items-center justify-between px-3 py-2">
                  <span className="text-sm z-10">{opt.text}</span>
                  {totalVotes > 0 && (
                    <span className="text-[10px] opacity-70 z-10">{percentage}%</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] opacity-50 text-right mt-1">
          {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
        </p>
      </div>
    );
    }

    if (media) {
    const displayUrl = resolvedUrl ?? media.thumbnailDataUrl ?? media.thumbnailUrl ?? null;
    if (kind === "voice_note" || kind === "audio") {
      const voicePlaybackProps =
        kind === "voice_note"
          ? {
              activePlaybackId: activeVoiceNoteId ?? null,
              autoPlayToken: voiceAutoplayToken,
              playbackId: message.id,
              ...(onVoicePlaybackEnd ? { onPlaybackEnd: onVoicePlaybackEnd } : {}),
              ...(onVoicePlaybackStart ? { onPlaybackStart: onVoicePlaybackStart } : {})
            }
          : {};
      return resolvedUrl ? (
        <VoiceNoteBubble
          durationSeconds={Math.round(media.duration ?? 0)}
          outbound={outbound}
          src={resolvedUrl}
          {...voicePlaybackProps}
        />
      ) : (
        <MediaLoadingState error={loadError} label={kind === "voice_note" ? "Voice note" : media.fileName} />
      );
    }

    if (kind === "image") {
      return (
        <button
          className="flex max-w-[280px] flex-col gap-1 text-left"
          disabled={!displayUrl}
          onClick={() => {
            if (resolvedUrl) {
              onOpenMedia({
                name: media.originalName,
                url: resolvedUrl,
                mimeType: media.mimeType
              });
            }
          }}
          type="button"
        >
          {displayUrl ? (
            <img
              alt={media.originalName}
              className="max-h-72 rounded-xl bg-black/10 object-contain"
              loading="lazy"
              src={displayUrl}
            />
          ) : (
            <MediaLoadingState error={loadError} label="Photo" />
          )}
          <span className="text-[10px] opacity-70">{media.originalName}</span>
        </button>
      );
    }

    if (kind === "video") {
      return displayUrl ? (
        <video className="max-h-72 rounded-xl" controls src={displayUrl} />
      ) : (
        <MediaLoadingState error={loadError} label="Video" />
      );
    }

    return (
      <div className="flex min-w-[220px] items-center gap-3 rounded-xl bg-black/5 p-2">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-nada-accent/20 text-nada-accent">
          <FileText size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{media.originalName}</span>
          <span className="text-[10px] opacity-70">
            {formatBytes(media.size)} - {media.mimeType}
          </span>
        </div>
        <button
          className="p-1 text-nada-secondary hover:text-nada-primary"
          onClick={() => {
            void openDecryptedMedia(media)
              .then((url) => {
                onOpenMedia({
                  name: media.originalName,
                  url,
                  mimeType: media.mimeType
                });
              })
              .catch(() => setLoadError("File unavailable"));
          }}
          title="Open file"
          type="button"
        >
          <Download size={16} />
        </button>
      </div>
    );
    }

    if (isVoiceNoteMessage(message.body)) {
    const voice = parseVoiceNoteBody(message.body);
    return (
      <VoiceNoteBubble
        activePlaybackId={activeVoiceNoteId ?? null}
        autoPlayToken={voiceAutoplayToken}
        durationSeconds={voice.durationSeconds}
        outbound={outbound}
        playbackId={message.id}
        src={voice.src}
        {...(onVoicePlaybackEnd ? { onPlaybackEnd: onVoicePlaybackEnd } : {})}
        {...(onVoicePlaybackStart ? { onPlaybackStart: onVoicePlaybackStart } : {})}
      />
    );
    }

    if (isInlineImageMessage(message.body)) {
    const legacy = parseInlineFileMessage(message.body);
    return legacy ? (
      <button
        className="flex flex-col gap-1 text-left"
        onClick={() =>
          onOpenMedia({
            name: legacy.filename,
            url: legacy.dataUrl,
            mimeType: legacy.mimeType
          })
        }
        type="button"
      >
        <img
          alt={legacy.filename}
          className="max-h-64 rounded-lg bg-black/5 object-contain"
          loading="lazy"
          src={legacy.dataUrl}
        />
        <span className="text-[10px] opacity-70">{legacy.filename}</span>
      </button>
    ) : (
      <MediaLoadingState error="Image unavailable" label="Photo" />
    );
    }

    if (isInlineFileMessage(message.body)) {
    const legacy = parseInlineFileMessage(message.body);
    return legacy ? (
      <div className="flex items-center gap-3 rounded-lg bg-black/5 p-2">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-nada-accent/20 text-nada-accent">
          <Download size={18} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{legacy.filename}</span>
          <span className="text-[10px] opacity-70">{formatBytes(legacy.sizeBytes)}</span>
        </div>
        <a
          className="p-1 text-nada-secondary hover:text-nada-primary"
          download={legacy.filename}
          href={legacy.dataUrl}
          title="Download file"
        >
          <Download size={16} />
        </a>
      </div>
    ) : (
      <MediaLoadingState error="File unavailable" label="Document" />
    );
    }

    return (
    <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
      <MessageTextWithLinks text={payload?.text ?? textFromMessage(message)} />
    </div>
    );
}

export function MessageTextWithLinks({ text }: { text: string }): JSX.Element {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return (
    <>
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return (
            <span key={i} className="inline-flex flex-col gap-1">
              <a
                href={part}
                target="_blank"
                rel="noreferrer"
                className="text-nada-accent hover:underline break-all"
              >
                {part}
              </a>
              {/* WhatsApp-style Link Preview Card */}
              <a
                href={part}
                target="_blank"
                rel="noreferrer"
                className="mt-1 flex flex-col overflow-hidden rounded-xl bg-black/20 ring-1 ring-nada-border/20 transition hover:bg-black/30 w-[240px]"
              >
                <div className="flex h-[120px] w-full items-center justify-center bg-nada-muted text-nada-secondary/[.40]">
                   <FileText size={32} />
                </div>
                <div className="p-2.5">
                   <h4 className="truncate text-xs font-semibold text-nada-primary">
                     {new URL(part).hostname}
                   </h4>
                   <p className="truncate text-[10px] text-nada-secondary">
                     Tap to open link
                   </p>
                </div>
              </a>
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
    );
}

export function MediaLoadingState({
      error,
      label
    }: {
          error: string | null;
          label: string;
        }): JSX.Element {
    return (
    <div className="flex min-w-[180px] items-center gap-2 rounded-xl bg-black/5 p-3 text-xs opacity-80">
      {error ? <ShieldAlert size={15} /> : <Loader2 className="animate-spin" size={15} />}
      <span>{error ?? `Loading ${label.toLowerCase()}...`}</span>
    </div>
    );
}

export function GlobalSearchResults({
      onSelect,
      query,
      results
    }: {
          onSelect: (result: GlobalSearchResult) => void;
          query: string;
          results: GlobalSearchResult[];
        }): JSX.Element {
    return (
    <section className="mx-4 mb-3 rounded-2xl border border-nada-border/10 bg-nada-surface-elevated/45 p-2">
      <div className="mb-1 flex items-center justify-between px-2 py-1">
        <span className="text-[10.5px] font-bold uppercase text-nada-text-muted">
          Search results
        </span>
        <span className="text-[10px] font-semibold text-nada-secondary/45">
          {results.length}
        </span>
      </div>
      {results.length === 0 ? (
        <p className="px-2 pb-2 text-[12px] text-nada-secondary/55">
          No matches for &quot;{query.trim()}&quot; yet.
        </p>
      ) : (
        <div className="grid gap-1">
          {results.map((result) => (
            <button
              className="flex items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/[0.05]"
              key={result.id}
              onClick={() => onSelect(result)}
              type="button"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-nada-accent/12 text-nada-accent">
                {result.targetType === "community" ? (
                  <Users size={15} />
                ) : result.targetType === "status" ? (
                  <CircleDashed size={15} />
                ) : result.targetType === "message" ? (
                  <MessageCircle size={15} />
                ) : result.targetType === "group" ? (
                  <Users size={15} />
                ) : (
                  <Search size={15} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-nada-primary">
                  {result.label}
                </span>
                <span className="block truncate text-[11.5px] text-nada-text-muted">
                  {result.meta}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
    );
}
