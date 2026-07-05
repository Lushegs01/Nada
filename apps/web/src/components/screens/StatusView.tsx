import { decodeMessagePayload, textFromMessage, mediaFromMessage } from "@/lib/media-message";
import { STATUS_REACTION_EMOJIS, type StatusCommentPayload } from "@/utils/dashboard-types";
import { generateRandomUsername, formatRelativeTime, loadStatusComments, parseStatusCommentPayload, parseStatusReactionPayload, statusCommentChatId } from "@/utils/helpers";
import type { IdentityRecord, ContactRecord, MessageRecord } from "@nada/db";
import type { MediaAttachment } from "@nada/types";
import { IdentityOrb, cn } from "@nada/ui";
import type { motion, AnimatePresence } from "framer-motion";
import { Plus, CircleDashed, X, Trash2, MessageCircle, Send } from "lucide-react";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";

export function StatusView({
      identity,
      contacts,
      statuses,
      onPostStatus,
      onViewStatus
    }: {
          identity: IdentityRecord;
          contacts: ContactRecord[];
          statuses: MessageRecord[];
          onPostStatus: () => void;
          onViewStatus: (hash: string) => void;
        }) {
    const myStatuses = statuses
            .filter(s => s.senderPubkeyHash === identity.pubkeyHash)
            .sort((a, b) => b.createdAt - a.createdAt);
    const otherStatuses = statuses
            .filter(s => s.senderPubkeyHash !== identity.pubkeyHash)
            .sort((a, b) => b.createdAt - a.createdAt);
    const grouped = otherStatuses.reduce((acc, s) => {
            if (!acc[s.senderPubkeyHash]) acc[s.senderPubkeyHash] = [];
            acc[s.senderPubkeyHash]!.push(s);
            return acc;
          }, {} as Record<string, MessageRecord[]>);
    return (
    <div className="flex h-full flex-col overflow-y-auto px-5 pb-24 pt-3 animate-fade-in">
      <div className="nada-premium-card mb-5 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase text-nada-accent">Anonymous stories</p>
            <h2 className="mt-1 text-[21px] font-bold text-nada-primary">Nothing shared forever.</h2>
          </div>
          <button
            className="grid h-11 w-11 place-items-center rounded-2xl bg-nada-accent text-white shadow-accent-glow transition hover:scale-105 active:scale-95"
            onClick={onPostStatus}
            type="button"
          >
            <Plus size={20} />
          </button>
        </div>
        <p className="text-[13px] leading-relaxed text-nada-text-muted">
          Post a vanishing thought without revealing who you are.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Vanishes in 24h", "Anonymous viewers", "Comments stay here"].map((label) => (
            <span key={label} className="nada-privacy-chip">{label}</span>
          ))}
        </div>
      </div>

      <button
        className="nada-settings-card mb-5 flex items-center gap-4 text-left"
        onClick={() => myStatuses.length > 0 ? onViewStatus(identity.pubkeyHash) : onPostStatus()}
        type="button"
      >
        <div className="relative h-14 w-14 shrink-0 rounded-2xl border border-nada-accent/35 p-0.5">
          <div className="grid h-full w-full place-items-center overflow-hidden rounded-[14px] bg-nada-accent/12">
            {myStatuses.length > 0 ? (
              <CircleDashed className="text-nada-accent" size={24} />
            ) : (
              <Plus className="text-nada-accent" size={24} />
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-nada-primary">My Status</h3>
          <p className="truncate text-[13px] text-nada-text-muted">
            {myStatuses.length > 0
              ? `${myStatuses.length} update${myStatuses.length === 1 ? "" : "s"} - tap to view or add more`
              : "Add your first vanishing thought"}
          </p>
        </div>
        <span className="rounded-full bg-nada-surface/70 px-2.5 py-1 text-[10px] font-bold text-nada-secondary/60">
          {myStatuses.length}
        </span>
      </button>

      <section className="mb-5">
        <p className="mb-2 px-1 text-[11px] font-bold uppercase text-nada-text-muted">Anonymous Updates</p>
        {Object.entries(grouped).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-nada-border/10 bg-nada-surface-elevated/35 px-5 py-10 text-center">
            <CircleDashed className="mx-auto mb-3 h-8 w-8 text-nada-secondary/35" />
            <p className="text-[14px] font-bold text-nada-primary">Nothing shared.</p>
            <p className="mt-1 text-[12.5px] text-nada-text-muted">
              Recent anonymous updates from contacts will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {Object.entries(grouped).map(([hash, list]) => {
              const contact = contacts.find(c => c.pubkeyHash === hash);
              const name = contact?.localDisplayName || generateRandomUsername(hash);
              const latest = list[0]!;
              return (
                <button
                  key={hash}
                  className="nada-settings-card flex items-center gap-4 text-left"
                  onClick={() => onViewStatus(hash)}
                  type="button"
                >
                  <div className="h-14 w-14 shrink-0 rounded-2xl border border-nada-accent/45 p-0.5">
                    <div className="grid h-full w-full place-items-center overflow-hidden rounded-[14px] bg-nada-accent/12">
                      <CircleDashed className="text-nada-accent" size={24} />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-bold text-nada-primary">{name}</h3>
                    <p className="truncate text-[13px] text-nada-text-muted">
                      {list.length} update{list.length === 1 ? "" : "s"} - {formatRelativeTime(latest.createdAt)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-2">
        <p className="px-1 text-[11px] font-bold uppercase text-nada-text-muted">Muted</p>
        <div className="rounded-2xl border border-nada-border/8 bg-nada-surface-elevated/30 px-4 py-4 text-[12.5px] text-nada-text-muted">
          Muted status updates will stay tucked away here.
        </div>
      </section>
    </div>
    );
}

export function StatusCreateSheet({
      onClose,
      onPost
    }: {
          onClose: () => void;
          onPost: (text: string, media?: MediaAttachment) => void;
        }) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [text, setText] = useState("");
    const [media, setMedia] = useState<MediaAttachment | null>(null);
    const [isPosting, setIsPosting] = useState(false);
    const canPost = Boolean(text.trim() || media);
    const selectStatusMedia = (file: File): void => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = String(reader.result ?? "");
              if (!dataUrl) return;
              setMedia({
                fileName: file.name,
                originalName: file.name,
                mimeType: file.type || "application/octet-stream",
                size: Math.max(file.size, 1),
                url: dataUrl,
                ...(file.type.startsWith("image/") ? { thumbnailDataUrl: dataUrl } : {})
              });
            };
            reader.readAsDataURL(file);
          };
    useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);
    return (
    <motion.div
      className="fixed inset-0 z-[1000] flex flex-col bg-nada-bg md:relative md:inset-auto md:h-full md:w-full pt-safe-area pb-safe-area pl-safe-area pr-safe-area"
      style={{
        background:
          "radial-gradient(circle at 50% 20%, rgb(var(--nada-accent) / 0.18), transparent 36%), radial-gradient(circle at 50% 80%, rgb(var(--nada-gold) / 0.10), transparent 34%), rgb(var(--nada-bg))"
      }}
      initial={{ y: "100%" }} 
      animate={{ y: 0 }} 
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 350 }}
    >
      <div className="flex h-16 items-center justify-between px-4 text-white">
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl bg-white/8 text-white/80"><X size={22} /></button>
        <div className="text-center">
          <h2 className="font-bold">Add Status</h2>
          <p className="text-[10px] text-white/45">Vanishes in 24h</p>
        </div>
        <button 
          onClick={() => {
            if (!canPost) return;
            setIsPosting(true);
            onPost(text, media ?? undefined);
          }}
          disabled={!canPost || isPosting}
          className="rounded-full bg-nada-accent px-5 py-2 text-sm font-bold text-white shadow-accent-glow disabled:opacity-50"
        >
          Post
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        <textarea
          autoFocus
          className="w-full resize-none bg-transparent text-center text-[30px] font-bold leading-tight text-white outline-none placeholder:text-white/20"
          placeholder="Say less..."
          value={text}
          onChange={e => setText(e.target.value)}
          rows={5}
        />
      </div>
      <div className="px-6 pb-8">
        <input
          ref={fileInputRef}
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) selectStatusMedia(file);
            event.currentTarget.value = "";
          }}
          type="file"
        />
        {media ? (
          <div className="mx-auto mb-4 max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] p-3">
            {media.mimeType.startsWith("image/") ? (
              <img
                alt={media.originalName}
                className="max-h-56 w-full rounded-2xl object-contain"
                src={media.url}
              />
            ) : media.mimeType.startsWith("video/") ? (
              <video className="max-h-56 w-full rounded-2xl" controls src={media.url} />
            ) : (
              <audio className="w-full" controls src={media.url} />
            )}
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-white/60">
              <span className="truncate">{media.originalName}</span>
              <button className="font-bold text-red-200" onClick={() => setMedia(null)} type="button">
                Remove
              </button>
            </div>
          </div>
        ) : null}
        <div className="mx-auto mb-4 flex max-w-sm justify-center gap-2">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm font-bold text-white/75"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Image size={16} />
            Add media
          </button>
        </div>
        <div className="mx-auto flex max-w-sm flex-wrap justify-center gap-2">
          {["Anonymous", "No screenshots if supported", "Comments in status"].map((label) => (
            <span key={label} className="nada-privacy-chip border-white/10 bg-white/[0.06] text-white/65">{label}</span>
          ))}
        </div>
      </div>
    </motion.div>
    );
}

