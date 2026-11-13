"use client";
// Photos, GIFs, video and audio on Echoes: how they show in the feed, the
// full-screen photo viewer, and the composer's attachment tray and recorder.
import type { WhisperMedia } from "@nada/types";
import { cn } from "@nada/ui";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Film,
  ImageOff,
  Loader2,
  Music,
  Pause,
  Play,
  Square,
  X
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { forceRealDuration } from "@/components/VoiceNote";
import { whisperMediaUrl, type PreparedWhisperMedia } from "@/lib/whisper-media";

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

/** A short label for an Echo's attachments, for places that show no media. */
export function describeEchoMedia(media: readonly WhisperMedia[] | undefined): string {
  if (!media || media.length === 0) return "";
  const count = (kind: WhisperMedia["kind"]) => media.filter((item) => item.kind === kind).length;
  const parts: string[] = [];
  const photos = count("image");
  const videos = count("video");
  const audio = count("audio");
  if (photos) parts.push(photos === 1 ? "📷 Photo" : `📷 ${photos} photos`);
  if (videos) parts.push(videos === 1 ? "🎥 Video" : `🎥 ${videos} videos`);
  if (audio) parts.push(audio === 1 ? "🎵 Audio" : `🎵 ${audio} clips`);
  return parts.join(" · ");
}

// ── Feed display ────────────────────────────────────────────────────────────

function UnavailableTile({ className }: { className?: string }): JSX.Element {
  return (
    <div
      className={cn(
        "grid h-full w-full place-items-center bg-nada-surface/70 text-nada-secondary/50",
        className
      )}
    >
      <div className="flex flex-col items-center gap-1.5 px-3 text-center">
        <ImageOff size={18} />
        <span className="text-[11px] font-semibold">Media no longer available</span>
      </div>
    </div>
  );
}

function ImageTile({
  item,
  onOpen
}: {
  item: WhisperMedia;
  onOpen: () => void;
}): JSX.Element {
  const [failed, setFailed] = useState(false);
  if (failed) return <UnavailableTile />;
  return (
    <button
      aria-label="Open photo"
      className="group relative block h-full w-full overflow-hidden bg-nada-surface/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-nada-accent"
      onClick={onOpen}
      type="button"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- served by the relay, not Next */}
      <img
        alt="Photo shared in this Echo"
        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
        decoding="async"
        loading="lazy"
        onError={() => setFailed(true)}
        src={whisperMediaUrl(item.id)}
        {...(item.width && item.height ? { width: item.width, height: item.height } : {})}
      />
      {item.mimeType === "image/gif" ? (
        <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
          GIF
        </span>
      ) : null}
    </button>
  );
}

function VideoTile({ item }: { item: WhisperMedia }): JSX.Element {
  const [failed, setFailed] = useState(false);
  if (failed) return <UnavailableTile />;
  return (
    <video
      aria-label="Video shared in this Echo"
      className="h-full w-full bg-black object-contain"
      controls
      onError={() => setFailed(true)}
      playsInline
      preload="metadata"
      // The fragment makes Safari paint the first frame as a poster.
      src={`${whisperMediaUrl(item.id)}#t=0.1`}
    />
  );
}

/** Clamps a single tile's shape so a panorama or a tall screenshot stays sane. */
function singleTileAspect(item: WhisperMedia): number {
  if (!item.width || !item.height) return item.kind === "video" ? 16 / 9 : 4 / 3;
  return Math.min(1.91, Math.max(0.75, item.width / item.height));
}

