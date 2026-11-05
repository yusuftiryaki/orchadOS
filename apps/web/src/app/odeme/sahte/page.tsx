import { notFound } from "next/navigation";
import { connection } from "next/server";
import { LogoMark } from "@/components/brand/logo";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { fakeCheckoutText as text } from "@/lib/i18n/messages/fake-checkout";
import { supabaseEnv } from "@/lib/env";
import styles from "./sahte.module.css";

// Stand-in for iyzico's Checkout Form when the Edge Functions run with the fake
// provider (docs/musteri-yonetimi.md §8.6). Exists only with
// PAYMENT_FAKE_CHECKOUT=1 (local, CI, test project). The form posts the token
// and the chosen outcome to payment-callback, exactly where iyzico would send
// the browser.

const TOKEN_RE = /^fake_[0-9a-f-]{36}_[0-9a-z]{8,32}$/;
const AMOUNT_RE = /^\d{1,9}\.\d{2}$/;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function FakeCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Decided per request: the flag must not be baked in at build time.
  await connection();
  if (process.env.PAYMENT_FAKE_CHECKOUT !== "1") notFound();

  const query = await searchParams;
  const token = first(query.token);
  const amount = first(query.tutar);
  const valid = !!token && TOKEN_RE.test(token) && !!amount && AMOUNT_RE.test(amount);
  const action = `${supabaseEnv().url}/functions/v1/payment-callback`;

  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <p className={styles.brand}>
          <LogoMark size={24} />
          <span>{t.app.name}</span>
        </p>
        <h1 className={styles.title}>{text.title}</h1>
        <Alert tone="warning">{text.notice}</Alert>
        {valid ? (
          <form method="post" action={action} className={styles.form}>
            <input type="hidden" name="token" value={token} />
            <div className={styles.amount}>
              <span>{text.amountLabel}</span>
              <strong>{`${amount} ${text.currency}`}</strong>
            </div>
            <div className={styles.actions}>
              <button
                className={buttonClass({ block: true })}
                type="submit"
                name="outcome"
                value="success"
              >
                {text.approve}
              </button>
              <button
                className={buttonClass({ variant: "secondary", block: true })}
                type="submit"
                name="outcome"
                value="failure"
              >
                {text.decline}
              </button>
              <button
                className={buttonClass({ variant: "quiet", block: true })}
                type="submit"
                name="outcome"
                value="review"
              >
                {text.review}
              </button>
            </div>
          </form>
        ) : (
          <Alert tone="danger" role="alert">
            {text.invalid}
          </Alert>
        )}
      </div>
    </main>
  );
}
