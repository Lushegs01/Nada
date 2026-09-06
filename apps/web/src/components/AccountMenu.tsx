"use client";
import { IdentityOrb, cn } from "@nada/ui";
import { AnimatePresence, motion } from "framer-motion";
import { CircleUserRound, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * The avatar control in the app header.
 *
 * Profile and Settings left the primary navigators, so this is the account
 * entry point that replaces them. There is deliberately no "Sign out": a NADA
 * identity is a keypair held on this device, not a session on a server, so
 * there is nothing to sign out of and an entry saying otherwise would be a lie
 * about where the keys live.
 */
export function AccountMenu({
  displayName,
  onOpenProfile,
  onOpenSettings,
  selfSeed,
  subtitle
}: {
  displayName: string;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  selfSeed: string;
  subtitle: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on an outside click or Escape, and hand focus back to the trigger so
  // keyboard users are not dropped at the top of the document.
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const choose = (action: () => void): void => {
    setOpen(false);
    action();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account: ${displayName}`}
        className={cn(
          "grid h-11 w-11 place-items-center rounded-full transition-colors duration-150",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-n-accent",
          open ? "bg-n-s3/80" : "hover:bg-n-s2/60"
        )}
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        <IdentityOrb seed={selfSeed} size="sm" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="nada-account-menu"
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            role="menu"
            transition={{ duration: 0.14, ease: "easeOut" }}
          >
            <div className="flex items-center gap-3 border-b border-nada-border/[0.07] px-3.5 py-3">
              <IdentityOrb seed={selfSeed} size="md" />
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-bold text-nada-primary">{displayName}</p>
                <p className="truncate font-mono text-[10.5px] text-nada-text-muted">{subtitle}</p>
              </div>
            </div>

            <div className="p-1.5">
              <button
                className="nada-account-menu-item"
                onClick={() => choose(onOpenProfile)}
                role="menuitem"
                type="button"
              >
                <CircleUserRound size={16} />
                Profile
              </button>
              <button
                className="nada-account-menu-item"
                onClick={() => choose(onOpenSettings)}
                role="menuitem"
                type="button"
              >
                <SettingsIcon size={16} />
                Settings
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
