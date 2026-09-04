import type { Metadata } from "next";

import { ContestAdminConsole } from "@/components/contest/ContestAdminConsole";

// Rendered per request so the response carries a live CSP nonce.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contest administration",
  description: "Operate NADA engagement contests: review, finalize, approve, record."
};

export default function ContestAdminPage(): JSX.Element {
  return <ContestAdminConsole />;
}
