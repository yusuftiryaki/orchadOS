import { acknowledgeNoticeAction } from "@/app/portal/notice-actions";
import { LegalDocumentView } from "@/components/site/legal-document";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { panelClass } from "@/components/ui/panel";
import { t } from "@/lib/i18n";
import { legalText } from "@/lib/i18n/messages/legal";
import layout from "./page.module.css";
import styles from "./notice-gate.module.css";

const T = t.legal.notice;

// T15 (H30): shown instead of the portal until the user records that they
// read the KVKK notice. "Okudum" and "Kaydet": no approval, no consent. The
// text scrolls in its own box so the confirmation stays in reach on a phone.
export function NoticeGate({ version }: { version: string }) {
  return (
    <main className={`${layout.page} ${layout.reading}`} data-testid="notice-gate">
      <PageHeader title={T.title} lead={T.intro} />
      <section className={`${panelClass} ${styles.document}`} tabIndex={0} aria-label={T.title}>
        <LegalDocumentView document={legalText.kvkk_notice} version={version} />
      </section>
      <form action={acknowledgeNoticeAction} className={`${panelClass} ${styles.confirm}`}>
        <input type="hidden" name="version" value={version} />
        <Checkbox id="notice-read" name="read" required label={T.read} />
        <div className={layout.actions}>
          <Button type="submit">{T.save}</Button>
        </div>
      </form>
    </main>
  );
}
