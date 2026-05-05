"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@nada/ui";
import WaveSurfer from "wavesurfer.js";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(Math.max(durationSeconds, 0));
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!src || !containerRef.current) {
      setError(true);
      return;
    }

    setError(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(Math.max(durationSeconds, 0));
    setLoading(true);

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: outbound ? "rgba(255, 255, 255, 0.35)" : "rgba(129, 140, 248, 0.35)",
      progressColor: outbound ? "rgba(255, 255, 255, 0.95)" : "rgba(129, 140, 248, 1)",
      cursorColor: "transparent",
      barWidth: 2.5,
      barGap: 2,
      barRadius: 2,
      dragToSeek: true,
      height: 34,
      interact: true,
      normalize: true,
      url: src
    });
    wavesurfer.current = ws;

    ws.on("ready", () => {
      const nextDuration = ws.getDuration();
      setLoading(false);
      setDuration(
        Number.isFinite(nextDuration) && nextDuration > 0
          ? nextDuration
          : Math.max(durationSeconds, 0)
      );
    });
    ws.on("error", () => {
      setError(true);
      setLoading(false);
    });
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => {
      setIsPlaying(false);
      setCurrentTime(0);
      ws.seekTo(0);
    });
    ws.on("timeupdate", (cur) => setCurrentTime(cur));

    return () => {
      ws.destroy();
      wavesurfer.current = null;
    };
  }, [durationSeconds, src, outbound]);

  function togglePlay(): void {
    if (wavesurfer.current && !error) {
      wavesurfer.current.playPause();
    }
  }

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
    <div className="flex min-w-[240px] max-w-[320px] items-center gap-3">
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

      {/* Waveform + duration */}
      <div className="flex flex-1 flex-col gap-1 overflow-hidden relative">
        <div className="relative h-9 w-full overflow-hidden rounded-lg">
          {loading ? (
            <div className="absolute inset-0 flex items-center gap-1.5">
              {Array.from({ length: 24 }, (_, index) => (
                <span
                  key={index}
                  className={cn(
                    "w-0.5 rounded-full animate-pulse",
                    outbound ? "bg-white/55" : "bg-nada-accent/45"
                  )}
                  style={{
                    animationDelay: `${index * 34}ms`,
                    height: `${28 + ((index * 17) % 54)}%`
                  }}
                />
              ))}
            </div>
          ) : null}
          <div
            ref={containerRef}
            aria-label="Voice note waveform"
            className={cn("h-9 w-full transition-opacity", loading && "opacity-0")}
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
