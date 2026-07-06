"use client";
import type { PendingChatAction } from "@/utils/dashboard-types";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Archive } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { cn } from "@nada/ui";

/** Generic confirmation dialog matching ConfirmChatActionDialog's visual
 *  language — used for destructive actions outside the chat list (deleting
 *  Echoes and reflections in the Whispers feed). */
export function ConfirmActionDialog({
      confirmLabel,
      copy,
      danger = true,
      onCancel,
      onConfirm,
      subtitle,
      title
    }: {
          confirmLabel: string;
          copy: string;
          danger?: boolean;
          onCancel: () => void;
          onConfirm: () => void;
          subtitle?: string;
          title: string;
        }): JSX.Element {
    useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
    }, [onCancel]);
    return (
    <motion.div
      animate={{ opacity: 1 }}
      className="nada-overlay fixed inset-0 z-overlay grid place-items-center p-4"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div
        animate={{ y: 0, opacity: 1, scale: 1 }}
        className="w-full max-w-sm rounded-3xl border border-nada-border/10 bg-nada-surface p-5 shadow-2xl"
        exit={{ y: 16, opacity: 0, scale: 0.98 }}
        initial={{ y: 16, opacity: 0, scale: 0.98 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div
            className={cn(
              "grid h-11 w-11 place-items-center rounded-2xl",
              danger ? "bg-red-500/12 text-red-300" : "bg-nada-accent/12 text-nada-accent"
            )}
          >
            <Trash2 size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-nada-primary">{title}</h3>
            {subtitle ? (
              <p className="truncate text-xs text-nada-secondary/55">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-nada-secondary/75">{copy}</p>
        <div className="flex gap-3">
          <button
            className="flex-1 rounded-2xl bg-nada-muted px-4 py-3 text-sm font-semibold text-nada-secondary"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            autoFocus
            className={cn(
              "flex-1 rounded-2xl px-4 py-3 text-sm font-bold",
              danger ? "bg-red-500 text-white" : "bg-nada-accent text-black"
            )}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
    );
}

export function ConfirmChatActionDialog({
      action,
      chatTitle,
      onCancel,
      onConfirm
    }: {
          action: PendingChatAction["action"];
          chatTitle: string;
          onCancel: () => void;
          onConfirm: () => void;
        }): JSX.Element {
    const isDelete = action === "delete" || action === "delete-group";
    const copy = action === "archive"
              ? "Archive this chat? It will move out of your main chat list."
              : action === "unarchive"
                ? "Unarchive this chat? It will return to your main chat list."
                : action === "delete-group"
                  ? "Delete this group? Only the creator can do this. Members will receive a delete notice when they sync."
                  : "Delete this chat locally? Messages in this conversation will be removed from this device.";
    const confirmLabel = action === "archive"
              ? "Archive"
              : action === "unarchive"
                ? "Unarchive"
                : action === "delete-group"
                  ? "Delete group"
                  : "Delete";
    const title = action === "delete-group" ? "Delete group" : `${confirmLabel} chat`;
    return (
    <motion.div
      animate={{ opacity: 1 }}
      className="nada-overlay fixed inset-0 z-overlay grid place-items-center p-4"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        animate={{ y: 0, opacity: 1, scale: 1 }}
        className="w-full max-w-sm rounded-3xl border border-nada-border/10 bg-nada-surface p-5 shadow-2xl"
        exit={{ y: 16, opacity: 0, scale: 0.98 }}
        initial={{ y: 16, opacity: 0, scale: 0.98 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div
            className={cn(
              "grid h-11 w-11 place-items-center rounded-2xl",
              isDelete ? "bg-red-500/12 text-red-300" : "bg-nada-accent/12 text-nada-accent"
            )}
          >
            {isDelete ? <Trash2 size={20} /> : <Archive size={20} />}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-nada-primary">
              {title}
            </h3>
            <p className="truncate text-xs text-nada-secondary/55">{chatTitle}</p>
          </div>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-nada-secondary/75">
          {copy}
        </p>
        <div className="flex gap-3">
          <button
            className="flex-1 rounded-2xl bg-nada-muted px-4 py-3 text-sm font-semibold text-nada-secondary"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className={cn(
              "flex-1 rounded-2xl px-4 py-3 text-sm font-bold",
              isDelete ? "bg-red-500 text-white" : "bg-nada-accent text-black"
            )}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
    );
}

export function MessageContextAction({
      active = false,
      danger = false,
      icon,
      label,
      onClick
    }: {
          active?: boolean;
          danger?: boolean;
          icon: ReactNode;
          label: string;
          onClick: () => void;
        }): JSX.Element {
    return (
    <button
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[13px] font-semibold transition",
        danger
          ? "text-nada-danger hover:bg-red-500/10"
          : active
            ? "bg-nada-accent/[0.12] text-nada-accent"
            : "text-nada-primary/85 hover:bg-white/[0.08] hover:text-white"
      )}
      onClick={onClick}
      type="button"
    >
      <span className={cn(
        "grid h-7 w-7 place-items-center rounded-lg",
        danger ? "bg-red-500/10" : "bg-white/[0.07]"
      )}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
    );
}
