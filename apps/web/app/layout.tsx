import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import localFont from "next/font/local";

import { APPEARANCE_BOOTSTRAP } from "@/lib/appearance";

import "./globals.css";

// Self-hosted variable fonts (SIL OFL, see app/fonts/LICENSE-*): a privacy
// messenger should not depend on Google Fonts — not even at build time.
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "NADA",
  description: "Anonymous, end-to-end encrypted messaging — without phone numbers or email.",
  manifest: "/manifest.webmanifest",
  title: {
    default: "NADA — Anonymous Messaging",
    template: "%s · NADA"
  },
  icons: {
    icon: "/logo-192.png",
    apple: "/logo-192.png"
  }
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0A0B12",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover"
};

export default async function RootLayout({
  children
}: Readonly<{ children: ReactNode }>): Promise<JSX.Element> {
  // The middleware mints a per-response nonce; the appearance bootstrap is the
  // only inline script this app writes, and it carries that nonce like Next's
  // own. Without it the stored theme could only be applied once the bundle had
  // run, so anyone on the light theme would watch the app flash dark first.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOTSTRAP }}
          {...(nonce ? { nonce } : {})}
        />
      </head>
      <body className="bg-nada-bg text-nada-primary antialiased font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
