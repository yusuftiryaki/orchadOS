import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { t } from "@/lib/i18n";
import "./globals.css";

// Latin extended carries the Turkish letters (ğ, ş, ı, İ).
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: t.app.name, template: `%s · ${t.app.name}` },
  description: t.app.tagline,
};

export const viewport: Viewport = {
  themeColor: "#2f6b2a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
