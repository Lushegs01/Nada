"use client";

/**
 * ChatThreadHero — pixel-honest mobile mock of the redesigned chat thread.
 * Demonstrates all Vantage signature elements:
 *   · IdentityOrb (generative animated blob)
 *   · Whisper bubbles (asymmetric, no tails)
 *   · Time ribbon (left-edge scrubber)
 *   · Liquid composer capsule
 *   · Ghost mode, disappearing message counter, reactions
 *   · Framer Motion spring physics throughout
 */

import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Phone,
  Video,
  MoreHorizontal,
  Smile,
  Paperclip,
  Mic,
  Send,
  Check,
  CheckCheck,
  Play,
  Pause,
  Clock,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@nada/ui";
import { IdentityOrb } from "@nada/ui";

/* ── Spring tokens ─────────────────────────────────────────── */

const SPRING_GENTLE   = { type: "spring", stiffness: 200, damping: 26 } as const;
const SPRING_SNAPPY   = { type: "spring", stiffness: 500, damping: 35 } as const;

/* ── Message fixtures ──────────────────────────────────────── */

type MsgStatus = "sent" | "delivered" | "seen";

interface TextMsg {
  kind: "text";
  id: string;
  text: string;
  outbound: boolean;
  time: string;
  status?: MsgStatus;
  reactions?: { emoji: string; mine?: boolean }[];
  replyTo?: { author: string; preview: string };
  isNew?: boolean;
  disappearsIn?: number; // seconds remaining
  isGhostBlur?: boolean;
}
interface VoiceMsg {
  kind: "voice";
  id: string;
  duration: string;
  outbound: boolean;
  time: string;
  status?: MsgStatus;
  isNew?: boolean;
}
interface DateSep {
  kind: "date";
  id: string;
  label: string;
}
interface TypingMsg {
  kind: "typing";
  id: string;
}

type Message = TextMsg | VoiceMsg | DateSep | TypingMsg;

const MESSAGES: Message[] = [
  { kind: "date",  id: "d1", label: "Yesterday" },
  { kind: "text",  id: "m1", text: "hey",  outbound: false, time: "21:42", isNew: true },
  { kind: "text",  id: "m2", text: "you there?", outbound: false, time: "21:43" },
  { kind: "text",  id: "m3", text: "yeah just saw this lol", outbound: true, time: "21:58", status: "seen" },
  { kind: "text",  id: "m4", text: "what's up", outbound: true, time: "21:58", status: "seen" },
  { kind: "date",  id: "d2", label: "Today" },
  { kind: "text",  id: "m5", text: "wanted to send you something\ndon't freak out", outbound: false, time: "09:11", isNew: true },
  { kind: "text",  id: "m6", text: "ok now i'm concerned", outbound: true, time: "09:12", status: "seen" },
  { kind: "voice", id: "m7", duration: "0:34", outbound: false, time: "09:13", isNew: true },
  { kind: "text",  id: "m8", text: "wait what", outbound: true, time: "09:15", status: "seen" },
  { kind: "text",  id: "m9", text: "ok actually that makes sense", outbound: true, time: "09:16", status: "seen",
    reactions: [{ emoji: "🔥", mine: true }] },
  {
    kind: "text", id: "m10", text: "right??", outbound: false, time: "09:17",
    reactions: [{ emoji: "🔥", mine: false }],
  },
  { kind: "text",  id: "m11", text: "yeah. been thinking about this a lot lately", outbound: true, time: "09:18", status: "seen" },
  { kind: "text",  id: "m12", text: "can we call later?", outbound: true, time: "09:18", status: "delivered" },
  { kind: "text",  id: "m13", text: "sure. 9pm?", outbound: false, time: "09:19",
    replyTo: { author: "you", preview: "can we call later?" }
  },
  { kind: "text",  id: "m14", text: "perfect", outbound: true, time: "09:20", status: "seen",
    disappearsIn: 42, isGhostBlur: false },
  { kind: "typing", id: "t1" },
];

/* ── Component: StatusIcon ──────────────────────────────────── */

function StatusIcon({ status }: { status?: MsgStatus }) {
  if (!status) return null;
  if (status === "seen")
    return <CheckCheck className="h-3 w-3 text-[#7C6EF8]" strokeWidth={2.5} />;
  if (status === "delivered")
    return <CheckCheck className="h-3 w-3 opacity-40" strokeWidth={2.5} />;
  return <Check className="h-3 w-3 opacity-30" strokeWidth={2.5} />;
}

