"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@nada/ui";
import { motion } from "framer-motion";
import WaveSurfer from "wavesurfer.js";

const PLAYBACK_RATES = [1, 1.5, 2] as const;

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
  outbound,
  activePlaybackId,
  autoPlayToken = 0,
  onPlaybackEnd,
  onPlaybackStart,
  playbackId
}: {
  src: string;
  durationSeconds: number;
  outbound: boolean;
  activePlaybackId?: string | null;
  autoPlayToken?: number;
  onPlaybackEnd?: (playbackId: string) => void;
  onPlaybackStart?: (playbackId: string) => void;
  playbackId?: string;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const waveAreaRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const lastAutoPlayTokenRef = useRef(0);
  const pendingAutoPlayRef = useRef(false);
  const playbackRateRef = useRef<(typeof PLAYBACK_RATES)[number]>(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(Math.max(durationSeconds, 0));
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<(typeof PLAYBACK_RATES)[number]>(1);

  const progress =
    duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  const notifyPlaybackStart = useCallback(() => {
    if (playbackId) {
      onPlaybackStart?.(playbackId);
    }
  }, [onPlaybackStart, playbackId]);

  const notifyPlaybackEnd = useCallback(() => {
    if (playbackId) {
      onPlaybackEnd?.(playbackId);
    }
  }, [onPlaybackEnd, playbackId]);

  const playCurrent = useCallback((): boolean => {
    if (error) return false;
    notifyPlaybackStart();

    if (fallbackMode) {
      const audio = audioRef.current;
      if (!audio) return false;
      void audio.play().catch(() => setError(true));
      return true;
    }

    const ws = wavesurfer.current;
    if (!ws || loading) return false;
    void ws.play().catch(() => setError(true));
    return true;
  }, [error, fallbackMode, loading, notifyPlaybackStart]);

  const pauseCurrent = useCallback((): void => {
    if (fallbackMode) {
      audioRef.current?.pause();
      return;
    }
    wavesurfer.current?.pause();
  }, [fallbackMode]);

  const applyPlaybackRate = useCallback((rate: number): void => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = rate;
    const ws = wavesurfer.current as (WaveSurfer & {
      setPlaybackRate?: (rate: number, preservePitch?: boolean) => void;
    }) | null;
    ws?.setPlaybackRate?.(rate, true);
  }, []);

  const cyclePlaybackRate = useCallback((): void => {
    setPlaybackRate((current) => {
      const index = PLAYBACK_RATES.indexOf(current);
      const next = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length]!;
      playbackRateRef.current = next;
      applyPlaybackRate(next);
      return next;
    });
  }, [applyPlaybackRate]);

  const seekToTime = useCallback((nextTime: number): void => {
    const bounded = Math.min(Math.max(nextTime, 0), Math.max(duration, 0));
    setCurrentTime(bounded);
    if (fallbackMode) {
      const audio = audioRef.current;
      if (audio) audio.currentTime = bounded;
      return;
    }
    if (wavesurfer.current && duration > 0) {
      wavesurfer.current.seekTo(bounded / duration);
    }
  }, [duration, fallbackMode]);

  useEffect(() => {
    if (!src || !containerRef.current) {
      setError(true);
      return;
    }

    setError(false);
    setFallbackMode(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(Math.max(durationSeconds, 0));
    setLoading(true);
    applyPlaybackRate(playbackRateRef.current);

    const enableAudioFallback = () => {
      wavesurfer.current = null;
      setFallbackMode(true);
      setError(false);
      setLoading(false);
      setDuration(Math.max(durationSeconds, 0));
    };

    let ws: WaveSurfer;
    try {
      ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: outbound ? "rgba(255, 255, 255, 0.32)" : "rgba(30, 215, 130, 0.40)",
        progressColor: outbound ? "rgba(255, 255, 255, 0.98)" : "rgba(30, 215, 130, 0.98)",
        cursorColor: "transparent",
        barWidth: 3,
        barGap: 2,
        barRadius: 3,
        dragToSeek: true,
        height: 34,
        interact: true,
        normalize: true,
        url: src
      });
    } catch {
      enableAudioFallback();
      return;
    }
    wavesurfer.current = ws;

    ws.on("ready", () => {
      const nextDuration = ws.getDuration();
      setLoading(false);
      applyPlaybackRate(playbackRateRef.current);
      setDuration(
        Number.isFinite(nextDuration) && nextDuration > 0
          ? nextDuration
          : Math.max(durationSeconds, 0)
      );
      if (pendingAutoPlayRef.current) {
        pendingAutoPlayRef.current = false;
        notifyPlaybackStart();
        void ws.play().catch(() => setError(true));
      }
    });
    ws.on("error", () => {
      if (src.startsWith("data:") || src.startsWith("blob:")) {
        enableAudioFallback();
        return;
      }
      setError(true);
      setLoading(false);
    });
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => {
      setIsPlaying(false);
      setCurrentTime(0);
      ws.seekTo(0);
      notifyPlaybackEnd();
    });
    ws.on("timeupdate", (cur) => setCurrentTime(cur));

    return () => {
      try {
        ws.destroy();
      } catch {
        // WaveSurfer can throw during teardown after decode failures.
      }
      wavesurfer.current = null;
    };
  }, [applyPlaybackRate, durationSeconds, notifyPlaybackEnd, notifyPlaybackStart, src, outbound]);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
    applyPlaybackRate(playbackRate);
  }, [applyPlaybackRate, playbackRate]);

  useEffect(() => {
    if (!playbackId || activePlaybackId === playbackId) return;
    if (isPlaying) {
      pauseCurrent();
    }
  }, [activePlaybackId, isPlaying, pauseCurrent, playbackId]);

  useEffect(() => {
    if (
      !playbackId ||
      activePlaybackId !== playbackId ||
      !autoPlayToken ||
      autoPlayToken === lastAutoPlayTokenRef.current
    ) {
      return;
    }

    lastAutoPlayTokenRef.current = autoPlayToken;
    pendingAutoPlayRef.current = true;
    if (playCurrent()) {
      pendingAutoPlayRef.current = false;
    }
  }, [activePlaybackId, autoPlayToken, playbackId, playCurrent]);

  function togglePlay(): void {
    if (fallbackMode) {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) {
        void playCurrent();
      } else {
        pauseCurrent();
      }
      return;
    }

    if (wavesurfer.current && !error) {
      if (isPlaying) {
        pauseCurrent();
      } else {
        void playCurrent();
      }
    }
  }

  const displayDuration = isPlaying || currentTime > 0 ? currentTime : duration;

  if (error && !fallbackMode) {
    return (
      <div className="flex items-center gap-2 text-xs text-red-400 opacity-80">
        <AlertCircle size={14} />
        <span>Audio unavailable</span>
      </div>
    );
  }

  return (
    <div className="flex min-w-[260px] max-w-[340px] items-center gap-3">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        className="hidden"
        ref={audioRef}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
          notifyPlaybackEnd();
        }}
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration;
          if (Number.isFinite(nextDuration) && nextDuration > 0) {
            setDuration(nextDuration);
          }
        }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        preload="metadata"
        src={src}
      />
      {/* Play / Pause button */}
      <button
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
        onClick={togglePlay}
        disabled={loading && !fallbackMode}
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full transition-all duration-200",
          outbound
            ? "bg-white/22 hover:bg-white/32 active:scale-90 text-white"
            : "bg-nada-accent/16 hover:bg-nada-accent/26 active:scale-90 text-nada-accent",
          isPlaying && "shadow-[0_0_0_3px_rgba(255,255,255,0.12)]",
          loading && !fallbackMode && "opacity-50 cursor-wait"
        )}
      >
        {loading && !fallbackMode ? (
          <Loader2 size={16} className="animate-spin" />
        ) : isPlaying ? (
          <Pause size={16} />
        ) : (
          <Play size={16} className="translate-x-[1px]" />
        )}
      </button>

      {/* Waveform + duration */}
      <div className="flex flex-1 flex-col gap-1 overflow-hidden relative">
        <div
          ref={waveAreaRef}
          className="relative h-9 w-full rounded-lg select-none"
          onPointerDown={(event) => {
            // Click anywhere on the waveform to seek to that timestamp.
            // Skip if the pointer landed on the playhead dot itself
            // (the dot has its own drag handling).
            if ((event.target as HTMLElement).closest("[data-voice-dot]")) return;
            if (loading && !fallbackMode) return;
            const rect = waveAreaRef.current?.getBoundingClientRect();
            if (!rect || rect.width === 0) return;
            const ratio = Math.min(
              1,
              Math.max(0, (event.clientX - rect.left) / rect.width)
            );
            seekToTime(ratio * Math.max(duration, 0));
          }}
        >
          {loading || fallbackMode ? (
            <div className="absolute inset-0 flex items-center gap-[3px]">
              {Array.from({ length: 32 }, (_, index) => {
                // Pseudo-random but stable heights that look like real audio
                const seed = Math.sin(index * 1.7 + 0.5) * 10000;
                const noise = seed - Math.floor(seed);
                const envelope = Math.sin((index / 32) * Math.PI); // taper at edges
                const heightPct = 18 + envelope * 55 + noise * 30;
                const isPlayed = index / 32 <= progress;
                return (
                  <span
                    key={index}
                    className={cn(
                      "w-[3px] flex-shrink-0 rounded-full",
                      outbound
                        ? isPlayed
                          ? "bg-white"
                          : "bg-white/35"
                        : isPlayed
                          ? "bg-nada-accent"
                          : "bg-nada-accent/40",
                      loading && "animate-pulse"
                    )}
                    style={{
                      animationDelay: loading ? `${index * 34}ms` : undefined,
                      animationDuration: fallbackMode ? "900ms" : undefined,
                      height: `${Math.min(96, Math.max(18, heightPct))}%`
                    }}
                  />
                );
              })}
            </div>
          ) : null}
          <div
            ref={containerRef}
            aria-label="Voice note waveform"
            className={cn(
              "pointer-events-none h-9 w-full transition-opacity",
              (loading || fallbackMode) && "opacity-0"
            )}
          />

          {/* Seekable playhead — draggable dot overlay */}
          {!loading && duration > 0 && (
            <motion.div
              data-voice-dot
              role="slider"
              aria-label="Seek voice note"
              aria-valuemin={0}
              aria-valuemax={Math.max(duration, 0)}
              aria-valuenow={Math.min(currentTime, Math.max(duration, 0))}
              tabIndex={0}
              drag="x"
              dragConstraints={waveAreaRef}
              dragElastic={0}
              dragMomentum={false}
              onDragStart={() => setIsScrubbing(true)}
              onDrag={(_event, info) => {
                const rect = waveAreaRef.current?.getBoundingClientRect();
                if (!rect || rect.width === 0) return;
                const ratio = Math.min(
                  1,
                  Math.max(0, (info.point.x - rect.left) / rect.width)
                );
                seekToTime(ratio * Math.max(duration, 0));
              }}
              onDragEnd={() => setIsScrubbing(false)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                const step = Math.max(0.5, Math.min(2, duration * 0.04));
                seekToTime(currentTime + (event.key === "ArrowRight" ? step : -step));
              }}
              className={cn(
                "absolute top-1/2 z-10 grid h-3.5 w-3.5 -translate-y-1/2 -translate-x-1/2 place-items-center rounded-full",
                "cursor-grab active:cursor-grabbing select-none touch-none",
                "transition-shadow duration-150 hover:scale-110",
                outbound
                  ? "bg-white"
                  : "bg-nada-accent",
                isScrubbing && "scale-110"
              )}
              style={{
                left: `${progress * 100}%`,
                boxShadow: outbound
                  ? "0 2px 6px rgba(0,0,0,0.45), 0 0 0 2px rgba(255,255,255,0.22)"
                  : "0 2px 6px rgba(0,0,0,0.45), 0 0 0 2px rgba(30,215,130,0.25)"
              }}
            />
          )}
        </div>
        <span
          className={cn(
            "text-[11px] tabular-nums leading-none",
            outbound ? "text-white/70" : "text-nada-secondary/75"
          )}
        >
          {formatDur(displayDuration)}
        </span>
      </div>
      <button
        aria-label="Change voice note playback speed"
        className={cn(
          "h-8 min-w-11 rounded-full px-2 text-[11px] font-bold transition active:scale-95",
          outbound
            ? "bg-white/14 text-white/80 hover:bg-white/24"
            : "bg-nada-surface/70 text-nada-accent hover:bg-nada-accent/12"
        )}
        onClick={cyclePlaybackRate}
        type="button"
      >
        {playbackRate}x
      </button>
    </div>
  );
}

