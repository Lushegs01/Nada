import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Building2,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

import {
  CAMPOS_ADMIN_SESSION_COOKIE,
  verifyCamposAdminSession,
} from "@/lib/campos-admin-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Institution administration",
  description: "Privacy-safe institutional administration for NADA.",
};

function camposAdminUrl(institutionSlug: string): string {
  const configured = process.env["CAMPOS_CORE_URL"]?.trim();
  if (!configured) return "/";
  try {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" &&
      !(process.env.NODE_ENV !== "production" && url.protocol === "http:")
    ) {
      return "/";
    }
    url.pathname = `/${encodeURIComponent(institutionSlug)}/admin`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "/";
  }
}

export default async function NadaAdminPage(): Promise<JSX.Element> {
  const cookieStore = await cookies();
  const session = verifyCamposAdminSession(
    cookieStore.get(CAMPOS_ADMIN_SESSION_COOKIE)?.value
  );
  if (!session) {
    redirect("/launch?sso_error=admin_session_required");
  }

  const roleLabel = session.roles
    .map((role) => role.replaceAll("_", " "))
    .join(", ");

  return (
    <main className="min-h-dvh bg-nada-bg px-4 py-5 text-nada-primary sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-nada-cyan">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              CampOS verified administration
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              NADA institutional workspace
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-nada-secondary">
              Configure and monitor the institution&apos;s NADA connection without
              revealing anonymous student activity.
            </p>
          </div>
          <a
            href={camposAdminUrl(session.institutionSlug)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-nada-primary transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Return to CampOS
          </a>
        </header>

        <section className="grid gap-4 py-6 sm:grid-cols-2 lg:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <Building2 className="h-5 w-5 text-nada-cyan" aria-hidden="true" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-nada-muted">
              Institution
            </p>
            <p className="mt-1 text-lg font-semibold">{session.institutionSlug}</p>
            <p className="mt-1 text-xs text-nada-secondary">
              Tenant ID: {session.institutionId}
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <KeyRound className="h-5 w-5 text-nada-cyan" aria-hidden="true" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-nada-muted">
              CampOS authorization
            </p>
            <p className="mt-1 text-lg font-semibold">Connected</p>
            <p className="mt-1 text-xs capitalize text-nada-secondary">{roleLabel}</p>
          </article>
          <article className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.055] p-5 sm:col-span-2 lg:col-span-1">
            <LockKeyhole className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-200/70">
              Privacy boundary
            </p>
            <p className="mt-1 text-lg font-semibold">Anonymity enforced</p>
            <p className="mt-1 text-xs leading-5 text-nada-secondary">
              This workspace cannot map Echoes, messages, or device keys back to
              CampOS student identities.
            </p>
          </article>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <Activity className="mt-0.5 h-5 w-5 shrink-0 text-nada-cyan" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-semibold">Institution operations</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-nada-secondary">
                Module subscription, access roles, and institution-wide enablement
                remain controlled by CampOS. NADA exposes no university-level
                browsing of anonymous Echoes or private conversations.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ["SSO hand-off", "Healthy"],
              ["Tenant binding", "Verified"],
              ["Anonymous identity separation", "Enforced"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-black/10 p-4">
                <p className="text-xs text-nada-secondary">{label}</p>
                <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-emerald-300">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
