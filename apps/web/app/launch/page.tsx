import Link from "next/link";

type Tier = {
  name: string;
  price: string;
  description: string;
  features: readonly string[];
  highlight?: boolean;
};

const TIERS: readonly Tier[] = [
  {
    name: "Free",
    price: "$0",
    description: "Messaging, basic calls, standard themes",
    features: ["E2E encrypted DMs", "Voice & video calls", "Group chats up to 16"]
  },
  {
    name: "Pro",
    price: "$5",
    description: "Larger files, backups, advanced themes",
    features: ["2GB file uploads", "Encrypted cloud backup", "Custom wallpapers"],
    highlight: true
  },
  {
    name: "Business",
    price: "$15",
    description: "Verified profile, catalog, bot API",
    features: ["Verified badge", "Product catalog", "Webhook & bot API"]
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "Self-hosted relay, SLA, controls",
    features: ["Self-hosted relay", "99.99% uptime SLA", "Admin & compliance"]
  }
];

const FEATURES = [
  {
    title: "No phone, no email",
    body: "Identity is a keypair generated on this device. Nothing to upload, nothing to leak."
  },
  {
    title: "Invite-only contacts",
    body: "Add people through a link or QR. No contact-book sync. No ghost accounts."
  },
  {
    title: "End-to-end encrypted",
    body: "Messages, files, calls and groups are encrypted client-side before relay handoff."
  },
  {
    title: "Disposable by design",
    body: "Vanish mode, disappearing timers, and a privacy shield blur for shoulder-surfing."
  }
] as const;

type LaunchPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const SSO_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  missing_code: "The CampOS launch link is incomplete or has expired.",
  exchange_failed: "NADA could not securely confirm this launch with CampOS.",
  unconfigured: "NADA's CampOS connection is not configured yet.",
  malformed: "CampOS returned an invalid launch response.",
  bad_algorithm: "CampOS returned an invalid launch response.",
  bad_signature: "NADA could not verify the CampOS launch signature.",
  bad_issuer: "NADA could not verify the CampOS launch issuer.",
  bad_audience: "This CampOS launch was intended for another module.",
  expired: "The CampOS launch link expired before it could be verified.",
  invalid_claims: "CampOS returned incomplete launch information.",
  forbidden_role: "This CampOS account does not have student access to NADA."
};

