import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  applicationName: "NADA",
  description: "Anonymous messaging without phone numbers or email.",
  manifest: "/manifest.webmanifest",
  title: {
    default: "NADA",
    template: "%s · NADA"
  }
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { color: "#F8F9FA", media: "(prefers-color-scheme: light)" },
    { color: "#0A0A0F", media: "(prefers-color-scheme: dark)" }
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{ children: ReactNode }>): JSX.Element {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-nada-bg text-nada-primary antialiased">
        {children}
      </body>
    </html>
  );
}
