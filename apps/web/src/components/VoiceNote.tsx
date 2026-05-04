"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@nada/ui";

function formatDur(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return m > 0
    ? `${m}:${s.toString().padStart(2, "0")}`
    : `0:${s.toString().padStart(2, "0")}`;
}

// ── Audio peak extraction (cached per src) ───────────────────────────────────
// Decodes a data:audio/... URI once and computes per-bar amplitudes for the
// playback waveform. Heavy work — cache by src so re-mounting / replays are
// instant.

const PLAYBACK_BAR_COUNT = 42;
const peaksCache = new Map<string, number[]>();
const peaksInflight = new Map<string, Promise<number[]>>();

function fallbackPeaks(seed: number): number[] {
  // Deterministic but pleasant-looking pseudo-waveform shown until decode finishes.
  const out: number[] = [];
  for (let i = 0; i < PLAYBACK_BAR_COUNT; i++) {
    const t = i / PLAYBACK_BAR_COUNT;
    const wave =
      0.45 +
      0.3 * Math.sin(t * Math.PI * 4 + seed) +
      0.15 * Math.sin(t * Math.PI * 11 + seed * 1.7);
    out.push(Math.max(0.18, Math.min(1, wave)));
  }
  return out;
}

async function computePeaks(src: string): Promise<number[]> {
  const cached = peaksCache.get(src);
  if (cached) return cached;

  const inflight = peaksInflight.get(src);
  if (inflight) return inflight;

  const job = (async (): Promise<number[]> => {
    const res = await fetch(src);
    const arrayBuffer = await res.arrayBuffer();
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) throw new Error("No AudioContext");
    const ctx = new Ctor();
    const audioBuffer: AudioBuffer = await new Promise((resolve, reject) => {
      // decodeAudioData consumes the buffer in some browsers — clone it.
      ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
    });
    const channel = audioBuffer.getChannelData(0);
    const samplesPerBar = Math.max(1, Math.floor(channel.length / PLAYBACK_BAR_COUNT));
    const peaks: number[] = new Array(PLAYBACK_BAR_COUNT);
    for (let i = 0; i < PLAYBACK_BAR_COUNT; i++) {
      let max = 0;
      let sumSq = 0;
      const start = i * samplesPerBar;
      const end = Math.min(start + samplesPerBar, channel.length);
      for (let j = start; j < end; j++) {
        const v = channel[j]!;
        const abs = v < 0 ? -v : v;
        if (abs > max) max = abs;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / Math.max(1, end - start));
      peaks[i] = max * 0.6 + rms * 0.4;
    }
    // Normalize and apply a gentle compressor curve so quiet notes still look full.
    let maxPeak = 0;
    for (const p of peaks) if (p > maxPeak) maxPeak = p;
    if (maxPeak < 1e-4) maxPeak = 1;
    for (let i = 0; i < peaks.length; i++) {
      const n = peaks[i]! / maxPeak;
      peaks[i] = Math.max(0.12, Math.pow(n, 0.65));
    }
    void ctx.close?.();
    peaksCache.set(src, peaks);
    return peaks;
  })().catch((err) => {
    peaksInflight.delete(src);
    throw err;
  });

  peaksInflight.set(src, job);
  try {
    const result = await job;
    peaksInflight.delete(src);
    return result;
  } catch {
    return fallbackPeaks(src.length);
  }
}

// ── Playback waveform ────────────────────────────────────────────────────────
// Animated, click-to-seek bars. Bars before the playhead are filled, after are
// dimmed; the bar straddling the playhead pulses subtly to give a sense of
// motion.

