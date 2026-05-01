"use client";

import { Button } from "@nada/ui";
import { ShieldAlert } from "lucide-react";

export default function Error({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
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
      </section>
    </main>
  );
}
