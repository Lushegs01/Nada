"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@nada/ui";

function formatDur(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return m > 0
    ? `${m}:${s.toString().padStart(2, "0")}`
    : `0:${s.toString().padStart(2, "0")}`;
}

// ── Voice note playback bubble ────────────────────────────────────────────────
// The src is a data:audio/... base64 URI stored directly in the message body.
// We use a real <audio> element managed through a ref to avoid SSR issues.

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
  const [duration, setDuration] = useState(Math.max(durationSeconds, 0));
  const [error, setError] = useState(false);
  // Data URIs may not fire loadedmetadata on all browsers — treat as ready immediately
  const [loading, setLoading] = useState(!src.startsWith("data:"));

  useEffect(() => {
    if (!src) {
      setError(true);
      return;
    }

    const audio = new Audio();
    audioRef.current = audio;

    // Reset UI state
    setError(false);
    setIsPlaying(false);
    setCurrentTime(0);
    // Data URIs: trust the stored durationSeconds, no need to wait for metadata
    setLoading(!src.startsWith("data:"));

    audio.preload = "metadata";

    audio.onloadedmetadata = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
      setLoading(false);
    };

    // canplaythrough: also clear loading for data URIs that skip loadedmetadata
    audio.oncanplaythrough = () => {
      setLoading(false);
    };

    audio.onerror = () => {
      setError(true);
      setLoading(false);
    };

    audio.ontimeupdate = () => setCurrentTime(audio.currentTime);

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.onpause = () => setIsPlaying(false);
    audio.onplay = () => setIsPlaying(true);

    // Assign src after wiring events
    audio.src = src;
    audio.load();

    return () => {
      audio.pause();
      audio.onloadedmetadata = null;
      audio.oncanplaythrough = null;
      audio.onerror = null;
      audio.ontimeupdate = null;
      audio.onended = null;
      audio.onpause = null;
      audio.onplay = null;
      audio.src = "";
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  function togglePlay(): void {
    const audio = audioRef.current;
    if (!audio || error) return;

    if (isPlaying) {
      audio.pause();
    } else {
      // Reset to start if at end
      if (audio.ended || (audio.duration > 0 && audio.currentTime >= audio.duration - 0.1)) {
        audio.currentTime = 0;
      }
      const promise = audio.play();
      if (promise !== undefined) {
        promise.catch(() => {
          // Autoplay blocked — this should not happen since it's triggered by a click
          setIsPlaying(false);
        });
      }
    }
  }

  const pct = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;
  const displayDuration = isPlaying ? currentTime : duration;

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-red-400 opacity-80">
        <AlertCircle size={14} />
        <span>Audio unavailable</span>
      </div>
    );
  }

  return (
    <div className="flex min-w-[210px] max-w-[280px] items-center gap-3">
      {/* Play / Pause button */}
      <button
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
        onClick={togglePlay}
        disabled={loading}
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all",
          outbound
            ? "bg-white/25 hover:bg-white/35 active:scale-95 text-white"
            : "bg-nada-accent/15 hover:bg-nada-accent/25 active:scale-95 text-nada-accent",
          loading && "opacity-50 cursor-wait"
        )}
      >
        {loading ? (
          <Loader2 size={15} className="animate-spin" />
        ) : isPlaying ? (
          <Pause size={15} />
        ) : (
          <Play size={15} />
        )}
      </button>

      {/* Progress bar + duration */}
      <div className="flex flex-1 flex-col gap-1.5">
        {/* Clickable progress bar */}
        <div
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className={cn(
            "relative h-1.5 w-full cursor-pointer overflow-hidden rounded-full",
            outbound ? "bg-white/25" : "bg-nada-accent/20"
          )}
          onClick={(e) => {
            const audio = audioRef.current;
            if (!audio || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pctClicked = (e.clientX - rect.left) / rect.width;
            audio.currentTime = pctClicked * duration;
          }}
        >
          <div
            className={cn(
              "absolute left-0 top-0 h-full rounded-full transition-[width] duration-100",
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
          {formatDur(Math.round(displayDuration))}
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
    <div className="mb-2 flex items-center gap-3 rounded-xl bg-red-500/10 px-3 py-2 animate-fade-in">
      {/* Red blinking recording dot */}
      <span className="relative flex h-3 w-3 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
      </span>

      <span className="flex-1 text-sm font-semibold text-red-400 tabular-nums tracking-wide">
        {formatDur(seconds)}
      </span>

      <button
        aria-label="Cancel recording"
        onClick={onCancel}
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-nada-secondary hover:bg-nada-muted transition-colors"
      >
        Cancel
      </button>

      <button
        aria-label="Send voice note"
        onClick={onStop}
        className="rounded-lg bg-nada-accent px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
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
