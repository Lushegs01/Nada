import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";

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

export default function RootLayout({
  children
}: Readonly<{ children: ReactNode }>): JSX.Element {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="bg-nada-bg text-nada-primary antialiased font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