export function EchoAudio({
  compact = false,
  item
}: {
  compact?: boolean;
  item: WhisperMedia;
}): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fixingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(item.duration ?? 0);
  const [failed, setFailed] = useState(false);

  const toggle = (): void => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => setFailed(true));
    else audio.pause();
  };

  const progress = duration > 0 ? Math.min(1, current / duration) : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-nada-border/10 bg-nada-surface/60",
        compact ? "px-2.5 py-2" : "px-3 py-2.5"
      )}
    >
      <audio
        onDurationChange={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value) && value > 0) setDuration(value);
        }}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onError={() => setFailed(true)}
        onLoadedMetadata={(event) =>
          // Browser recordings (WebM/Opus) often report a wrong length and
          // stop early; this makes the browser work out the real one.
          forceRealDuration(event.currentTarget, item.duration ?? 0, fixingRef)
        }
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onTimeUpdate={(event) => {
          if (!fixingRef.current) setCurrent(event.currentTarget.currentTime);
        }}
        preload="metadata"
        ref={audioRef}
        src={whisperMediaUrl(item.id)}
      />
      <button
        aria-label={playing ? "Pause audio" : "Play audio"}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-nada-accent text-white transition hover:opacity-90 disabled:opacity-40"
        disabled={failed}
        onClick={toggle}
        type="button"
      >
        {playing ? <Pause size={15} /> : <Play className="translate-x-[1px]" size={15} />}
      </button>
      <div className="min-w-0 flex-1">
        {failed ? (
          <p className="text-[12px] font-semibold text-nada-secondary/55">
            Audio no longer available
          </p>
        ) : (
          <>
            <input
              aria-label="Seek audio"
              className="nada-audio-seek block w-full"
              max={duration || 0}
              min={0}
              onChange={(event) => {
                const audio = audioRef.current;
                const next = Number(event.currentTarget.value);
                if (audio && Number.isFinite(next)) audio.currentTime = next;
                setCurrent(next);
              }}
              step={0.1}
              style={{ ["--seek" as string]: `${progress * 100}%` }}
              type="range"
              value={current}
            />
            <div className="mt-1 flex items-center justify-between text-[10.5px] tabular-nums text-nada-secondary/55">
              <span className="inline-flex items-center gap-1">
                <Music size={10} /> Audio
              </span>
              <span>
                {formatClock(current)} / {duration > 0 ? formatClock(duration) : "–:––"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * An Echo's attachments: photos and video in a grid of up to four, audio as
 * players beneath. `compact` is the smaller form used inside a Ripple's quote.
 */
export function EchoMediaGallery({
  compact = false,
  media
}: {
  compact?: boolean;
  media: readonly WhisperMedia[];
}): JSX.Element | null {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const visual = media.filter((item) => item.kind === "image" || item.kind === "video");
  const audio = media.filter((item) => item.kind === "audio");
  const photos = visual.filter((item) => item.kind === "image");
  if (media.length === 0) return null;

  const tile = (item: WhisperMedia): JSX.Element =>
    item.kind === "video" ? (
      <VideoTile item={item} />
    ) : (
      <ImageTile item={item} onOpen={() => setViewerIndex(photos.indexOf(item))} />
    );

  const gridHeight = compact ? "h-40" : "h-56 sm:h-72";

  return (
    <div className="space-y-2">
      {visual.length === 1 ? (
        <div
          className={cn(
            "overflow-hidden rounded-2xl border border-nada-border/10",
            compact ? "max-h-56" : "max-h-[480px]"
          )}
          style={{ aspectRatio: singleTileAspect(visual[0]!) }}
        >
          {tile(visual[0]!)}
        </div>
      ) : visual.length > 1 ? (
        <div
          className={cn(
            "grid gap-1 overflow-hidden rounded-2xl border border-nada-border/10",
            gridHeight,
            "grid-cols-2",
            visual.length > 2 && "grid-rows-2"
          )}
        >
          {visual.map((item, index) => (
            <div
              className={cn(
                "min-h-0 overflow-hidden",
                visual.length === 3 && index === 0 && "row-span-2"
              )}
              key={item.id}
            >
              {tile(item)}
            </div>
          ))}
        </div>
      ) : null}

      {audio.map((item) => (
        <EchoAudio compact={compact} item={item} key={item.id} />
      ))}

      <AnimatePresence>
        {viewerIndex !== null && photos[viewerIndex] ? (
          <PhotoViewer
            index={viewerIndex}
            onClose={() => setViewerIndex(null)}
            onIndexChange={setViewerIndex}
            photos={photos}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PhotoViewer({
  index,
  onClose,
  onIndexChange,
  photos
}: {
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  photos: readonly WhisperMedia[];
}): JSX.Element {
  const count = photos.length;
  const step = useCallback(
    (delta: number) => onIndexChange((index + delta + count) % count),
    [count, index, onIndexChange]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight" && count > 1) step(1);
      else if (event.key === "ArrowLeft" && count > 1) step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, onClose, step]);

  const photo = photos[index]!;
  return (
    <motion.div
      animate={{ opacity: 1 }}
      aria-label="Photo viewer"
      aria-modal="true"
      className="fixed inset-0 z-overlay flex items-center justify-center bg-black/90 p-4"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- served by the relay, not Next */}
      <img
        alt={`Photo ${index + 1} of ${count}`}
        className="max-h-full max-w-full rounded-lg object-contain"
        onClick={(event) => event.stopPropagation()}
        src={whisperMediaUrl(photo.id)}
      />
      <button
        aria-label="Close photo"
        className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        onClick={onClose}
        type="button"
      >
        <X size={18} />
      </button>
      {count > 1 ? (
        <>
          <button
            aria-label="Previous photo"
            className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            onClick={(event) => {
              event.stopPropagation();
              step(-1);
            }}
            type="button"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            aria-label="Next photo"
            className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            onClick={(event) => {
              event.stopPropagation();
              step(1);
            }}
            type="button"
          >
            <ChevronRight size={20} />
          </button>
          <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold tabular-nums text-white">
            {index + 1} / {count}
          </span>
        </>
      ) : null}
    </motion.div>
  );
}

// ── Composer ────────────────────────────────────────────────────────────────

/**
 * The files waiting to go out with the Echo being written. `preparing` is how
 * many more are still being cleaned and measured.
 */
export function AttachmentTray({
  disabled,
  items,
  onRemove,
  preparing
}: {
  disabled: boolean;
  items: readonly PreparedWhisperMedia[];
  onRemove: (localId: string) => void;
  preparing: number;
}): JSX.Element | null {
  if (items.length === 0 && preparing === 0) return null;
  return (
    <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Attachments">
      {items.map((item) => (
        <div
          className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-nada-border/10 bg-nada-surface/70"
          key={item.localId}
          role="listitem"
        >
          {item.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview
            <img alt="Attached photo" className="h-full w-full object-cover" src={item.previewUrl} />
          ) : item.kind === "video" ? (
            <>
              <video className="h-full w-full object-cover" muted playsInline preload="metadata" src={item.previewUrl} />
              <span className="absolute inset-0 grid place-items-center bg-black/25 text-white">
                <Film size={18} />
              </span>
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-nada-accent">
              <Music size={20} />
              <span className="text-[10.5px] font-semibold tabular-nums text-nada-secondary/70">
                {item.duration ? formatClock(item.duration) : "Audio"}
              </span>
            </div>
          )}
          {item.kind === "video" && item.duration ? (
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9.5px] font-bold tabular-nums text-white">
              {formatClock(item.duration)}
            </span>
          ) : null}
          <button
            aria-label="Remove attachment"
            className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80 disabled:opacity-40"
            disabled={disabled}
            onClick={() => onRemove(item.localId)}
            type="button"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      {Array.from({ length: preparing }, (_, index) => (
        <div
          aria-label="Preparing attachment"
          className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl border border-dashed border-nada-border/20 text-nada-secondary/60"
          key={`preparing-${index}`}
          role="listitem"
        >
          <Loader2 className="animate-spin" size={18} />
        </div>
      ))}
    </div>
  );
}

const RECORDING_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus"
];
/** Recordings stop on their own at this length. */
export const MAX_RECORDING_SECONDS = 5 * 60;

export function voiceRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/**
 * Records a voice clip from the microphone. `onRecorded` receives the clip as
 * a file plus its length as timed by the recorder — browser recordings often
 * report no usable length of their own.
 */
export function useVoiceRecorder(
  onRecorded: (file: File, seconds: number) => void,
  onError: (message: string) => void
): {
  cancel: () => void;
  recording: boolean;
  seconds: number;
  start: () => Promise<void>;
  stop: () => void;
} {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const discardRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const secondsRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const stop = useCallback((): void => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const cancel = useCallback((): void => {
    discardRef.current = true;
    stop();
  }, [stop]);

  const start = useCallback(async (): Promise<void> => {
    if (recorderRef.current) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("NADA needs microphone access to record.");
      return;
    }
    const mimeType = RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    discardRef.current = false;
    secondsRef.current = 0;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      setSeconds(0);
      const length = secondsRef.current;
      if (discardRef.current || chunks.length === 0 || length < 1) return;
      const type = (recorder.mimeType || mimeType || "audio/webm").split(";")[0]!;
      const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      onRecorded(new File(chunks, `Voice recording.${extension}`, { type }), length);
    };

    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setSeconds(0);
    timerRef.current = window.setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= MAX_RECORDING_SECONDS) recorder.stop();
    }, 1000);
  }, [onError, onRecorded]);

  // Leaving the feed mid-recording must release the microphone.
  useEffect(
    () => () => {
      discardRef.current = true;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    },
    []
  );

  return { cancel, recording, seconds, start, stop };
}

export function RecordingBar({
  onCancel,
  onStop,
  seconds
}: {
  onCancel: () => void;
  onStop: () => void;
  seconds: number;
}): JSX.Element {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-2xl border border-red-500/25 bg-red-500/[0.08] px-3 py-2">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
      </span>
      <span className="flex-1 text-[12.5px] font-semibold text-nada-primary">
        Recording <span className="tabular-nums text-red-300">{formatClock(seconds)}</span>
      </span>
      <button
        className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-nada-secondary transition hover:bg-white/[0.08]"
        onClick={onCancel}
        type="button"
      >
        Cancel
      </button>
      <button
        className="inline-flex items-center gap-1.5 rounded-full bg-nada-accent px-3.5 py-1.5 text-[12px] font-bold text-white transition hover:opacity-90"
        onClick={onStop}
        type="button"
      >
        <Square className="fill-white" size={10} />
        Done
      </button>
    </div>
  );
}
