"use client";
/* eslint-disable */
import { IconButton, cn } from "@nada/ui";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";

export function Sheet({
      children,
      onClose
    }: {
          children: ReactNode;
          onClose: () => void;
        }): JSX.Element {
    useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);
    return (
    <motion.div
      animate={{ opacity: 1 }}
      className="nada-overlay fixed inset-0 z-overlay overflow-hidden p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pr-[calc(env(safe-area-inset-right)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pl-[calc(env(safe-area-inset-left)+0.75rem)] md:p-3"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        animate={{ y: 0, opacity: 1 }}
        className="nada-sheet mx-auto flex h-full w-full max-w-none flex-col overflow-y-auto rounded-2xl p-4 sm:max-w-md sm:p-5 md:ml-auto"
        exit={{ y: 32, opacity: 0 }}
        initial={{ y: 32, opacity: 0 }}
        onClick={(event) => {
          event.stopPropagation();
        }}
        transition={{ type: "spring", damping: 22, stiffness: 420 }}
      >
        {children}
      </motion.div>
    </motion.div>
    );
}

export function LaunchOnboardingSheet({
      contactsCount,
      groupsCount,
      hasPostedStatus,
      onClose,
      onEnableNotifications,
      onOpenCommunity
    }: {
          contactsCount: number;
          groupsCount: number;
          hasPostedStatus: boolean;
          onClose: () => void;
          onEnableNotifications: () => void;
          onOpenCommunity: () => void;
        }): JSX.Element {
    const steps = [
            { done: contactsCount > 0, label: "Add an anonymous contact", meta: "Start a direct encrypted lane." },
            { done: groupsCount > 0, label: "Create a private group", meta: "Invite-only rooms for trusted people." },
            { done: hasPostedStatus, label: "Post a status", meta: "Share a vanishing thought." },
            { done: false, label: "Enable notifications", meta: "Never miss calls or launch messages." }
          ];
    return (
    <motion.div
      animate={{ opacity: 1 }}
      className="nada-overlay fixed inset-0 z-overlay grid place-items-end p-3 sm:place-items-center"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        animate={{ y: 0, opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-3xl border border-nada-border/12 bg-nada-surface p-5 shadow-2xl"
        exit={{ y: 24, opacity: 0, scale: 0.98 }}
        initial={{ y: 24, opacity: 0, scale: 0.98 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-nada-accent">Launch setup</p>
            <h2 className="mt-1 text-xl font-bold text-nada-primary">Make NADA feel alive.</h2>
            <p className="mt-2 text-sm leading-relaxed text-nada-text-muted">
              A short setup pass for the anonymous flows people expect on day one.
            </p>
          </div>
          <IconButton label="Close onboarding" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="mt-5 grid gap-2">
          {steps.map((step) => (
            <div className="nada-settings-card flex items-center gap-3" key={step.label}>
              <span
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-2xl font-mono text-[10px] font-bold",
                  step.done ? "bg-n-success/14 text-n-success" : "bg-nada-accent/12 text-nada-accent"
                )}
              >
                {step.done ? "OK" : "GO"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-nada-primary">{step.label}</span>
                <span className="block text-xs text-nada-text-muted">{step.meta}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="rounded-2xl bg-nada-muted px-4 py-3 text-sm font-semibold text-nada-secondary"
            onClick={onClose}
            type="button"
          >
            Done
          </button>
          <button
            className="rounded-2xl bg-nada-accent px-4 py-3 text-sm font-bold text-white shadow-accent-glow"
            onClick={onEnableNotifications}
            type="button"
          >
            Enable alerts
          </button>
        </div>
        <button
          className="mt-3 w-full rounded-2xl border border-nada-accent/20 bg-nada-accent/[0.08] px-4 py-3 text-sm font-bold text-nada-accent transition-colors hover:bg-nada-accent/[0.14]"
          onClick={onOpenCommunity}
          type="button"
        >
          Explore communities
        </button>
      </motion.div>
    </motion.div>
    );
}