// ── Animated waveform bars ────────────────────────────────────────────────────
// Renders N bars whose heights are driven by either real AnalyserNode data
// or a smooth CSS animation fallback.

const BAR_COUNT = 28;

function WaveformBars({
  analyser,
  active
}: {
  analyser: AnalyserNode | null;
  active: boolean;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  // Smoothed amplitudes for each bar
  const smoothRef = useRef<Float32Array>(new Float32Array(BAR_COUNT).fill(0.15));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const smooth = smoothRef.current!;
    const barW = Math.floor((W - (BAR_COUNT - 1) * 2) / BAR_COUNT);

    if (analyser && active) {
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      const step = Math.floor(dataArray.length / BAR_COUNT);
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) {
          sum += dataArray[i * step + j]!;
        }
        const avg = sum / step / 255;
        // Lerp for smoothing
        smooth[i] = smooth[i]! * 0.6 + avg * 0.4;
      }
    } else if (active) {
      // Animated fallback if no analyser
      const t = Date.now() / 1000;
      for (let i = 0; i < BAR_COUNT; i++) {
        smooth[i] = 0.2 + 0.25 * Math.sin(t * 3 + i * 0.5) + 0.15 * Math.sin(t * 5 + i * 0.3);
      }
    } else {
      // Idle — flat low bars
      for (let i = 0; i < BAR_COUNT; i++) {
        smooth[i] = smooth[i]! * 0.85 + 0.04 * 0.15;
      }
    }

    for (let i = 0; i < BAR_COUNT; i++) {
      const h = Math.max(3, smooth[i]! * H * 0.9);
      const x = i * (barW + 2);
      const y = (H - h) / 2;
      // Red for recording, accent for idle
      ctx.fillStyle = active ? "rgba(255,77,94,0.88)" : "rgba(139,147,183,0.5)";
      ctx.beginPath();
      ctx.roundRect(x, y, barW, h, 2);
      ctx.fill();
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [analyser, active]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={BAR_COUNT * 6}
      height={32}
      className="h-8 flex-1"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

// ── Voice note recorder bar (shown inside composer) ───────────────────────────

export function VoiceRecorderBar({
  seconds,
  onStop,
  onCancel,
  analyser
}: {
  seconds: number;
  onStop: () => void;
  onCancel: () => void;
  analyser?: AnalyserNode | null;
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-full border border-nada-danger/25 bg-nada-danger/[0.08] px-3 py-2 animate-fade-in shadow-[0_0_30px_rgba(255,77,94,0.14)]">
      {/* Red blinking recording dot */}
      <span className="relative flex h-3 w-3 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
      </span>

      {/* Waveform visualization */}
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-[10.5px] font-semibold uppercase text-nada-danger/80">
          Recording securely
        </div>
        <WaveformBars analyser={analyser ?? null} active={true} />
      </div>

      <span className="shrink-0 min-w-[2.5rem] text-right text-sm font-bold tabular-nums text-nada-danger">
        {formatDur(seconds)}
      </span>

      <button
        aria-label="Cancel recording"
        onClick={onCancel}
        className="rounded-full px-3 py-1.5 text-xs font-semibold text-nada-secondary hover:bg-white/8 transition-colors"
      >
        Cancel
      </button>

      <button
        aria-label="Send voice note"
        onClick={onStop}
        className="rounded-full bg-nada-accent px-4 py-1.5 text-xs font-bold text-white shadow-accent-glow transition-all hover:opacity-90 active:scale-95"
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

// ── Helper: detect if a message is an inline image ───────────────────────────

export function isInlineImageMessage(body: string): boolean {
  return (
    body.startsWith("data:image/") ||
    (body.startsWith("__media__:") && body.includes("|image/"))
  );
}

export function isInlineFileMessage(body: string): boolean {
  return body.startsWith("__media__:");
}

// Format: __media__:<mimeType>|<filename>|<sizeBytes>|<base64data>
export function parseInlineFileMessage(body: string): {
  mimeType: string;
  filename: string;
  sizeBytes: number;
  dataUrl: string;
} | null {
  if (!body.startsWith("__media__:")) return null;
  const payload = body.slice("__media__:".length);
  const parts = payload.split("|");
  if (parts.length < 4) return null;
  const [mimeType, filename, sizeStr, ...dataParts] = parts;
  const dataUrl = dataParts.join("|"); // rejoin in case data had pipes
  return {
    mimeType: mimeType!,
    filename: filename!,
    sizeBytes: parseInt(sizeStr!, 10) || 0,
    dataUrl
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
