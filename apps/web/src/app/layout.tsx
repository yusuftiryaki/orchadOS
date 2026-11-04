import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { t } from "@/lib/i18n";
import "./globals.css";

// Self-hosted at build time (next/font). Latin extended carries the Turkish
// letters (ğ, ş, ı, İ); ç, ö, ü are in latin. Inter is a neutral, highly
// legible UI face with tabular figures and an open zero; the mono face is for
// codes and measurements only, so it is not preloaded
// (docs/tasarim-sistemi.md §Tipografi).
const sans = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-jetbrains-mono",
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
