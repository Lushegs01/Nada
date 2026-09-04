import type { Metadata } from "next";

import { ContestPublicView } from "@/components/contest/ContestPublicView";

// Rendered per request: the response carries a per-request CSP nonce, and a
// prerendered shell would be served with a nonce that no longer matches.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NADA Engagement Contest",
  description:
    "Engage on NADA, earn points for engagement people respond to, and climb the leaderboard."
};

export default async function ContestPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const params = await searchParams;
  const raw = params["c"];
  const slug = typeof raw === "string" ? raw : undefined;
  return <ContestPublicView {...(slug ? { slug } : {})} />;
}
