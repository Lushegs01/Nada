"use client";
/* eslint-disable */
import { primaryIdentityId, nadaDb } from "@/lib/db";
import { generateRandomUsername } from "@/utils/helpers";
import { createSeedPhrase, createAnonymousIdentity } from "@nada/crypto";
import type { IdentityRecord } from "@nada/db";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useState, useMemo } from "react";

export function Onboarding({
      onComplete
    }: {
          onComplete: (identity: IdentityRecord) => void;
        }): JSX.Element {
    const [displayName, setDisplayName] = useState("");
    const [draft, setDraft] = useState<IdentityRecord | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [saved, setSaved] = useState(false);
    const [seedPhrase, setSeedPhrase] = useState("");
    const seedWords = useMemo(() => seedPhrase.split(" ").filter(Boolean), [seedPhrase]);
    const generateIdentity = async (): Promise<void> => {
            setIsGenerating(true);
            const phrase = createSeedPhrase();
            const anonymousIdentity = await createAnonymousIdentity(phrase);
            setSeedPhrase(phrase);
            setDraft({
              id: primaryIdentityId,
              pubkey: anonymousIdentity.pubkey,
              pubkeyHash: anonymousIdentity.pubkeyHash,
              encryptedPrivateKey: anonymousIdentity.encryptedPrivateKey,
              localPrivateKey: anonymousIdentity.privateKey,
              seedBackupStatus: "pending",
              createdAt: anonymousIdentity.createdAt
            });
            setIsGenerating(false);
          };
    const finish = async (): Promise<void> => {
            if (!draft || !saved) {
              return;
            }

            const confirmed: IdentityRecord = {
              ...draft,
              seedBackupStatus: "confirmed"
            };
            await nadaDb.identity.put(confirmed);
            await nadaDb.settings.put({
              key: "displayName",
              value: displayName.trim() || generateRandomUsername(draft.pubkeyHash),
              updatedAt: Date.now()
            });
            onComplete(confirmed);
          };
    return (
    <section className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center overflow-hidden px-6 py-12">
      {/* Aurora backdrop — NADA green */}
      <div className="pointer-events-none absolute inset-0 nada-hero-gradient" />
      <div
        className="pointer-events-none absolute -top-24 left-1/2 h-[460px] w-[460px] -translate-x-1/2 rounded-full opacity-50 blur-[110px] animate-aurora"
        style={{
          background:
            "radial-gradient(circle, rgba(124,58,237,0.55) 0%, rgba(37,99,235,0.18) 45%, transparent 72%)"
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full opacity-35 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(16,217,138,0.40) 0%, rgba(37,99,235,0.18) 45%, transparent 72%)"
        }}
      />

      <div className="relative z-10">
        {/* Brand mark */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className="mb-9 relative inline-flex"
        >
          <div className="absolute inset-0 rounded-[22px] blur-xl opacity-70 nada-logo-aura animate-logo-glow" />
          <div className="relative grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-[22px] nada-logo-aura">
            <img src="/logo.webp" alt="NADA Logo" className="h-full w-full object-cover" />
          </div>
        </motion.div>

        <p className="text-[11px] font-extrabold uppercase tracking-[0.32em] text-nada-accent/85">
          NADA
        </p>

        {!draft ? (
          <>
            <h1 className="mt-3 text-[42px] font-extrabold leading-[1.02] tracking-tight text-nada-primary text-balance">
              Message Freely.{" "}
              <span className="nada-accent-text">Stay Unknown.</span>
            </h1>
            <p className="mt-4 max-w-sm text-[15.5px] leading-relaxed text-nada-secondary/85">
              Anonymous conversations with zero pressure. End-to-end encrypted,
              no phone number, no email — your identity is a keypair on this
              device.
            </p>

            <div className="mt-10 space-y-3 animate-fade-in">
              <motion.button
                whileTap={{ scale: 0.97 }}
                whileHover={{ y: -1 }}
                className="w-full rounded-full py-4 text-[15px] nada-btn-gold disabled:opacity-50"
                disabled={isGenerating}
                onClick={() => { void generateIdentity(); }}
              >
                {isGenerating ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    Creating identity…
                  </span>
                ) : (
                  "Enter as a ghost"
                )}
              </motion.button>
              <p className="text-center text-[12px] text-nada-secondary/60">
                We generate a seed phrase you can back up and restore.
              </p>
            </div>

            {/* Trust pills row */}
            <div className="mt-10 flex flex-wrap items-center justify-start gap-2">
              <span className="nada-security-pill">End-to-end encrypted</span>
              <span className="nada-ghost-badge">No phone · No email</span>
              <span className="nada-ghost-badge">Keys stay on device</span>
            </div>
          </>
        ) : (
          <div className="mt-2 animate-fade-in">
            <h1 className="text-[34px] font-extrabold leading-[1.04] tracking-tight text-nada-primary">
              Back up your{" "}
              <span className="nada-accent-text">ghost key</span>
            </h1>
            <p className="mt-3 max-w-sm text-[14.5px] leading-relaxed text-nada-secondary/80">
              These 12 words are the only way to restore your identity. Anyone
              with this phrase can become you.
            </p>

            <div className="mt-8 space-y-5">
              {/* Step indicator */}
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-nada-secondary/60">
                <span
                  className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-extrabold"
                  style={{
                    background: "var(--n-accent-gradient)",
                    color: "#FFFFFF"
                  }}
                >
                  2
                </span>
                <span>Seed phrase</span>
              </div>

              {/* Seed phrase grid */}
              <div className="rounded-3xl p-5 nada-surface-elevated">
                <div className="grid grid-cols-3 gap-2">
                  {seedWords.map((word, index) => (
                    <div
                      className="flex items-center gap-1.5 rounded-xl border border-nada-border/[0.08] bg-nada-surface/70 px-2.5 py-2 text-[12.5px] font-medium text-nada-primary"
                      key={`${word}-${index}`}
                    >
                      <span className="w-4 text-right font-mono text-[10px] font-semibold tabular-nums text-nada-accent/70">
                        {index + 1}
                      </span>
                      <span className="truncate">{word}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11.5px] leading-relaxed text-nada-secondary/65">
                  Write these 12 words down in order, somewhere offline.
                </p>
              </div>

              <label className="flex cursor-pointer select-none items-center gap-3 rounded-2xl border border-nada-border/[0.08] bg-nada-surface/60 px-4 py-3 text-[13.5px] text-nada-primary/90 transition-colors hover:bg-nada-surface-elevated/55">
                <input
                  checked={saved}
                  className="h-4 w-4 rounded"
                  style={{ accentColor: "rgb(var(--nada-accent))" }}
                  onChange={(event) => { setSaved(event.target.checked); }}
                  type="checkbox"
                />
                I&apos;ve saved my seed phrase somewhere safe
              </label>

              <input
                className="nada-input-dark h-12 w-full text-[15px]"
                maxLength={40}
                onChange={(event) => { setDisplayName(event.target.value); }}
                placeholder="Display name (optional)"
                value={displayName}
              />
              <motion.button
                whileTap={{ scale: 0.97 }}
                whileHover={{ y: -1 }}
                className="w-full rounded-full py-4 text-[15px] nada-btn-gold disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!saved}
                onClick={() => void finish()}
              >
                Enter NADA
              </motion.button>
            </div>
          </div>
        )}
      </div>
    </section>
    );
}
