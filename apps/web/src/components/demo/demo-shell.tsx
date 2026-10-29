import Link from "next/link";
import { Suspense } from "react";
import { LogoMark } from "@/components/brand/logo";
import type { DemoInfo } from "@/lib/demo/info";
import { siteFlags } from "@/lib/flags";
import { t } from "@/lib/i18n";
import { demoText } from "@/lib/i18n/messages/demo";
import { DemoBanner } from "./demo-banner";
import { GuidedTour, TourStartButton } from "./guided-tour";
import styles from "./demo.module.css";

// "HH:MM" in Turkey (UTC+3).
export function demoUntil(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Istanbul",
  }).format(new Date(iso));
}

// The portal shell of a demo visitor (docs/demo-turu.md §11.3): the banner,
// the brand and "Bahçelerim (örnek)", the guided tour. No e-mail, no avatar,
// no billing navigation.
export function DemoShell({ info, children }: { info: DemoInfo; children: React.ReactNode }) {
  const { mainSiteUrl, signupEnabled } = siteFlags();
  const signupNext = mainSiteUrl || signupEnabled ? "/kayit" : "/iletisim";
  const packagesHref = `${mainSiteUrl ?? ""}/paketler`;
  return (
    <>
      <DemoBanner until={demoUntil(info.expiresAt)} ctx={info.tour} signupNext={signupNext} />
      <header className={styles.shellHeader}>
        <div className={styles.shellInner}>
          <Link href="/portal" className={styles.shellBrand}>
            <LogoMark />
            <span>{t.app.name}</span>
          </Link>
          <Link href="/portal" className={styles.shellLink} data-testid="demo-gardens">
            {demoText.shell.gardens}
          </Link>
          <TourStartButton
            ctx={info.tour}
            className={`${styles.bannerButton} ${styles.narrow}`}
            testId="demo-tour-start-mobile"
          />
        </div>
      </header>
      {children}
      <Suspense fallback={null}>
        <GuidedTour ctx={info.tour} signupNext={signupNext} packagesHref={packagesHref} />
      </Suspense>
    </>
  );
}
