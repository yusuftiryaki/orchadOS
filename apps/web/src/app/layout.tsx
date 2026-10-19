import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: t.app.name,
  description: t.app.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