/* ── Component: TypingBubble ─────────────────────────────────── */

function TypingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING_GENTLE}
      className="flex items-end gap-2 pl-10"
    >
      <div
        className="flex items-center gap-1 px-4 py-3"
        style={{
          background: "rgb(var(--n-recv-bg))",
          borderRadius: "22px 22px 22px 6px",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="nada-typing-dot"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </div>
    </motion.div>
  );
}

/* ── Component: VoiceNoteBubble ─────────────────────────────── */

function VoiceNoteBubble({ msg }: { msg: VoiceMsg }) {
  const [playing, setPlaying] = useState(false);
  const progress = 0;

  const bars = Array.from({ length: 36 }, (_, i) => {
    const h = 0.2 + Math.abs(Math.sin(i * 0.7 + 1.2)) * 0.8;
    return h;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 5, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING_GENTLE}
      className={cn("flex", msg.outbound ? "justify-end" : "justify-start pl-10")}
    >
      <div
        className={cn("flex items-center gap-3 px-3 py-2.5 min-w-[200px] max-w-[260px]")}
        style={{
          background: msg.outbound ? "rgb(var(--n-sent-bg))" : "rgb(var(--n-recv-bg))",
          borderRadius: msg.outbound ? "22px 22px 6px 22px" : "22px 22px 22px 6px",
          border: msg.outbound
            ? "1px solid rgba(124,110,248,0.15)"
            : "1px solid rgba(255,255,255,0.07)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.40)",
        }}
      >
        {/* Play / pause button */}
        <button
          onClick={() => setPlaying((p) => !p)}
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-transform active:scale-90"
          style={{
            background: "linear-gradient(135deg, #7C3AED 0%, #2563EB 55%, #10D98A 100%)",
            boxShadow: "0 2px 10px rgba(124,58,237,0.40)",
          }}
          aria-label={playing ? "Pause voice note" : "Play voice note"}
        >
          {playing
            ? <Pause className="h-3.5 w-3.5 text-white" fill="currentColor" />
            : <Play  className="h-3.5 w-3.5 text-white ml-0.5" fill="currentColor" />
          }
        </button>

        {/* Waveform */}
        <div className="flex-1 flex items-center gap-[2px] h-8 relative">
          {bars.map((h, i) => {
            const played = (i / bars.length) <= progress;
            return (
              <motion.div
                key={i}
                className="rounded-full flex-shrink-0"
                style={{
                  width: 2,
                  height: `${h * 100}%`,
                  background: played
                    ? "linear-gradient(to top, #7C3AED, #10D98A)"
                    : "rgba(255,255,255,0.20)",
                }}
                animate={playing && i === Math.floor(progress * bars.length)
                  ? { scaleY: [1, 1.4, 1], opacity: [1, 0.9, 1] }
                  : {}
                }
                transition={{ duration: 0.4, repeat: Infinity }}
              />
            );
          })}
        </div>

        {/* Duration */}
        <span
          className="flex-shrink-0 text-[11px] tabular-nums text-white/50"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {msg.duration}
        </span>
      </div>
    </motion.div>
  );
}

/* ── Component: WhisperBubble ───────────────────────────────── */

