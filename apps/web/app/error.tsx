"use client";

import { Button } from "@nada/ui";
import { ShieldAlert } from "lucide-react";

export default function Error({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  // Two recoveries, weakest first. `reset` re-renders the failed subtree and
  // keeps the user where they were; the hard reload drops the service worker
  // and caches, which fixes a stale bundle but costs the whole session.
  return (
    <main className="grid min-h-dvh place-items-center bg-nada-bg px-5">
      <section className="nada-surface-elevated max-w-sm rounded-2xl p-8 text-center animate-scale-in">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-nada-danger/10 text-nada-danger">
          <ShieldAlert size={28} />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-nada-primary">
          Something went quiet
        </h1>
        <p className="mt-2 text-sm text-nada-secondary leading-relaxed">
          Your local data is still safe. This is a temporary issue — try
          reloading the view.
        </p>
        <Button className="mt-6 w-full" onClick={reset}>
          Try again
        </Button>
        <button
          className="mt-3 w-full text-xs text-nada-secondary underline underline-offset-4 transition hover:text-nada-primary"
          onClick={() => {
            if ("serviceWorker" in navigator) {
              void navigator.serviceWorker
                .getRegistrations()
                .then((regs) => regs.forEach((r) => void r.unregister()));
            }
            if ("caches" in window) {
              void caches.keys().then((names) => names.forEach((n) => void caches.delete(n)));
            }
            window.location.reload();
          }}
        >
          Still stuck? Clear the cached app and reload
        </button>
      </section>
    </main>
  );
}