export default async function LaunchPage({
  searchParams
}: LaunchPageProps): Promise<JSX.Element> {
  const params = searchParams ? await searchParams : {};
  const rawSsoError = params["sso_error"];
  const ssoError = Array.isArray(rawSsoError) ? rawSsoError[0] : rawSsoError;
  const ssoErrorMessage = ssoError
    ? (SSO_ERROR_MESSAGES[ssoError] ?? "NADA could not verify this CampOS launch.")
    : null;

  return (
    <main className="relative min-h-dvh overflow-hidden text-nada-primary">
      {/* Aurora backdrop */}
      <div className="pointer-events-none absolute inset-0 nada-hero-gradient" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[640px] w-[640px] -translate-x-1/2 rounded-full opacity-50 blur-[120px]"
        style={{ background: "radial-gradient(circle, rgba(30,215,130,0.50) 0%, transparent 70%)" }}
      />

      {/* Top bar */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 md:px-10">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-[12px] nada-logo-aura">
            <img src="/logo.webp" alt="NADA" className="h-full w-full object-cover" />
          </div>
          <span className="text-[15px] font-bold tracking-tight">NADA</span>
        </div>
        <nav className="hidden items-center gap-7 text-sm text-nada-secondary md:flex">
          <a href="#features" className="transition-colors hover:text-nada-primary">Features</a>
          <a href="#pricing" className="transition-colors hover:text-nada-primary">Pricing</a>
          <a href="#privacy" className="transition-colors hover:text-nada-primary">Privacy</a>
        </nav>
        <Link
          href="/"
          className="nada-btn-gold inline-flex h-10 items-center justify-center rounded-xl px-5 text-[13px] font-semibold text-white"
        >
          Open app
        </Link>
      </header>

      {ssoErrorMessage ? (
        <div
          role="alert"
          className="relative z-10 mx-auto mt-2 w-[calc(100%-3rem)] max-w-6xl rounded-2xl border border-red-400/30 bg-red-950/45 px-5 py-4 text-sm text-red-100 backdrop-blur md:w-[calc(100%-5rem)]"
        >
          <p className="font-semibold">CampOS launch unsuccessful</p>
          <p className="mt-1 text-red-100/80">
            {ssoErrorMessage} Return to CampOS and choose Open NADA again.
          </p>
        </div>
      ) : null}

      {/* Hero */}
      <section className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-12 md:grid-cols-[1fr_1.05fr] md:px-10 md:py-20">
        <div className="flex flex-col">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-nada-border/30 bg-nada-surface-elevated/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-nada-secondary backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-nada-success animate-pulse" />
            Phase 3 — Live
          </span>

          <h1 className="mt-6 text-balance text-[44px] font-bold leading-[1.05] tracking-tight md:text-[56px]">
            Anonymous messaging,{" "}
            <span className="nada-accent-text">built for trust.</span>
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-[16px] leading-relaxed text-nada-secondary md:text-[17px]">
            No phone number. No email. No contact upload. NADA is end-to-end encrypted
            messaging where your identity stays a keypair on your device.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="nada-btn-gold inline-flex h-12 items-center justify-center rounded-2xl px-7 text-[14px] font-semibold text-white"
            >
              Open NADA
            </Link>
            <Link
              href="#privacy"
              className="btn-secondary inline-flex h-12 items-center justify-center rounded-2xl px-7 text-[14px] font-semibold"
            >
              How privacy works
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3 text-[12px] text-nada-secondary">
            <Stat label="Encryption" value="E2E libsodium" />
            <Stat label="Identity" value="Local keypair" />
            <Stat label="Storage" value="IndexedDB" />
          </div>
        </div>

        {/* Phone-style mockup */}
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 -z-10 mx-auto h-[420px] max-w-[440px] rounded-[44px] opacity-60 blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(30,215,130,0.45) 0%, transparent 70%)" }}
          />
          <div className="relative w-full max-w-[440px] rounded-[36px] border border-nada-border/30 p-2 shadow-2xl"
            style={{
              background: "linear-gradient(155deg, rgb(var(--nada-surface-elevated)) 0%, rgb(var(--nada-surface)) 100%)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.55), 0 12px 32px rgba(17,167,101,0.22), inset 0 1px 0 rgb(var(--nada-border) / 0.10)"
            }}
          >
            <div className="rounded-[28px] overflow-hidden border border-nada-border/20"
              style={{ background: "rgb(var(--nada-bg))" }}
            >
              {/* Mock chat header */}
              <div className="flex items-center gap-3 border-b border-nada-border/[0.06] px-4 py-3.5"
                style={{ background: "rgba(8,9,11,0.62)", backdropFilter: "blur(12px)" }}
              >
                <div className="grid h-10 w-10 place-items-center rounded-[14px] text-[14px] font-bold text-white nada-logo-aura">
                  N
                </div>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold tracking-tight">launch room</p>
                  <p className="text-[11px] text-nada-secondary/70">6 anonymous keys</p>
                </div>
                <div className="h-2 w-2 rounded-full bg-nada-success" />
              </div>

              {/* Mock messages */}
              <div className="flex flex-col gap-3 px-4 py-5">
                <div className="max-w-[78%] self-start rounded-[18px] rounded-bl-[6px] border border-nada-border/20 px-4 py-2.5 text-[13px]"
                  style={{ background: "rgb(var(--nada-surface-elevated) / 0.85)" }}
                >
                  Invite links only. No phone sync.
                </div>
                <div className="max-w-[78%] self-end rounded-[18px] rounded-br-[6px] px-4 py-2.5 text-[13px] text-white nada-bubble-sent">
                  Groups & files stay encrypted before relay handoff.
                </div>
                <div className="max-w-[78%] self-start rounded-[18px] rounded-bl-[6px] border border-nada-border/20 px-4 py-2.5 text-[13px]"
                  style={{ background: "rgb(var(--nada-surface-elevated) / 0.85)" }}
                >
                  IP anonymity still needs Tor, VPN, or future mixnet routing.
                </div>
                <div className="self-start flex items-center gap-1 rounded-[14px] rounded-bl-[6px] border border-nada-border/20 px-3 py-2"
                  style={{ background: "rgb(var(--nada-surface-elevated) / 0.85)" }}
                >
                  <span className="nada-typing-dot" />
                  <span className="nada-typing-dot" />
                  <span className="nada-typing-dot" />
                </div>
              </div>

              {/* Mock composer */}
              <div className="flex items-center gap-2 border-t border-nada-border/[0.06] px-3 py-3"
                style={{ background: "rgba(8,9,11,0.62)", backdropFilter: "blur(12px)" }}
              >
                <div className="flex-1 rounded-full border border-nada-border/30 px-4 py-2.5 text-[12px] text-nada-secondary/70"
                  style={{ background: "rgb(var(--nada-input-bg) / 0.7)" }}
                >
                  Type a message…
                </div>
                <div className="grid h-9 w-9 place-items-center rounded-full text-white nada-logo-aura">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 border-t border-nada-border/20 px-6 py-16 md:px-10 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 max-w-2xl">
            <p className="nada-section-label">Privacy primitives</p>
            <h2 className="mt-3 text-[32px] font-bold leading-tight tracking-tight md:text-[40px]">
              Anonymity isn&apos;t an add-on.
            </h2>
            <p className="mt-3 text-[16px] text-nada-secondary md:text-[17px]">
              NADA was built on four ideas. Skip any one and you&apos;re just another messaging app.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature, idx) => (
              <div
                key={feature.title}
                className="group relative overflow-hidden rounded-2xl border border-nada-border/22 p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-nada-accent/30"
                style={{
                  background: "linear-gradient(155deg, rgb(var(--nada-surface-elevated) / 0.85) 0%, rgb(var(--nada-surface) / 0.85) 100%)",
                  backdropFilter: "blur(20px)",
                  boxShadow: "inset 0 1px 0 rgb(var(--nada-border) / 0.08), 0 4px 24px rgba(0,0,0,0.30)"
                }}
              >
                <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                  style={{ background: "radial-gradient(circle, rgba(30,215,130,0.28) 0%, transparent 70%)" }}
                />
                <div className="grid h-10 w-10 place-items-center rounded-xl text-[14px] font-bold text-white nada-logo-aura">
                  {idx + 1}
                </div>
                <h3 className="mt-4 text-[16px] font-bold tracking-tight">{feature.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-nada-secondary">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 border-t border-nada-border/20 px-6 py-16 md:px-10 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 max-w-2xl">
            <p className="nada-section-label">Plans</p>
            <h2 className="mt-3 text-[32px] font-bold leading-tight tracking-tight md:text-[40px]">
              Start free. Upgrade when you need it.
            </h2>
            <p className="mt-3 text-[16px] text-nada-secondary md:text-[17px]">
              No surveillance tier. No ad tier. Pay only when you need bigger files,
              backups, or self-hosted relays.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`relative flex flex-col rounded-2xl border p-6 transition-all duration-200 ${
                  tier.highlight
                    ? "border-nada-accent/45 bg-nada-accent/[0.05]"
                    : "border-nada-border/22"
                }`}
                style={{
                  background: tier.highlight
                    ? undefined
                    : "linear-gradient(155deg, rgb(var(--nada-surface-elevated) / 0.85) 0%, rgb(var(--nada-surface) / 0.85) 100%)",
                  backdropFilter: "blur(20px)",
                  boxShadow: tier.highlight
                    ? "0 0 0 1px rgba(30,215,130,0.45), 0 16px 40px rgba(17,167,101,0.22), inset 0 1px 0 rgb(var(--nada-border) / 0.10)"
                    : "inset 0 1px 0 rgb(var(--nada-border) / 0.08), 0 4px 24px rgba(0,0,0,0.30)"
                }}
              >
                {tier.highlight && (
                  <span className="absolute -top-2.5 right-4 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white nada-logo-aura">
                    Popular
                  </span>
                )}
                <h3 className="text-[15px] font-bold tracking-tight">{tier.name}</h3>
                <div className="mt-1.5 flex items-baseline gap-1">
                  <span className="text-[28px] font-bold tracking-tight">{tier.price}</span>
                  {tier.price !== "Custom" && (
                    <span className="text-[12px] text-nada-secondary">/mo</span>
                  )}
                </div>
                <p className="mt-3 text-[13px] text-nada-secondary">{tier.description}</p>
                <ul className="mt-5 flex flex-1 flex-col gap-2.5 text-[13px] text-nada-primary/85">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-nada-accent" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy / footer */}
      <section id="privacy" className="relative z-10 border-t border-nada-border/20 px-6 py-16 md:px-10 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="nada-section-label">Privacy reality</p>
          <h2 className="mt-3 text-[28px] font-bold tracking-tight md:text-[36px]">
            What anonymity does — and doesn&apos;t — protect.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-nada-secondary md:text-[16px]">
            NADA hides your identity, contacts, and content from the relay.
            <strong className="text-nada-primary"> It doesn&apos;t hide your IP. </strong>
            Pair NADA with Tor, a VPN, or wait for our mixnet routing layer for full
            network anonymity. Phase 1 mock encryption is clearly labeled in code as
            <code className="mx-1.5 rounded bg-nada-surface px-1.5 py-0.5 font-mono text-[12px] text-nada-accent">MVP_ONLY</code>
            — replaced by audited Signal Sender Keys before production.
          </p>
        </div>
      </section>

      <footer className="relative z-10 border-t border-nada-border/20 px-6 py-8 md:px-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-[12px] text-nada-secondary md:flex-row">
          <span>© NADA. All keys local.</span>
          <div className="flex items-center gap-5">
            <a href="#features" className="hover:text-nada-primary transition-colors">Features</a>
            <a href="#pricing"  className="hover:text-nada-primary transition-colors">Pricing</a>
            <a href="#privacy"  className="hover:text-nada-primary transition-colors">Privacy</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="text-nada-secondary/55">{label}</span>
      <span className="font-semibold text-nada-primary">{value}</span>
    </div>
  );
}