export function StatusViewerSheet({
      contacts,
      identity,
      onComment,
      onDeleteStatus,
      onReactStatus,
      senderName,
      statuses,
      onClose
    }: {
          contacts: ContactRecord[];
          identity: IdentityRecord;
          onComment: (status: MessageRecord, text: string) => void;
          onDeleteStatus: (status: MessageRecord) => void;
          onReactStatus: (status: MessageRecord, emoji: string) => Promise<MessageRecord | null>;
          senderName: string;
          statuses: MessageRecord[];
          onClose: () => void;
        }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [commentDraft, setCommentDraft] = useState("");
    const [comments, setComments] = useState<MessageRecord[]>([]);
    const [showComments, setShowComments] = useState(false);
    const [pendingDeleteStatus, setPendingDeleteStatus] = useState<MessageRecord | null>(null);
    const currentStatus = statuses[currentIndex];
    useEffect(() => {
    setCurrentIndex((index) => Math.min(index, Math.max(statuses.length - 1, 0)));
    }, [statuses.length]);
    const goToPreviousStatus = useCallback(() => {
            setCurrentIndex((index) => Math.max(index - 1, 0));
          }, []);
    const goToNextStatus = useCallback(() => {
            setCurrentIndex((index) => {
              if (index < statuses.length - 1) {
                return index + 1;
              }
              onClose();
              return index;
            });
          }, [onClose, statuses.length]);
    const handleStatusTap = useCallback((event: MouseEvent<HTMLDivElement>) => {
            if (showComments) return;
            const rect = event.currentTarget.getBoundingClientRect();
            if (event.clientX < rect.left + rect.width / 2) {
              goToPreviousStatus();
            } else {
              goToNextStatus();
            }
          }, [goToNextStatus, goToPreviousStatus, showComments]);
    useEffect(() => {
    if (showComments || commentDraft.trim()) return;
    const timer = setTimeout(goToNextStatus, 5000);
    return () => clearTimeout(timer);
    }, [commentDraft, goToNextStatus, showComments]);
    useEffect(() => {
    if (!currentStatus) return;
    let active = true;
    const load = async () => {
      const records = await loadStatusComments(currentStatus.id);
      if (active) setComments(records.sort((a, b) => a.createdAt - b.createdAt));
    };
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 2000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
    }, [currentStatus]);
    useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);
    const commentRecords = useMemo(
            () => comments.filter((comment) => Boolean(parseStatusCommentPayload(comment.body))),
            [comments]
          );
    const reactionSummary = useMemo(() => {
            const latestBySender = new Map<string, { createdAt: number; emoji: string }>();
            comments.forEach((comment) => {
              const payload = parseStatusReactionPayload(comment.body);
              if (!payload) return;
              const existing = latestBySender.get(comment.senderPubkeyHash);
              if (!existing || comment.createdAt >= existing.createdAt) {
                latestBySender.set(comment.senderPubkeyHash, {
                  createdAt: comment.createdAt,
                  emoji: payload.emoji
                });
              }
            });

            const counts = new Map<string, number>();
            latestBySender.forEach(({ emoji }) => {
              counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
            });

            return {
              counts,
              mine: latestBySender.get(identity.pubkeyHash)?.emoji ?? null,
              total: latestBySender.size
            };
          }, [comments, identity.pubkeyHash]);
    if (!currentStatus) return null;
    const statusText = decodeMessagePayload(currentStatus.body)?.text ?? textFromMessage(currentStatus);
    const statusMedia = mediaFromMessage(currentStatus);
    const statusMediaUrl = statusMedia?.url ?? statusMedia?.thumbnailDataUrl ?? statusMedia?.thumbnailUrl ?? null;
    const canDeleteCurrentStatus = currentStatus.senderPubkeyHash === identity.pubkeyHash;
    return (
    <motion.div
      className="fixed inset-0 z-[1100] flex flex-col bg-black text-white"
      initial={{ opacity: 0, scale: 0.95 }} 
      animate={{ opacity: 1, scale: 1 }} 
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", damping: 30, stiffness: 400 }}
    >
      <div className="absolute inset-x-0 top-0 z-10 p-4 pt-safe-area">
        <div className="flex gap-1 mb-4">
          {statuses.map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden">
               {i === currentIndex && (
                 <motion.div 
                   key={currentStatus.id}
                   className="h-full bg-white" 
                   initial={{ width: 0 }} 
                   animate={{ width: "100%" }} 
                   transition={{ duration: 5, ease: "linear" }} 
                 />
               )}
               {i < currentIndex && <div className="h-full w-full bg-white" />}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <IdentityOrb seed={senderName} size="md" label={senderName} />
             <div>
                <h3 className="font-bold">{senderName}</h3>
                <p className="text-[10px] opacity-60">{formatRelativeTime(currentStatus.createdAt)}</p>
             </div>
          </div>
          <div className="flex items-center gap-2">
            {canDeleteCurrentStatus ? (
              <button
                aria-label="Delete status"
                className="grid h-10 w-10 place-items-center rounded-2xl bg-red-500/12 text-red-200 transition hover:bg-red-500/18"
                onClick={() => setPendingDeleteStatus(currentStatus)}
                type="button"
              >
                <Trash2 size={18} />
              </button>
            ) : null}
            <button
              aria-label="Close status"
              className="grid h-10 w-10 place-items-center rounded-2xl bg-white/8 text-white/80 transition hover:bg-white/12"
              onClick={onClose}
              type="button"
            >
              <X size={22} />
            </button>
          </div>
        </div>
      </div>

      <div
        className="relative flex-1 flex items-center justify-center p-6 text-center"
        onClick={handleStatusTap}
      >
        <button
          aria-label="Previous status"
          className="absolute inset-y-0 left-0 z-[1] w-1/2 cursor-pointer bg-transparent"
          onClick={(event) => {
            event.stopPropagation();
            goToPreviousStatus();
          }}
          type="button"
        />
        <button
          aria-label="Next status"
          className="absolute inset-y-0 right-0 z-[1] w-1/2 cursor-pointer bg-transparent"
          onClick={(event) => {
            event.stopPropagation();
            goToNextStatus();
          }}
          type="button"
        />
        <div className="pointer-events-none relative z-[2] flex max-w-2xl flex-col items-center gap-5">
          {statusMedia && statusMediaUrl ? (
            statusMedia.mimeType.startsWith("image/") ? (
              <img
                alt={statusMedia.originalName}
                className="max-h-[58vh] max-w-full rounded-3xl object-contain shadow-2xl"
                src={statusMediaUrl}
              />
            ) : statusMedia.mimeType.startsWith("video/") ? (
              <video
                className="pointer-events-auto max-h-[58vh] max-w-full rounded-3xl shadow-2xl"
                controls
                src={statusMediaUrl}
              />
            ) : (
              <audio className="pointer-events-auto w-[min(88vw,420px)]" controls src={statusMediaUrl} />
            )
          ) : null}
          {statusText && statusText !== currentStatus.body ? (
            <p className="text-3xl font-bold leading-tight max-w-lg">
              {statusText}
            </p>
          ) : !statusMedia ? (
            <p className="text-3xl font-bold leading-tight max-w-lg">
              {statusText}
            </p>
          ) : null}
        </div>
      </div>

      <div className="z-10 border-t border-white/10 bg-black/80 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
          {STATUS_REACTION_EMOJIS.map((emoji) => {
            const count = reactionSummary.counts.get(emoji) ?? 0;
            const isMine = reactionSummary.mine === emoji;
            return (
              <button
                className={cn(
                  "inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-full border px-3 text-lg transition",
                  isMine
                    ? "border-nada-accent/45 bg-nada-accent/20 text-white shadow-[0_0_24px_rgb(var(--nada-accent)/0.18)]"
                    : "border-white/10 bg-white/8 text-white/85 hover:bg-white/12"
                )}
                key={emoji}
                onClick={() => {
                  void onReactStatus(currentStatus, emoji).then((record) => {
                    if (!record) return;
                    setComments((current) =>
                      [...current, record].sort((a, b) => a.createdAt - b.createdAt)
                    );
                  });
                }}
                type="button"
              >
                <span>{emoji}</span>
                {count > 0 ? (
                  <span className="text-[11px] font-bold text-white/60">{count}</span>
                ) : null}
              </button>
            );
          })}
          {reactionSummary.total > 0 ? (
            <span className="shrink-0 rounded-full bg-white/8 px-3 py-2 text-xs font-semibold text-white/55">
              {reactionSummary.total} reaction{reactionSummary.total === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        <button
          className="mb-3 flex w-full items-center justify-between rounded-2xl bg-white/8 px-4 py-3 text-left text-sm font-semibold"
          onClick={() => setShowComments((current) => !current)}
          type="button"
        >
          <span className="flex items-center gap-2">
            <MessageCircle size={16} />
            Comments
          </span>
          <span className="text-white/55">{commentRecords.length}</span>
        </button>
        {showComments ? (
          <div className="mb-3 max-h-44 space-y-2 overflow-y-auto pr-1">
            {commentRecords.length === 0 ? (
              <p className="py-4 text-center text-xs text-white/45">
                No comments yet.
              </p>
            ) : (
              commentRecords.map((comment) => {
                const payload = parseStatusCommentPayload(comment.body);
                const name =
                  comment.senderPubkeyHash === identity.pubkeyHash
                    ? "You"
                    : contacts.find((contact) => contact.pubkeyHash === comment.senderPubkeyHash)
                        ?.localDisplayName ?? generateRandomUsername(comment.senderPubkeyHash);
                return (
                  <div key={comment.id} className="rounded-2xl bg-white/8 px-3 py-2 text-left">
                    <div className="mb-0.5 flex items-center justify-between gap-3">
                      <span className="text-xs font-bold">{name}</span>
                      <span className="text-[10px] text-white/40">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-white/80">
                      {payload?.text ?? comment.body}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = commentDraft.trim();
            if (!trimmed) return;
            onComment(currentStatus, trimmed);
            const timestamp = Date.now();
            const localComment: MessageRecord = {
              id: crypto.randomUUID(),
              chatId: statusCommentChatId(currentStatus.id),
              senderPubkeyHash: identity.pubkeyHash,
              recipientPubkeyHash: currentStatus.senderPubkeyHash,
              direction: "outbound",
              kind: "system",
              body: JSON.stringify({
                kind: "status-comment",
                statusId: currentStatus.id,
                statusOwnerPubkeyHash: currentStatus.senderPubkeyHash,
                text: trimmed,
                version: 1
              } satisfies StatusCommentPayload),
              encryptedPayload: "local-preview",
              status: "sent",
              createdAt: timestamp
            };
            setComments((current) => [...current, localComment]);
            setCommentDraft("");
            setShowComments(true);
          }}
        >
          <input
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-nada-accent/50"
            onChange={(event) => setCommentDraft(event.target.value)}
            placeholder="Comment on this status..."
            value={commentDraft}
          />
          <button
            className="grid h-11 w-11 place-items-center rounded-2xl bg-nada-accent text-black disabled:opacity-40"
            disabled={!commentDraft.trim()}
            type="submit"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
      <AnimatePresence>
        {pendingDeleteStatus ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-[20] grid place-items-center bg-black/55 p-5 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => setPendingDeleteStatus(null)}
          >
            <motion.div
              animate={{ y: 0, opacity: 1, scale: 1 }}
              className="w-full max-w-sm rounded-3xl border border-white/10 bg-nada-surface p-5 text-left shadow-2xl"
              exit={{ y: 12, opacity: 0, scale: 0.98 }}
              initial={{ y: 12, opacity: 0, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-red-500/12 text-red-300">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-nada-primary">Delete status?</h3>
                  <p className="text-xs text-nada-secondary/55">This status and its comments will be removed.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-2xl bg-nada-muted px-4 py-3 text-sm font-semibold text-nada-secondary"
                  onClick={() => setPendingDeleteStatus(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="flex-1 rounded-2xl bg-red-500 px-4 py-3 text-sm font-bold text-white"
                  onClick={() => {
                    onDeleteStatus(pendingDeleteStatus);
                    setPendingDeleteStatus(null);
                  }}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
    );
}
