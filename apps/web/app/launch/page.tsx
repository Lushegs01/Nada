import Link from "next/link";

const TIERS = [
  ["Free", "Messaging, basic calls, standard themes"],
  ["Pro", "Larger files, backups, advanced themes"],
  ["Business", "Verified profile, catalog, bot API"],
  ["Enterprise", "Self-hosted relay, SLA, controls"]
];

export default function LaunchPage(): JSX.Element {
  return (
    <main className="min-h-dvh bg-background text-primary">
      <section className="grid min-h-[92dvh] overflow-hidden px-5 py-8 md:grid-cols-[0.9fr_1.1fr] md:px-10">
        <div className="flex flex-col justify-center pb-8 md:pb-0">
          <p className="text-caption font-semibold uppercase tracking-[0.24em] text-secondary">
            NADA
          </p>
          <h1 className="mt-4 max-w-xl text-headline">
            Anonymous messaging without phone numbers or email.
          </h1>
          <p className="mt-5 max-w-lg text-body text-secondary">
            Identity starts as a local keypair. Contacts arrive through invite
            links and QR codes, never contact-book upload.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              className="inline-flex h-12 items-center justify-center rounded-pill bg-accent px-6 text-sm font-semibold text-white shadow-soft"
              href="/"
            >
              Open app
            </Link>
            <Link
              className="inline-flex h-12 items-center justify-center rounded-pill bg-surface px-6 text-sm font-semibold ring-1 ring-border"
              href="/#privacy"
            >
              Privacy reality
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <div className="w-full max-w-[520px] rounded-[28px] bg-[#1A1A1A] p-4 shadow-lift">
            <div className="rounded-[22px] bg-background p-4">
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <div className="grid h-11 w-11 place-items-center rounded-card bg-accent font-bold text-white">
                  N
                </div>
                <div>
                  <p className="font-semibold">NADA launch room</p>
                  <p className="text-caption text-secondary">6 anonymous keys</p>
                </div>
              </div>
              <div className="space-y-3 py-5">
                <div className="max-w-[75%] rounded-card bg-muted px-4 py-3 text-sm">
                  Invite links only. No phone sync.
                </div>
                <div className="ml-auto max-w-[75%] rounded-card bg-gradient-to-br from-accent to-accent-warm px-4 py-3 text-sm text-white">
                  Groups and files stay encrypted before relay handoff.
                </div>
                <div className="max-w-[75%] rounded-card bg-muted px-4 py-3 text-sm">
                  IP anonymity still needs Tor, VPN, or future mixnet routing.
                </div>
              </div>
              <div className="rounded-pill border border-border bg-surface px-4 py-3 text-caption text-secondary">
                Message
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border px-5 py-10 md:px-10">
        <div className="grid gap-3 md:grid-cols-4">
          {TIERS.map(([name, description]) => (
            <div className="rounded-card bg-muted p-4" key={name}>
              <h2 className="font-semibold">{name}</h2>
              <p className="mt-2 text-sm text-secondary">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
