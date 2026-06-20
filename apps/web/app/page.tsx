import { Suspense } from "react";

import { NadaApp } from "@/components/NadaApp";

export default function Page(): JSX.Element {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-background" />}>
      <NadaApp />
    </Suspense>
  );
}
