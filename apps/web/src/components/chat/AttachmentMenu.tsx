import { type PreparedMediaFile, formatBytes } from "@/lib/media-upload";
import { cn } from "@nada/ui";
import {
  Camera,
  FileText,
  Video,
  Music,
  Flame,
  Loader2,
  Upload,
  Image as ImageIcon,
  type LucideIcon
} from "lucide-react";

export function AttachmentMenu({
      onPickAudio,
      onPickCamera,
      onPickDocument,
      onPickImage,
      onPickVideo,
      onPickPoll
    }: {
          onPickAudio: () => void;
          onPickCamera: () => void;
          onPickDocument: () => void;
          onPickImage: () => void;
          onPickVideo: () => void;
          onPickPoll?: () => void;
        }): JSX.Element {
    const options: Array<{
        action?: () => void;
        comingSoon?: boolean;
        icon: LucideIcon;
        label: string;
        }> = [
            { label: "Photo", icon: ImageIcon, action: onPickImage },
            { label: "Camera", icon: Camera, action: onPickCamera },
            { label: "Document", icon: FileText, action: onPickDocument },
            { label: "Video", icon: Video, action: onPickVideo },
            { label: "Audio", icon: Music, action: onPickAudio },
            { label: "Burn-after-view photo", icon: Flame, comingSoon: true },
            ...(onPickPoll ? [{ label: "Poll", icon: FileText, action: onPickPoll }] : [])
          ];
    return (
    <div
      className="nada-floating-menu absolute bottom-16 left-3 z-40 grid w-[260px] gap-1 rounded-[22px] p-2 animate-scale-in"
    >
      {options.map((option) => (
        <button
          className={cn(
            "flex items-center gap-3 rounded-2xl px-2.5 py-2 text-left text-[13.5px] font-semibold text-nada-primary transition-colors hover:bg-nada-accent/12",
            option.comingSoon && "cursor-not-allowed opacity-55 hover:bg-transparent"
          )}
          disabled={option.comingSoon}
          key={option.label}
          onClick={option.action}
          type="button"
        >
          <span className={cn(
            "grid h-9 w-9 place-items-center rounded-xl ring-1",
            option.comingSoon
              ? "bg-nada-danger/10 text-nada-danger ring-nada-danger/10"
              : "bg-nada-accent/14 text-nada-accent ring-nada-accent/10"
          )}>
            <option.icon size={17} strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">{option.label}</span>
          {option.comingSoon ? (
            <span className="rounded-full bg-nada-surface/70 px-2 py-0.5 text-[10px] text-nada-text-muted">
              Soon
            </span>
          ) : null}
        </button>
      ))}
    </div>
    );
}

export function AttachmentPreview({
      draft,
      error,
      isSending,
      onCancel,
      onSend
    }: {
          draft: PreparedMediaFile;
          error: string | null;
          isSending: boolean;
          onCancel: () => void;
          onSend: () => void;
        }): JSX.Element {
    const name = draft.originalFile.name;
    return (
    <div
      className="mb-2 rounded-2xl border border-nada-border/24 p-3"
      style={{
        background: "linear-gradient(155deg, rgb(var(--nada-surface-elevated) / 0.85), rgb(var(--nada-surface) / 0.85))",
        backdropFilter: "blur(16px)",
        boxShadow: "inset 0 1px 0 rgb(var(--nada-border) / 0.08), 0 4px 16px rgba(0,0,0,0.30)"
      }}
    >
      <div className="flex gap-3">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-nada-border/22 bg-nada-bg/50">
          {draft.kind === "image" && draft.previewUrl ? (
            <img alt="" className="h-full w-full object-cover" src={draft.previewUrl} />
          ) : draft.kind === "video" && draft.previewUrl ? (
            <video className="h-full w-full object-cover" muted src={draft.previewUrl} />
          ) : draft.kind === "audio" ? (
            <Music className="text-nada-accent" size={24} />
          ) : (
            <FileText className="text-nada-accent" size={24} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-nada-primary">{name}</p>
          <p className="mt-1 text-[11.5px] text-nada-secondary/70">
            {draft.file.type || "application/octet-stream"} · {formatBytes(draft.originalFile.size)}
          </p>
          {draft.width && draft.height ? (
            <p className="mt-1 text-[11.5px] text-nada-secondary/70">
              {draft.width} × {draft.height}
            </p>
          ) : null}
          {error ? <p className="mt-2 text-[11.5px] text-nada-danger">{error}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          className="rounded-xl px-3.5 py-2 text-[12.5px] font-semibold text-nada-secondary transition-colors hover:bg-nada-surface-elevated/50 hover:text-nada-primary"
          disabled={isSending}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="nada-btn-gold inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white transition active:scale-95 disabled:opacity-60"
          disabled={isSending}
          onClick={onSend}
          type="button"
        >
          {isSending ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
          {isSending ? "Sending" : "Send"}
        </button>
      </div>
    </div>
    );
}
