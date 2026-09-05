"use client";

import { createAnonymousIdentity, isValidSeedPhrase } from "@nada/crypto";
import { cn } from "@nada/ui";
import { AlertTriangle, KeyRound, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { nadaDb } from "@/lib/db";
import {
  deleteLocalDatabase,
  formatDiagnostics,
  openLocalDatabase,
  rescueIdentityRecord,
  resetOpenAttempt,
  restoreIdentityRecord,
  type DatabaseFailureReason
} from "@/lib/local-database";

/**
 * What a user sees when their local data will not open.
 *
 * The order of operations here is the whole point. A retry costs nothing and
 * fixes the common causes (a second tab, a transient lock), so it comes first
 * and is offered alone. Only once a retry has actually failed does anything
 * destructive appear, and even then the first thing it does is lift the
 * identity out of the old database so a repair costs message history rather
 * than the account itself.
 *
 * Nothing on this screen deletes anything without an explicit, specific
 * confirmation. There is no automatic wipe anywhere in this flow.
 */

type Stage = "failed" | "retrying" | "confirm-repair" | "repairing" | "repaired";

const GUIDANCE: Record<DatabaseFailureReason, string> = {
  blocked:
    "NADA is open in another tab or window on this device. Close it, then try again — this usually clears immediately.",
  "upgrade-failed":
    "Your saved data is from an older version of NADA and could not be upgraded automatically.",
  "version-mismatch":
    "This device holds data written by a newer version of NADA. Reloading the page usually picks the newer version back up.",
  "storage-unavailable":
    "This browser did not give NADA access to local storage. Private browsing windows and some privacy settings block it.",
  "quota-exceeded":
    "This device has run out of storage. Freeing some space, then trying again, should be enough.",
  timeout:
    "Opening your saved data took too long. That is usually another tab holding it open, or a device under heavy load.",
  unknown: "Something went wrong opening your saved data on this device."
};

export function LocalDataRecovery({
  reason,
  message,
  onRecovered
}: {
  reason: DatabaseFailureReason;
  message: string;
  onRecovered: () => void;
}): JSX.Element {
  const [stage, setStage] = useState<Stage>("failed");
  const [attempts, setAttempts] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [identityRescued, setIdentityRescued] = useState<boolean | null>(null);
  const [seedPhrase, setSeedPhrase] = useState("");
  const [seedError, setSeedError] = useState<string | null>(null);

  const retry = async (): Promise<void> => {
    setStage("retrying");
    setNote(null);
    resetOpenAttempt();
    const result = await openLocalDatabase();
    setAttempts((count) => count + 1);
    if (result.ok) {
      onRecovered();
      return;
    }
    setNote(result.message);
    setStage("failed");
  };

  const beginRepair = async (): Promise<void> => {
    // Find out what a repair would actually cost this user *before* asking
    // them to agree to it.
    setStage("confirm-repair");
    setIdentityRescued(null);
    const rescued = await rescueIdentityRecord();
    setIdentityRescued(rescued !== null);
  };

  const runRepair = async (): Promise<void> => {
    setStage("repairing");
    setSeedError(null);

    const rescued = await rescueIdentityRecord();
    const deleted = await deleteLocalDatabase();
    if (!deleted) {
      setNote(
        "Your saved data could not be removed — another tab may still have it open. Close every other NADA tab and try again."
      );
      setStage("failed");
      return;
    }

    resetOpenAttempt();
    const reopened = await openLocalDatabase();
    if (!reopened.ok) {
      setNote(reopened.message);
      setStage("failed");
      return;
    }

    if (rescued) {
      await restoreIdentityRecord(rescued);
      onRecovered();
      return;
    }

    // Nothing to restore: the user needs their seed phrase to get the same
    // identity back, so ask for it rather than silently handing them a new one.
    setStage("repaired");
  };

  const restoreFromSeed = async (): Promise<void> => {
    const phrase = seedPhrase.trim().toLowerCase();
    if (!isValidSeedPhrase(phrase)) {
      setSeedError("That is not a valid 12-word NADA seed phrase.");
      return;
    }
    setSeedError(null);
    try {
      const identity = await createAnonymousIdentity(phrase);
      await nadaDb.identity.put({
        id: "primary",
        pubkey: identity.pubkey,
        pubkeyHash: identity.pubkeyHash,
        encryptedPrivateKey: identity.encryptedPrivateKey,
        localPrivateKey: identity.privateKey,
        seedBackupStatus: "confirmed",
        createdAt: identity.createdAt
      });
      setSeedPhrase("");
      onRecovered();
    } catch {
      setSeedError("That phrase could not be used to restore an identity.");
    }
  };

  const busy = stage === "retrying" || stage === "repairing";

  return (
    <main className="grid min-h-dvh place-items-center bg-nada-bg px-5 py-10 text-nada-primary">
      <div className="w-full max-w-lg">
        <div className="nada-premium-card p-6 sm:p-7">
          <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-nada-warning/12 text-nada-warning">
            <ShieldAlert size={22} aria-hidden="true" />
          </div>

          <h1 className="text-[20px] font-bold tracking-tight">
            NADA couldn&apos;t open your local data.
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-nada-text-muted">
            {note ?? message}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-nada-text-faint">
            {GUIDANCE[reason]}
          </p>

          {stage === "repaired" ? (
            <SeedRestore
              error={seedError}
              onChange={setSeedPhrase}
              onSubmit={() => void restoreFromSeed()}
              onSkip={onRecovered}
              value={seedPhrase}
            />
          ) : stage === "confirm-repair" ? (
            <RepairConfirmation
              identityRescued={identityRescued}
              onCancel={() => setStage("failed")}
              onConfirm={() => void runRepair()}
            />
          ) : (
            <div className="mt-6 grid gap-2.5">
              <button
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[14px] font-bold text-white shadow-accent transition disabled:opacity-60"
                disabled={busy}
                onClick={() => void retry()}
                style={{ background: "var(--n-accent-gradient)" }}
                type="button"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw size={16} aria-hidden="true" />
                )}
                Try again
              </button>

              {/* Destructive options stay hidden until a retry has genuinely
                  failed — most of these failures clear on the first retry. */}
              {attempts > 0 ? (
                <button
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-nada-danger/25 bg-nada-danger/[0.07] px-5 text-[14px] font-bold text-nada-danger transition hover:bg-nada-danger/[0.12] disabled:opacity-60"
                  disabled={busy}
                  onClick={() => void beginRepair()}
                  type="button"
                >
                  <AlertTriangle size={16} aria-hidden="true" />
                  Repair local storage
                </button>
              ) : null}
            </div>
          )}

          <button
            className="mt-5 text-[12.5px] font-semibold text-nada-text-faint underline underline-offset-2"
            onClick={() => setShowDetails((shown) => !shown)}
            type="button"
          >
            {showDetails ? "Hide technical details" : "Show technical details"}
          </button>
          {showDetails ? (
            // Structural only — store names, counts, versions and error names.
            // Never a key, a seed phrase or message content.
            <pre className="mt-3 max-h-52 overflow-auto rounded-xl border border-nada-border/10 bg-black/20 p-3 font-mono text-[11px] leading-relaxed text-nada-text-muted">
              {formatDiagnostics() || "No diagnostics recorded."}
            </pre>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function RepairConfirmation({
  identityRescued,
  onCancel,
  onConfirm
}: {
  identityRescued: boolean | null;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  return (
    <div className="mt-6 rounded-2xl border border-nada-danger/25 bg-nada-danger/[0.06] p-4">
      <h2 className="flex items-center gap-2 text-[14px] font-bold text-nada-danger">
        <AlertTriangle size={16} aria-hidden="true" />
        This permanently deletes data on this device
      </h2>

      {identityRescued === null ? (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-nada-text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Checking what can be saved…
        </p>
      ) : (
        <>
          <p className="mt-3 text-[13px] leading-relaxed text-nada-text-muted">
            {identityRescued
              ? "Your identity can be recovered and will be kept, so you will not lose your account or need your seed phrase."
              : "Your identity could not be read from the damaged data. You will need your 12-word seed phrase to get the same account back — without it, this creates a new identity."}
          </p>
          <ul className="mt-3 grid gap-1 text-[12.5px] leading-relaxed text-nada-text-muted">
            <li>
              <strong className="text-nada-primary">Deleted:</strong> message history,
              contacts, chats, group keys and settings on this device.
            </li>
            <li>
              <strong className="text-nada-primary">Deleted:</strong> the prekeys that let
              others&apos; already-sent messages be decrypted here. Messages queued for
              you before now will not be readable.
            </li>
            <li>
              <strong className="text-nada-primary">Not affected:</strong> anything on your
              other devices, and anything other people hold.
            </li>
          </ul>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="inline-flex h-11 items-center justify-center rounded-xl bg-nada-danger/15 px-4 text-[13px] font-bold text-nada-danger transition hover:bg-nada-danger/25 disabled:opacity-50"
          disabled={identityRescued === null}
          onClick={onConfirm}
          type="button"
        >
          Delete and rebuild
        </button>
        <button
          className="inline-flex h-11 items-center justify-center rounded-xl bg-nada-surface-3/60 px-4 text-[13px] font-semibold text-nada-text-muted"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function SeedRestore({
  error,
  onChange,
  onSkip,
  onSubmit,
  value
}: {
  error: string | null;
  onChange: (value: string) => void;
  onSkip: () => void;
  onSubmit: () => void;
  value: string;
}): JSX.Element {
  return (
    <div className="mt-6 rounded-2xl border border-nada-border/12 bg-nada-surface-elevated/40 p-4">
      <h2 className="flex items-center gap-2 text-[14px] font-bold">
        <KeyRound size={16} className="text-nada-accent" aria-hidden="true" />
        Restore your identity
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-nada-text-muted">
        Local storage has been rebuilt. Enter your 12-word seed phrase to get your
        original identity back, or continue to start fresh with a new one.
      </p>
      <textarea
        aria-label="Seed phrase"
        autoComplete="off"
        className={cn(
          "mt-3 h-24 w-full resize-none rounded-xl border bg-black/20 p-3 font-mono text-[13px] text-nada-primary",
          error ? "border-nada-danger/40" : "border-nada-border/15"
        )}
        onChange={(event) => onChange(event.target.value)}
        placeholder="twelve words, separated by spaces"
        spellCheck={false}
        value={value}
      />
      {error ? (
        <p className="mt-2 text-[12.5px] text-nada-danger">{error}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-[13px] font-bold text-white disabled:opacity-50"
          disabled={value.trim().length === 0}
          onClick={onSubmit}
          style={{ background: "var(--n-accent-gradient)" }}
          type="button"
        >
          Restore identity
        </button>
        <button
          className="inline-flex h-11 items-center justify-center rounded-xl bg-nada-surface-3/60 px-4 text-[13px] font-semibold text-nada-text-muted"
          onClick={onSkip}
          type="button"
        >
          Start fresh
        </button>
      </div>
    </div>
  );
}
