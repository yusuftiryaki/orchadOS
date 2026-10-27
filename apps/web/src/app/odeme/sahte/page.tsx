import { notFound } from "next/navigation";
import { connection } from "next/server";
import { fakeCheckoutText as text } from "@/lib/i18n/messages/fake-checkout";
import { supabaseEnv } from "@/lib/env";

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
    <main className="centered">
      <div className="card">
        <h1>{text.title}</h1>
        <p>{text.notice}</p>
        {valid ? (
          <form method="post" action={action}>
            <input type="hidden" name="token" value={token} />
            <p>
              {text.amountLabel}: <strong>{`${amount} ${text.currency}`}</strong>
            </p>
            <p>
              <button className="button" type="submit" name="outcome" value="success">
                {text.approve}
              </button>{" "}
              <button className="button button-danger" type="submit" name="outcome" value="failure">
                {text.decline}
              </button>{" "}
              <button
                className="button button-secondary"
                type="submit"
                name="outcome"
                value="review"
              >
                {text.review}
              </button>
            </p>
          </form>
        ) : (
          <p role="alert">{text.invalid}</p>
        )}
      </div>
    </main>
  );
}
