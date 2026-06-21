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
import { Smile, Plus, Send, Mic, X, Edit3 } from "lucide-react";

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

/* ─────────────────────────────────── animation variants ── */

const barVariants = {
  initial: { opacity: 0, height: 0, marginBottom: 0 },
  animate: { opacity: 1, height: "auto", marginBottom: 0 },
  exit: { opacity: 0, height: 0, marginBottom: 0 },
};

const iconVariants = {
  initial: { scale: 0, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0, opacity: 0 },
};

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
      // Focus and move cursor to end
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

  /* ── Submit ── */
  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "";
    }
    textareaRef.current?.focus();
  }, [text, disabled, onSend]);

  /* ── Key handler ── */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit]
  );

  /* ── Input handler ── */
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      autoSize(e.currentTarget);
      onTyping?.();
    },
    [autoSize, onTyping]
  );

  /* ── Whether to show the contextual bar ── */
  const showReplyBar = replyTo != null && editingText == null;
  const showEditBar = editingText != null;

  return (
    <div>
      {/* ── Reply / Edit bar ── */}
      <AnimatePresence>
        {showReplyBar && (
          <motion.div
            key="reply-bar"
            className="nada-reply-bar"
            variants={barVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="nada-reply-bar-content">
              <div className="nada-reply-bar-name">{replyTo!.name}</div>
              <div className="nada-reply-bar-text">{replyTo!.text}</div>
            </div>
            <button
              type="button"
              className="nada-icon-btn"
              aria-label="Cancel reply"
              onClick={onCancelReply}
            >
              <X size={16} />
            </button>
          </motion.div>
        )}

        {showEditBar && (
          <motion.div
            key="edit-bar"
            className="nada-reply-bar"
            variants={barVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <Edit3 size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
            <div className="nada-reply-bar-content">
              <div className="nada-reply-bar-name">Editing</div>
              <div className="nada-reply-bar-text">{editingText}</div>
            </div>
            <button
              type="button"
              className="nada-icon-btn"
              aria-label="Cancel edit"
              onClick={onCancelEdit}
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Composer row ── */}
      <div className="nada-composer">
        {/* Left buttons */}
        <div className="nada-composer-left">
          <button
            type="button"
            className="nada-icon-btn"
            aria-label="Emoji"
            onClick={onEmoji}
          >
            <Smile size={20} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            className="nada-icon-btn"
            aria-label="Attach file"
            onClick={onAttach}
          >
            <Plus size={22} strokeWidth={1.7} />
          </button>
        </div>

        {/* Input */}
        <div className="nada-composer-input-wrap">
          <textarea
            ref={textareaRef}
            className="nada-composer-input"
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={placeholder}
            disabled={disabled}
            aria-label="Message input"
          />
        </div>

        {/* Send / Mic toggle */}
        <AnimatePresence mode="wait" initial={false}>
          {hasText ? (
            <motion.button
              key="send"
              type="button"
              className="nada-composer-send"
              aria-label="Send message"
              onClick={submit}
              disabled={disabled}
              variants={iconVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              <Send size={18} />
            </motion.button>
          ) : (
            <motion.button
              key="mic"
              type="button"
              className="nada-icon-btn"
              aria-label="Voice message"
              onClick={onVoiceRecord}
              variants={iconVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              <Mic size={20} strokeWidth={1.7} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