function PlaybackWaveform({
  peaks,
  progress,
  outbound,
  isPlaying,
  onSeek
}: {
  peaks: number[];
  progress: number;
  outbound: boolean;
  isPlaying: boolean;
  onSeek: (fraction: number) => void;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const handleSeekFromEvent = useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(fraction);
    },
    [onSeek]
  );

  return (
    <div
      ref={containerRef}
      role="slider"
      aria-label="Voice note progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      tabIndex={0}
      className="relative flex h-9 flex-1 cursor-pointer touch-none select-none items-center gap-[2px]"
      onPointerDown={(e) => {
        // Don't let pointer-down propagate to the parent message bubble — it
        // would otherwise be interpreted as the start of swipe-to-reply or
        // trigger the long-press context menu.
        e.preventDefault();
        e.stopPropagation();
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        handleSeekFromEvent(e.clientX);
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return;
        e.stopPropagation();
        handleSeekFromEvent(e.clientX);
      }}
      onPointerUp={(e) => {
        draggingRef.current = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onSeek(Math.max(0, progress - 0.05));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onSeek(Math.min(1, progress + 0.05));
        }
      }}
    >
      {peaks.map((amp, i) => {
        const barCenter = (i + 0.5) / peaks.length;
        const isPlayed = barCenter <= progress;
        const isHead =
          isPlaying &&
          Math.abs(barCenter - progress) < 0.5 / peaks.length + 0.001;
        const heightPct = 18 + amp * 82; // 18%..100% — never disappear

        const playedColor = outbound ? "rgb(255 255 255)" : "rgb(129 140 248)";
        const unplayedColor = outbound
          ? "rgb(255 255 255 / 0.35)"
          : "rgb(129 140 248 / 0.32)";

        return (
          <span
            key={i}
            aria-hidden
            className={cn(
              "block flex-1 rounded-full transition-[background-color,transform,box-shadow] duration-150 ease-out",
              isHead && "nada-wave-head"
            )}
            style={{
              height: `${heightPct}%`,
              background: isPlayed ? playedColor : unplayedColor,
              minWidth: 2,
              transform: isHead ? "scaleY(1.06)" : "scaleY(1)",
              boxShadow: isHead
                ? `0 0 8px ${outbound ? "rgba(255,255,255,0.55)" : "rgba(129,140,248,0.55)"}`
                : "none"
            }}
          />
        );
      })}
    </div>
  );
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
  // Peaks: start with a deterministic placeholder so the bubble has full
  // structure immediately; replace with real peaks once decoded.
  const fallback = useMemo(() => fallbackPeaks(src.length || 7), [src]);
  const [peaks, setPeaks] = useState<number[]>(() => peaksCache.get(src) ?? fallback);
  const [peaksReady, setPeaksReady] = useState<boolean>(() => peaksCache.has(src));

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

  // Decode peaks once the bubble mounts. Cached across re-mounts.
  useEffect(() => {
    if (!src || peaksReady) return;
    let cancelled = false;
    void computePeaks(src)
      .then((result) => {
        if (cancelled) return;
        setPeaks(result);
        setPeaksReady(true);
      })
      .catch(() => {
        // Keep the fallback waveform — it still looks good.
      });
    return () => {
      cancelled = true;
    };
  }, [src, peaksReady]);

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

  function seekTo(fraction: number): void {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = Math.max(0, Math.min(duration, fraction * duration));
    setCurrentTime(audio.currentTime);
  }

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const displayDuration = isPlaying || currentTime > 0 ? currentTime : duration;

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-red-400 opacity-80">
        <AlertCircle size={14} />
        <span>Audio unavailable</span>
      </div>
    );
  }

  return (
    <div className="flex min-w-[230px] max-w-[300px] items-center gap-3">
      {/* Play / Pause button */}
      <button
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
        onClick={togglePlay}
        disabled={loading}
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full transition-all duration-200",
          outbound
            ? "bg-white/25 hover:bg-white/35 active:scale-90 text-white"
            : "bg-nada-accent/20 hover:bg-nada-accent/30 active:scale-90 text-nada-accent",
          isPlaying && "shadow-[0_0_0_3px_rgba(255,255,255,0.12)]",
          loading && "opacity-50 cursor-wait"
        )}
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : isPlaying ? (
          <Pause size={16} />
        ) : (
          <Play size={16} className="translate-x-[1px]" />
        )}
      </button>

      {/* Waveform + duration */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <PlaybackWaveform
          peaks={peaks}
          progress={progress}
          outbound={outbound}
          isPlaying={isPlaying}
          onSeek={seekTo}
        />
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "text-[10.5px] tabular-nums tracking-wide",
              outbound ? "text-white/70" : "text-nada-secondary"
            )}
          >
            {formatDur(Math.round(displayDuration))}
          </span>
          {!peaksReady && !loading ? (
            <span
              className={cn(
                "text-[9px] uppercase tracking-[0.12em]",
                outbound ? "text-white/40" : "text-nada-secondary/50"
              )}
            >
              Decoding…
            </span>
          ) : null}
        </div>
      </div>
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
      ctx.fillStyle = active ? "rgba(239,68,68,0.85)" : "rgba(107,114,128,0.5)";
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
    <div className="flex items-center gap-3 rounded-xl bg-red-500/10 px-3 py-2 animate-fade-in border border-red-500/20">
      {/* Red blinking recording dot */}
      <span className="relative flex h-3 w-3 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
      </span>

      {/* Waveform visualization */}
      <WaveformBars analyser={analyser ?? null} active={true} />

      <span className="shrink-0 text-sm font-semibold text-red-400 tabular-nums tracking-wide min-w-[2.5rem] text-right">
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
