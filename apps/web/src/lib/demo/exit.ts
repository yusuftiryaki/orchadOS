// Where "Demodan çık" and "Gerçek hesap aç" go after the demo session ends
// (docs/demo-turu.md §11.2–§11.3). Only these pages; anything else is "/". On
// a demo host they live on the main site. Pure.
export const DEMO_EXIT_TARGETS = ["/", "/kayit", "/giris", "/iletisim", "/paketler"] as const;

export function demoExitTarget(next: unknown, mainSiteUrl: string | null): string {
  const path = (DEMO_EXIT_TARGETS as readonly unknown[]).includes(next) ? (next as string) : "/";
  return mainSiteUrl ? `${mainSiteUrl}${path}` : path;
}
