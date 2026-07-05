import type { SafetyReport, ReportTarget } from "@/utils/dashboard-types";
import { IconButton, cn } from "@nada/ui";
import { Sheet, X } from "lucide-react";
import { useState } from "react";

export function SafetyReportSheet({
      onClose,
      onSubmit,
      target
    }: {
          onClose: () => void;
          onSubmit: (category: SafetyReport["category"], notes: string) => void;
          target: ReportTarget;
        }): JSX.Element {
    const [category, setCategory] = useState<SafetyReport["category"]>("spam");
    const [notes, setNotes] = useState("");
    return (
    <Sheet onClose={onClose}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase text-nada-danger/80">Safety report</p>
          <h2 className="text-lg font-semibold text-nada-primary">Report {target.type}</h2>
        </div>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      <div className="mt-5 rounded-2xl border border-red-500/15 bg-red-500/[0.07] p-4">
        <p className="text-sm font-bold text-nada-primary">{target.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-nada-secondary/65">
          Reports are stored in your local safety log so you can block, review, and escalate patterns without mixing them into DMs.
        </p>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        {([
          ["spam", "Spam"],
          ["harassment", "Harassment"],
          ["impersonation", "Impersonation"],
          ["illegal", "Illegal"],
          ["other", "Other"]
        ] as Array<[SafetyReport["category"], string]>).map(([value, label]) => (
          <button
            className={cn(
              "rounded-2xl border px-3 py-3 text-sm font-semibold transition",
              category === value
                ? "border-red-400/45 bg-red-500/12 text-red-200"
                : "border-nada-border/10 bg-nada-surface-elevated/45 text-nada-secondary/75"
            )}
            key={value}
            onClick={() => setCategory(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <label className="mt-5 block">
        <span className="mb-2 block text-xs font-semibold text-nada-secondary/70">Notes</span>
        <textarea
          className="nada-input-dark min-h-[112px] w-full resize-none px-4 py-3 text-sm"
          maxLength={360}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Add context for yourself..."
          value={notes}
        />
      </label>
      <div className="mt-5 flex gap-3">
        <button
          className="flex-1 rounded-2xl bg-nada-muted px-4 py-3 text-sm font-semibold text-nada-secondary"
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
        <button
          className="flex-1 rounded-2xl bg-red-500 px-4 py-3 text-sm font-bold text-white"
          onClick={() => onSubmit(category, notes)}
          type="button"
        >
          Save report
        </button>
      </div>
    </Sheet>
    );
}
