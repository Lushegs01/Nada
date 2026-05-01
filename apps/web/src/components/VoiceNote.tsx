"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@nada/ui";

function formatDur(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0
    ? `${m}:${s.toString().padStart(2, "0")}`
    : `0:${s.toString().padStart(2, "0")}`;
}

// ── Voice note playback bubble ────────────────────────────────────────────────

export function VoiceNoteBubble({
  src,
  durationSeconds,
  outbound
}: {
  src: string;
  durationSeconds: number;
  outbound: boolean;
}): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      if (isFinite(audio.duration)) setDuration(audio.duration);
    };
    audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    return () => {
      audio.pause();
      audio.src = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  function togglePlay(): void {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      void audio.play();
      setIsPlaying(true);
    }
  }

  const pct = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  return (
    <div className="flex min-w-[200px] items-center gap-2.5">
      <button
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
        onClick={togglePlay}
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full transition",
          outbound
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-nada-accent/15 hover:bg-nada-accent/25 text-nada-accent"
        )}
      >
        {isPlaying ? <Pause size={15} /> : <Play size={15} />}
      </button>

      {/* Waveform / progress bar */}
      <div className="flex flex-1 flex-col gap-1">
        <div
          className={cn(
            "relative h-1.5 w-full overflow-hidden rounded-full",
            outbound ? "bg-white/20" : "bg-nada-accent/20"
          )}
        >
          <div
            className={cn(
              "absolute left-0 top-0 h-full rounded-full transition-all",
              outbound ? "bg-white" : "bg-nada-accent"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span
          className={cn(
            "text-[10px] tabular-nums",
            outbound ? "text-white/60" : "text-nada-secondary"
          )}
        >
          {isPlaying
            ? formatDur(Math.round(currentTime))
            : formatDur(Math.round(duration))}
        </span>
      </div>
    </div>
  );
}

// ── Voice note recorder bar (shown inside composer) ───────────────────────────

export function VoiceRecorderBar({
  seconds,
  onStop,
  onCancel
}: {
  seconds: number;
  onStop: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-xl bg-red-500/10 px-3 py-2">
      {/* Red blinking dot */}
      <span className="relative flex h-3 w-3 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
      </span>

      <span className="flex-1 text-sm font-medium text-red-400 tabular-nums">
        {formatDur(seconds)}
      </span>

      <button
        aria-label="Cancel recording"
        onClick={onCancel}
        className="rounded-lg px-2 py-1 text-xs text-nada-secondary hover:bg-nada-muted transition-colors"
      >
        Cancel
      </button>

      <button
        aria-label="Send voice note"
        onClick={onStop}
        className="rounded-lg bg-nada-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
      >
        Send
      </button>
    </div>
  );
}

// ── Helper: detect if a message is a voice note ───────────────────────────────

export function isVoiceNoteMessage(body: string): boolean {
  return body.startsWith("data:audio/");
}

export function parseVoiceNoteBody(body: string): {
  src: string;
  durationSeconds: number;
} {
  // Format: "data:audio/webm;base64,...|<seconds>"
  const sepIdx = body.lastIndexOf("|");
  if (sepIdx === -1) return { src: body, durationSeconds: 0 };
  const src = body.slice(0, sepIdx);
  const durationSeconds = parseInt(body.slice(sepIdx + 1), 10) || 0;
  return { src, durationSeconds };
}