function WhisperBubble({ msg, idx }: { msg: TextMsg; idx: number }) {
  const [ghostRevealed, setGhostRevealed] = useState(false);

  const isSent = msg.outbound;

  const bubbleStyle: React.CSSProperties = {
    background: isSent ? "rgb(var(--n-sent-bg))" : "rgb(var(--n-recv-bg))",
    borderRadius: isSent ? "22px 22px 6px 22px" : "22px 22px 22px 6px",
    border: isSent
      ? "1px solid rgba(124,110,248,0.14)"
      : "1px solid rgba(255,255,255,0.07)",
    boxShadow: isSent
      ? "0 1px 3px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.04)"
      : "0 1px 3px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)",
    maxWidth: "72vw",
    position: "relative",
  };

  /* Subtle gradient overlay on sent bubbles */
  const sentSheen: React.CSSProperties = isSent ? {
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    background: "linear-gradient(135deg, rgba(124,110,248,0.10) 0%, transparent 60%)",
    pointerEvents: "none",
  } : {};

  return (
    <motion.div
      initial={{ opacity: 0, y: 5, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...SPRING_GENTLE, delay: idx * 0.03 }}
      className={cn("flex flex-col", isSent ? "items-end" : "items-start pl-10")}
    >
      <div className="relative" style={bubbleStyle}>
        {isSent && <div style={sentSheen} aria-hidden />}

        {/* Reply quote */}
        {msg.replyTo && (
          <div
            className="mb-2 px-3 py-2 rounded-[6px]"
            style={{
              background: isSent ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.04)",
              borderLeft: `3px solid ${isSent ? "rgba(255,255,255,0.70)" : "rgb(var(--nada-accent))"}`,
            }}
          >
            <p
              className="text-[11px] font-semibold mb-0.5"
              style={{ color: isSent ? "rgba(255,255,255,0.85)" : "rgb(var(--nada-accent))" }}
            >
              {msg.replyTo.author}
            </p>
            <p className="text-xs truncate opacity-70">{msg.replyTo.preview}</p>
          </div>
        )}

        {/* Message text */}
        <p
          className={cn(
            "text-[14px] leading-[1.55] tracking-[-0.006em] px-3 py-2.5",
            msg.isGhostBlur && !ghostRevealed && "n-ghost-blur",
          )}
          style={{ color: "rgb(var(--n-tx1))", whiteSpace: "pre-wrap" }}
          onClick={() => msg.isGhostBlur && setGhostRevealed(true)}
        >
          {msg.text}
        </p>

        {/* Meta row */}
        <div className="flex items-center justify-end gap-1.5 px-3 pb-2 -mt-1">
          {msg.disappearsIn !== undefined && (
            <span
              className="flex items-center gap-0.5 text-[10px] tabular-nums"
              style={{ color: "rgba(255,89,103,0.80)", fontFamily: "'JetBrains Mono', monospace" }}
            >
              <Clock className="h-2.5 w-2.5" />
              {msg.disappearsIn}s
            </span>
          )}
          <span
            className="text-[11px] tabular-nums"
            style={{
              color: isSent ? "rgba(228,230,240,0.40)" : "rgba(138,145,170,0.55)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {msg.time}
          </span>
          {isSent && msg.status && <StatusIcon status={msg.status} />}
        </div>
      </div>

      {/* Reactions */}
      {msg.reactions && msg.reactions.length > 0 && (
        <div className={cn("flex gap-1 mt-1", isSent ? "mr-2" : "ml-2")}>
          {msg.reactions.map((r, ri) => (
            <motion.button
              key={ri}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ ...SPRING_SNAPPY, delay: 0.1 }}
              className={cn(
                "nada-reaction-chip text-sm",
                r.mine && "nada-reaction-mine",
              )}
              aria-label={`Reaction: ${r.emoji}`}
            >
              {r.emoji}
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ── Component: TimeRibbon ──────────────────────────────────── */

function TimeRibbon({ scrollPct }: { scrollPct: number }) {
  const labels = ["09:00", "09:10", "09:20"];

  return (
    <div className="absolute left-2 top-0 bottom-0 w-5 pointer-events-none select-none" aria-hidden>
      {/* The line */}
      <div
        className="absolute left-[9px] top-0 bottom-0 w-px"
        style={{ background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.08) 10%, rgba(255,255,255,0.08) 90%, transparent)" }}
      />
      {/* Glowing node */}
      <motion.div
        className="n-ribbon-node absolute"
        animate={{ top: `${scrollPct * 90}%` }}
        transition={SPRING_GENTLE}
        style={{ left: 4 }}
      />
      {/* Time labels */}
      {labels.map((label, i) => (
        <div
          key={i}
          className="absolute -left-1 flex items-center"
          style={{ top: `${(i / (labels.length - 1)) * 90}%` }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full mr-1 opacity-30"
            style={{ background: "rgba(255,255,255,0.50)", marginLeft: 3 }}
          />
          <span
            className="text-[9px] opacity-0 group-hover:opacity-100"
            style={{ color: "rgba(138,145,170,0.60)", fontFamily: "'JetBrains Mono', monospace" }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Component: ComposerCapsule ─────────────────────────────── */

function ComposerCapsule() {
  const [text, setText]       = useState("");
  const [recording, setRec]   = useState(false);
  const canSend = text.trim().length > 0;

  return (
    <div
      className="px-3 pb-[env(safe-area-inset-bottom)] pt-2"
      style={{
        background: "linear-gradient(to top, rgba(10,11,18,1) 0%, rgba(10,11,18,0.85) 100%)",
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        borderTop: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <motion.div
        layout
        transition={SPRING_GENTLE}
        className="n-composer flex items-center gap-2 px-2 py-2"
      >
        {/* Attach */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          transition={SPRING_SNAPPY}
          className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0"
          style={{ color: "rgba(138,145,170,0.70)" }}
          aria-label="Attach file"
        >
          <Paperclip className="h-4 w-4" strokeWidth={2} />
        </motion.button>

        {/* Text input */}
        <AnimatePresence mode="wait">
          {recording ? (
            <motion.div
              key="waveform"
              initial={{ opacity: 0, scaleX: 0.8 }}
              animate={{ opacity: 1, scaleX: 1 }}
              exit={{ opacity: 0, scaleX: 0.8 }}
              transition={SPRING_SNAPPY}
              className="flex-1 h-8 flex items-center gap-[2px]"
            >
              {Array.from({ length: 28 }, (_, i) => (
                <motion.div
                  key={i}
                  className="rounded-full flex-shrink-0"
                  style={{ width: 2, background: "rgba(255,89,103,0.70)" }}
                  animate={{ height: [4, 8 + Math.random() * 20, 4] }}
                  transition={{ duration: 0.6 + Math.random() * 0.4, repeat: Infinity }}
                />
              ))}
              <span
                className="ml-2 text-[11px] tabular-nums"
                style={{ color: "rgba(255,89,103,0.80)", fontFamily: "'JetBrains Mono', monospace" }}
              >
                0:07
              </span>
            </motion.div>
          ) : (
            <motion.textarea
              key="text"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Message"
              className="flex-1 bg-transparent outline-none resize-none text-[14px] leading-[1.55] max-h-28 py-1.5"
              style={{
                color: "rgb(var(--n-tx1))",
                fontFamily: "inherit",
                scrollbarWidth: "none",
              }}
              aria-label="Type a message"
            />
          )}
        </AnimatePresence>

        {/* Emoji */}
        {!recording && (
          <motion.button
            whileTap={{ scale: 0.88 }}
            transition={SPRING_SNAPPY}
            className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0"
            style={{ color: "rgba(138,145,170,0.70)" }}
            aria-label="Emoji picker"
          >
            <Smile className="h-4 w-4" strokeWidth={2} />
          </motion.button>
        )}

        {/* Send / Mic */}
        <AnimatePresence mode="wait">
          {canSend ? (
            <motion.button
              key="send"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={SPRING_SNAPPY}
              whileTap={{ scale: 0.88 }}
              className="n-composer-send w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              aria-label="Send message"
            >
              <Send className="h-4 w-4 ml-0.5" strokeWidth={2.5} />
            </motion.button>
          ) : (
            <motion.button
              key="mic"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={SPRING_SNAPPY}
              whileTap={{ scale: 0.88 }}
              onPointerDown={() => setRec(true)}
              onPointerUp={() => setRec(false)}
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
                recording ? "composer-recording" : "",
              )}
              style={!recording ? { color: "rgba(138,145,170,0.70)" } : {}}
              aria-label={recording ? "Stop recording" : "Record voice note"}
            >
              <Mic className="h-4 w-4" strokeWidth={2} />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────── */

export interface ChatThreadHeroProps {
  /** Contact seed (drives IdentityOrb colors) */
  contactSeed?: string;
  contactName?: string;
  /** Display in ghost mode */
  ghostMode?: boolean;
  className?: string;
}

export function ChatThreadHero({
  contactSeed = "phantom_42",
  contactName = "phantom_42",
  ghostMode = false,
  className,
}: ChatThreadHeroProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollPct, setScrollPct] = useState(0.8);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const pct = el.scrollTop / (el.scrollHeight - el.clientHeight);
    setScrollPct(Math.max(0, Math.min(1, pct)));
    setShowScrollBtn(pct < 0.85);
  }

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden",
        "h-[100dvh] max-h-[900px] w-full max-w-[430px] mx-auto",
        ghostMode && "saturate-[0.14] brightness-75",
        className,
      )}
      data-ghost={ghostMode ? "true" : undefined}
      style={{ background: "rgb(var(--n-base))" }}
    >
      {/* Ambient background depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 10% -5%, rgba(124,58,237,0.07) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 90% 105%, rgba(37,99,235,0.05) 0%, transparent 60%)",
        }}
      />

      {/* ── Thread Header ─────────────────────────────────────── */}
      <header
        className="relative z-[200] flex items-center gap-3 px-4 pt-[env(safe-area-inset-top)] pb-0"
        style={{
          background: "rgba(10,11,18,0.86)",
          backdropFilter: "blur(24px) saturate(150%)",
          WebkitBackdropFilter: "blur(24px) saturate(150%)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          minHeight: 72,
        }}
      >
        {/* Back */}
        <motion.button
          whileTap={{ scale: 0.88, x: -2 }}
          transition={SPRING_SNAPPY}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full -ml-1"
          style={{ color: "rgb(var(--n-tx2))" }}
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} />
        </motion.button>

        {/* Identity Orb — shared element hero */}
        <motion.div
          layoutId={`orb-${contactSeed}`}
          className="flex-shrink-0 relative"
        >
          <IdentityOrb seed={contactSeed} size="md" />
          {/* Online dot */}
          <span
            className="nada-status-online absolute bottom-0 right-0"
            style={{ width: 11, height: 11 }}
            aria-label="Online"
          />
        </motion.div>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <h1
            className="text-[16px] font-semibold leading-tight truncate tracking-[-0.010em]"
            style={{ color: "rgb(var(--n-tx1))" }}
          >
            {contactName}
          </h1>
          <p
            className="text-[11px] mt-0.5"
            style={{
              color: "rgb(var(--n-success))",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            online
          </p>
        </div>

        {/* E2E badge */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full mr-1"
          style={{
            background: "rgba(16,217,138,0.08)",
            border: "1px solid rgba(16,217,138,0.16)",
          }}
          title="End-to-end encrypted"
        >
          <ShieldCheck className="h-3 w-3" style={{ color: "rgb(var(--n-success))" }} strokeWidth={2.5} />
          <span
            className="text-[10px] font-medium"
            style={{ color: "rgb(var(--n-success))", fontFamily: "'JetBrains Mono', monospace" }}
          >
            e2e
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          {[
            { icon: Phone, label: "Voice call" },
            { icon: Video, label: "Video call" },
            { icon: MoreHorizontal, label: "More options" },
          ].map(({ icon: Icon, label }) => (
            <motion.button
              key={label}
              whileTap={{ scale: 0.88 }}
              transition={SPRING_SNAPPY}
              className="w-9 h-9 flex items-center justify-center rounded-full"
              style={{ color: "rgb(var(--n-tx2))" }}
              aria-label={label}
            >
              <Icon className="h-4.5 w-4.5" strokeWidth={2} />
            </motion.button>
          ))}
        </div>
      </header>

      {/* ── Message Area ──────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        {/* Time ribbon */}
        <TimeRibbon scrollPct={scrollPct} />

        {/* Scroll area */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto no-scrollbar relative z-10"
          style={{ scrollBehavior: "smooth" }}
        >
          <div className="flex flex-col gap-1.5 px-4 pt-4 pb-3 pl-9">
            {MESSAGES.map((msg, idx) => {
              if (msg.kind === "date") {
                return (
                  <div key={msg.id} className="flex justify-center my-3">
                    <span className="nada-date-pill">{msg.label}</span>
                  </div>
                );
              }

              if (msg.kind === "typing") {
                return <TypingBubble key={msg.id} />;
              }

              if (msg.kind === "voice") {
                return <VoiceNoteBubble key={msg.id} msg={msg} />;
              }

              return (
                <WhisperBubble
                  key={msg.id}
                  msg={msg}
                  idx={idx}
                />
              );
            })}

            {/* Scroll anchor */}
            <div className="h-2" />
          </div>
        </div>

        {/* Scroll-to-bottom button */}
        <AnimatePresence>
          {showScrollBtn && (
            <motion.button
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.9 }}
              transition={SPRING_SNAPPY}
              onClick={() => scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" })}
              className="nada-scroll-fab absolute bottom-4 right-4 z-20 w-9 h-9 rounded-full flex items-center justify-center"
              aria-label="Scroll to latest message"
            >
              <ChevronDown className="h-4 w-4" style={{ color: "rgb(var(--n-tx2))" }} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── Composer ──────────────────────────────────────────── */}
      <div className="relative z-[200]">
        <ComposerCapsule />
      </div>
    </div>
  );
}
