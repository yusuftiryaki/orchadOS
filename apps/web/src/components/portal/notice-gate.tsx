import { acknowledgeNoticeAction } from "@/app/portal/notice-actions";
import { LegalDocumentView } from "@/components/site/legal-document";
import { t } from "@/lib/i18n";
import { legalText } from "@/lib/i18n/messages/legal";
import styles from "./portal.module.css";

const T = t.legal.notice;

// T15 (H30): shown instead of the portal until the user records that they
// read the KVKK notice. "Okudum" and "Kaydet": no approval, no consent.
export function NoticeGate({ version }: { version: string }) {
  return (
    <main className={styles.page} data-testid="notice-gate">
      <h1>{T.title}</h1>
      <p>{T.intro}</p>
      <section className={styles.section}>
        <LegalDocumentView document={legalText.kvkk_notice} version={version} />
      </section>
      <form action={acknowledgeNoticeAction} className={styles.section}>
        <input type="hidden" name="version" value={version} />
        <label>
          <input type="checkbox" name="read" required /> {T.read}
        </label>
        <p>
          <button className="button" type="submit">
            {T.save}
          </button>
        </p>
      </form>
    </main>
  );
}
