"use client";

import { exitDemoAction } from "@/app/(site)/demo/actions";
import type { DemoTour } from "@/lib/demo/info";
import { demoSignupLabel, demoText } from "@/lib/i18n/messages/demo";
import { TourStartButton } from "./guided-tour";
import styles from "./demo.module.css";

const B = demoText.banner;

// The demo banner (docs/demo-turu.md §11.3): synthetic data, the session's
// end, and the ways out. Printed pages carry its text too (not .noPrint).
export function DemoBanner({
  until,
  ctx,
  signupNext,
}: {
  // "HH:MM" in Turkey.
  until: string;
  ctx: DemoTour;
  // exitDemoAction's next for "Gerçek hesap aç": /kayit, or /iletisim while
  // sign-up is closed on this site.
  signupNext: string;
}) {
  return (
    <div className={styles.banner} role="region" aria-label={B.label} data-testid="demo-banner">
      <div className={styles.bannerInner}>
        <p className={styles.bannerText}>
          <span className={styles.long}>{B.text(until)}</span>
          <span className={styles.short}>{B.short(until)}</span>
        </p>
        <div className={styles.bannerActions}>
          <TourStartButton
            ctx={ctx}
            className={`${styles.bannerButton} ${styles.wide}`}
            testId="demo-tour-start"
          />
          <form action={exitDemoAction}>
            <input type="hidden" name="next" value={signupNext} />
            <button
              type="submit"
              className={`${styles.bannerButton} ${styles.bannerPrimary}`}
              data-testid="demo-signup"
            >
              {demoSignupLabel(signupNext)}
            </button>
          </form>
          <form action={exitDemoAction}>
            <input type="hidden" name="next" value="/" />
            <button type="submit" className={styles.bannerButton} data-testid="demo-exit">
              {B.exit}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
