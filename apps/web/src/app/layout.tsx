import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { t } from "@/lib/i18n";
import "./globals.css";

// Self-hosted at build time (next/font). Latin extended carries the Turkish
// letters (ğ, ş, ı, İ) and the lira sign (₺); ç, ö, ü are in latin. Hanken
// Grotesk is a sturdy, open grotesque with a plain zero and a correct ₺
// (Schibsted Grotesk draws ₺ like £); its heavy weights carry the headlines. IBM Plex Mono is for real identifiers only
// (tree codes, order numbers, coordinates), so it is not preloaded
// (docs/tasarim-sistemi.md §Tipografi).
const sans = Hanken_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans-face",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-mono-face",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: t.app.name, template: `%s · ${t.app.name}` },
  description: t.app.tagline,
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
