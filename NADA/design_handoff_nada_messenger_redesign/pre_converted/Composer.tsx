"use client";

/* ─────────────────────────────────────────────────────────────
   Composer — chat input bar with attach / timer / emoji / mic / send.
   NEW component. Drop into NadaApp.tsx where the message input
   currently lives.

   Props are intentionally minimal — wire your existing handlers
   for attach / record / emoji / send into the callbacks.
   ───────────────────────────────────────────────────────────── */

import { useRef, useState, type KeyboardEvent } from "react";
import {
  Ghost,
  Lock,
  Mic,
  Paperclip,
  Send,
  Smile,
  Timer
} from "lucide-react";
import { cn } from "@nada/ui";

export type ComposerProps = {
  /** Called when the user submits a text message (Enter or send button). */
  onSend: (text: string) => void;

  /** Called when the user clicks the mic icon (empty input) — toggle recording. */
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  isRecording?: boolean;

  /** Called when the user clicks paperclip. Wire to your attach picker. */
  onAttach?: () => void;
  /** Called when the user clicks emoji. */
  onEmoji?: () => void;
  /** Called when the user clicks the burn-timer button. */
  onVanishTimer?: () => void;

  /** Optional placeholder override. */
  placeholder?: string;
  /** Disable the input (e.g. read-only chat). */
  disabled?: boolean;
};

export const Composer = ({
  onSend,
  onStartRecording,
  onStopRecording,
  isRecording = false,
  onAttach,
  onEmoji,
  onVanishTimer,
  placeholder = "Send a ghost message…",
  disabled = false
}: ComposerProps) => {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = text.trim().length > 0 && !disabled;

  const submit = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText("");
    // Reset autosize
    if (ref.current) ref.current.style.height = "";
    ref.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const autoSize = (el: HTMLTextAreaElement) => {
    el.style.height = "";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  };

  return (
    <div
      className="px-6 pb-5 pt-3 shrink-0"
      style={{
        background:
          "linear-gradient(to top, rgb(var(--nada-bg) / 0.98) 0%, rgb(var(--nada-bg) / 0.85) 100%)",
        backdropFilter: "blur(22px)",
        WebkitBackdropFilter: "blur(22px)",
        borderTop: "1px solid rgb(var(--nada-border) / 0.05)"
      }}
    >
      <div className="composer-shell flex items-end gap-1 rounded-[18px] px-2 py-2">
        <IconBtn Icon={Paperclip} label="Attach"           onClick={onAttach} />

        <textarea
          ref={ref}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            autoSize(e.currentTarget);
          }}
          onKeyDown={onKey}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 resize-none bg-transparent px-1 py-2 text-[14px] outline-none placeholder:text-nada-secondary/45"
          style={{
            color: "rgb(var(--nada-primary))",
            lineHeight: 1.45,
            maxHeight: 128,
            scrollbarWidth: "none"
          }}
        />

        <IconBtn Icon={Timer} label="Vanish timer" onClick={onVanishTimer} />
        <IconBtn Icon={Smile} label="Emoji"        onClick={onEmoji} />

        {canSend ? (
          <button
            type="button"
            onClick={submit}
            aria-label="Send"
            className="composer-send grid h-9 w-9 shrink-0 place-items-center rounded-full"
          >
            <Send size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (isRecording ? onStopRecording?.() : onStartRecording?.())}
            aria-label={isRecording ? "Stop recording" : "Record voice note"}
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors",
              isRecording
                ? "composer-recording"
                : "text-nada-secondary/85 hover:bg-white/[0.06] hover:text-nada-primary"
            )}
          >
            <Mic size={16} />
          </button>
        )}
      </div>

      {/* Hint row */}
      <div className="mt-2 flex items-center justify-between px-1 text-[10.5px] font-mono text-nada-secondary/55">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <Lock size={10} /> end-to-end
          </span>
          <span className="opacity-60">·</span>
          <span className="flex items-center gap-1.5">
            <Ghost size={11} /> vanish 5m
          </span>
          <span className="opacity-60">·</span>
          <span>0 metadata stored</span>
        </div>
        <div>shift + ↵ for newline</div>
      </div>
    </div>
  );
};

const IconBtn = ({
  Icon,
  label,
  onClick
}: {
  Icon: typeof Send;
  label: string;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-nada-secondary/85 transition-colors hover:bg-white/[0.06] hover:text-nada-primary"
  >
    <Icon size={17} strokeWidth={1.85} />
  </button>
);
