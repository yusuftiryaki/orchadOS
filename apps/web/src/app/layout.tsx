import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next } from "next/font/google";
import { t } from "@/lib/i18n";
import "./globals.css";

// Self-hosted at build time (next/font). Latin extended carries the Turkish
// letters (ğ, ş, ı, İ); ç, ö, ü are in latin. Atkinson Hyperlegible was drawn
// for low-vision readers: owners read the portal on phones, outdoors
// (docs/tasarim-sistemi.md §Tipografi). The mono face is for codes and
// measurements only, so it is not preloaded.
const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin", "latin-ext"],
  variable: "--font-atkinson",
  display: "swap",
  // next/font has no fallback metrics for these families; the system stack in
  // --font-sans is the fallback.
  adjustFontFallback: false,
});
const atkinsonMono = Atkinson_Hyperlegible_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-atkinson-mono",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: { default: t.app.name, template: `%s · ${t.app.name}` },
  description: t.app.tagline,
};

export const viewport: Viewport = {
  themeColor: "#3b6a1e",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${atkinson.variable} ${atkinsonMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
