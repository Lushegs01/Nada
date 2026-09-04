import { Suspense } from "react";

import { NadaApp } from "@/components/NadaApp";

/**
 * Rendered per request so the CSP nonce minted in middleware reaches the
 * inline bootstrap Next.js emits. A prerendered shell would carry no nonce and
 * every script on the page would be refused.
 *
 * The cost is only the HTML shell — this route ships no server-rendered data,
 * and the client bundle it references is still hashed and cached normally.
 */
export const dynamic = "force-dynamic";

export default function InvitePage(): JSX.Element {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-background" />}>
      <NadaApp />
    </Suspense>
  );
}
