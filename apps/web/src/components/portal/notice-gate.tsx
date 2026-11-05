import { acknowledgeNoticeAction } from "@/app/portal/notice-actions";
import { LegalDocumentView } from "@/components/site/legal-document";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { t } from "@/lib/i18n";
import { legalText } from "@/lib/i18n/messages/legal";
import layout from "./page.module.css";
import styles from "./notice-gate.module.css";

const T = t.legal.notice;

// T15 (H30): shown instead of the portal until the user records that they
// read the KVKK notice. "Okudum" and "Kaydet": no approval, no consent. One
// document card: the text scrolls in its own box, the confirmation is the
// card's footer and stays in reach on a phone.
export function NoticeGate({ version }: { version: string }) {
  return (
    <main className={`${layout.page} ${layout.reading}`} data-testid="notice-gate">
      <PageHeader title={T.title} lead={T.intro} />
      <div className={styles.card}>
        <section className={styles.document} tabIndex={0} aria-label={T.title}>
          <LegalDocumentView document={legalText.kvkk_notice} version={version} />
        </section>
        <form action={acknowledgeNoticeAction} className={styles.confirm}>
          <input type="hidden" name="version" value={version} />
          <Checkbox id="notice-read" name="read" required label={T.read} />
          <Button type="submit" className={styles.save}>
            {T.save}
          </Button>
        </form>
      </div>
    </main>
  );
}
