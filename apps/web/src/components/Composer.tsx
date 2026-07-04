"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Smile, Paperclip, Send, Mic, X, Edit3 } from "lucide-react";

/* ─────────────────────────────────────────────── types ── */

interface ComposerProps {
  onSend: (text: string) => void;
  onAttach?: () => void;
  onEmoji?: () => void;
  onVoiceRecord?: () => void;
  onTyping?: () => void;
  replyTo?: { name: string; text: string } | null;
  onCancelReply?: () => void;
  editingText?: string | null;
  onCancelEdit?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

/* ─────────────────────────────── Vantage spring presets ── */
const SPRING = {
  gentle: { type: "spring" as const, stiffness: 200, damping: 26 },
  default: { type: "spring" as const, stiffness: 300, damping: 30 },
  snappy: { type: "spring" as const, stiffness: 500, damping: 35 },
};

const barVariants = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto" },
  exit: { opacity: 0, height: 0 },
};

/* Mic → Send spring pop: scale(0.5) → scale(1) */
const swapVariants = {
  initial: { scale: 0.5, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.5, opacity: 0 },
};

/* Deterministic-ish bar heights for the live voice waveform */
const WAVE_BARS = Array.from({ length: 28 }, (_, i) => 0.35 + 0.55 * Math.abs(Math.sin(i * 1.7)));

/* ─────────────────────────────────────────── component ── */

export function Composer({
  onSend,
  onAttach,
  onEmoji,
  onVoiceRecord,
  onTyping,
  replyTo,
  onCancelReply,
  editingText,
  onCancelEdit,
  disabled = false,
  placeholder = "Type a message",
}: ComposerProps) {
  const [text, setText] = useState("");
  const [voiceMode, setVoiceMode] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasText = text.trim().length > 0;

  /* ── Auto-size textarea ── */
  const autoSize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  /* ── Pre-fill textarea when editing ── */
  useEffect(() => {
    if (editingText != null) {
      setText(editingText);
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          ta.selectionStart = ta.selectionEnd = ta.value.length;
          autoSize(ta);
        }
      });
    }
  }, [editingText, autoSize]);

  /* ── Voice-mode duration counter ── */
  useEffect(() => {
    if (!voiceMode) return;
    setSeconds(0);
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [voiceMode]);

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  /* ── Submit ── */
  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "";
    textareaRef.current?.focus();
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit]
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      autoSize(e.currentTarget);
      onTyping?.();
    },
    [autoSize, onTyping]
  );

  const startVoice = useCallback(() => {
    setVoiceMode(true);
    onVoiceRecord?.();
  }, [onVoiceRecord]);

  const cancelVoice = useCallback(() => setVoiceMode(false), []);

  const showReplyBar = replyTo != null && editingText == null;
  const showEditBar = editingText != null;

  return (
    <div className="px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2">
      {/* ── Reply / Edit bar ── */}
      <AnimatePresence initial={false}>
        {showReplyBar && (
          <motion.div
            key="reply-bar"
            className="nada-reply-bar mb-2 overflow-hidden"
            variants={barVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={SPRING.gentle}
          >
            <div className="nada-reply-bar-content">
              <div className="nada-reply-bar-name">{replyTo!.name}</div>
              <div className="nada-reply-bar-text">{replyTo!.text}</div>
            </div>
            <button type="button" className="nada-icon-btn" aria-label="Cancel reply" onClick={onCancelReply}>
              <X size={16} />
            </button>
          </motion.div>
        )}

        {showEditBar && (
          <motion.div
            key="edit-bar"
            className="nada-reply-bar mb-2 overflow-hidden"
            variants={barVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={SPRING.gentle}
          >
            <Edit3 size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
            <div className="nada-reply-bar-content">
              <div className="nada-reply-bar-name">Editing</div>
              <div className="nada-reply-bar-text">{editingText}</div>
            </div>
            <button type="button" className="nada-icon-btn" aria-label="Cancel edit" onClick={onCancelEdit}>
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── The liquid capsule — one floating shape, interior swaps ── */}
      <motion.div layout className="n-composer" transition={SPRING.default}>
        <AnimatePresence mode="wait" initial={false}>
          {voiceMode ? (
            /* ── Voice mode: live waveform + mono duration; capsule keeps shape ── */
            <motion.div
              key="voice"
              className="flex flex-1 items-center gap-3 px-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <button
                type="button"
                className="nada-icon-btn !h-10 !w-10 text-n-danger"
                aria-label="Cancel recording"
                onClick={cancelVoice}
              >
                <X size={20} />
              </button>
              <span className="h-2 w-2 shrink-0 rounded-full bg-n-danger animate-glow-pulse" />
              <div className="flex h-8 flex-1 items-center gap-[3px] overflow-hidden">
                {WAVE_BARS.map((h, i) => (
                  <motion.span
                    key={i}
                    className="w-[3px] shrink-0 rounded-full"
                    style={{ background: "rgb(var(--n-accent-solid))" }}
                    animate={{ scaleY: [h, h * 0.4 + 0.3, h] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.045, ease: "easeInOut" }}
                    initial={{ height: 22, transformOrigin: "center" }}
                  />
                ))}
              </div>
              <span className="n-mono shrink-0 pr-1 text-[13px] font-medium text-n-tx1 tabular-nums">{mmss}</span>
              <motion.button
                type="button"
                className="n-composer-send !h-10 !w-10"
                aria-label="Send voice note"
                onClick={cancelVoice}
                whileTap={{ scale: 0.9 }}
                transition={SPRING.snappy}
              >
                <Send size={18} />
              </motion.button>
            </motion.div>
          ) : (
            /* ── Text mode ── */
            <motion.div
              key="text"
              className="flex flex-1 items-end gap-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <button type="button" className="nada-icon-btn" aria-label="Emoji" onClick={onEmoji}>
                <Smile size={20} strokeWidth={1.8} />
              </button>
              <button type="button" className="nada-icon-btn" aria-label="Attach file" onClick={onAttach}>
                <Paperclip size={19} strokeWidth={1.8} />
              </button>

              <textarea
                ref={textareaRef}
                className="min-h-[28px] max-h-[120px] flex-1 resize-none self-center bg-transparent px-1 py-2 text-[15px] leading-[1.4] tracking-[-0.008em] text-n-tx1 outline-none placeholder:text-n-tx3"
                value={text}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={placeholder}
                disabled={disabled}
                aria-label="Message input"
              />

              <AnimatePresence mode="wait" initial={false}>
                {hasText ? (
                  <motion.button
                    key="send"
                    type="button"
                    className="n-composer-send"
                    aria-label="Send message"
                    onClick={submit}
                    disabled={disabled}
                    variants={swapVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    whileTap={{ scale: 0.9 }}
                    transition={SPRING.snappy}
                  >
                    <Send size={18} />
                  </motion.button>
                ) : (
                  <motion.button
                    key="mic"
                    type="button"
                    className="nada-icon-btn"
                    aria-label="Voice message"
                    onClick={startVoice}
                    variants={swapVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    whileTap={{ scale: 0.9 }}
                    transition={SPRING.snappy}
                  >
                    <Mic size={20} strokeWidth={1.8} />
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
