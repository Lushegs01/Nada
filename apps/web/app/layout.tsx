import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
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
