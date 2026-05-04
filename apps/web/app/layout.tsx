import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  applicationName: "NADA",
  description: "Anonymous messaging without phone numbers or email.",
  manifest: "/manifest.webmanifest",
  title: {
    default: "NADA",
    template: "%s · NADA"
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png"
  }
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0E1621",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{ children: ReactNode }>): JSX.Element {
  return (
    <html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
      <body className="bg-nada-bg text-nada-primary antialiased font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
