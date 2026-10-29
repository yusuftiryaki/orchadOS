import type { Metadata } from "next";
import { redirect } from "next/navigation";
import styles from "@/components/site/auth.module.css";
import { ButtonLink } from "@/components/ui/button";
import { siteText } from "@/lib/i18n/messages/site";
import { completeSignup, SIGNUP_REFUSED_PATH } from "@/lib/signup/client";
import { readTicket } from "@/lib/signup/ticket";
import { createClient } from "@/lib/supabase/server";
import { VerifyForm } from "./verify-form";
import { accountPhone } from "./verify-state";

const v = siteText.signup.verifyPage;

export const metadata: Metadata = { title: v.title };

// For a signed-in account that has to prove its phone (`/` links here when
// customer-signup answers phone_not_verified). A confirmed phone is not
// enough: complete wants a phone code in this session (otp amr), so a
// password session gets the code form too. "Done" only when complete agrees.
// The form's first step claims a ticket with the password session (actions.ts);
// a phone-code session without one is refused and signed out.
export default async function VerifyPhonePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/giris?next=%2Fkayit%2Fdogrula");

  const hasPhone = accountPhone(data.user.phone) !== null;
  let needsCode = hasPhone;
  if (hasPhone && data.user.phone_confirmed_at) {
    const result = await completeSignup(supabase, (await readTicket())?.ticket ?? null);
    if (result.ok && result.status === "completed") redirect("/portal");
    if (!result.ok && result.error === "signup_mismatch") redirect(SIGNUP_REFUSED_PATH);
    needsCode = !result.ok && result.error === "phone_not_verified";
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{v.title}</h1>
        <p className={styles.lead}>{!hasPhone ? v.noPhone : needsCode ? v.subtitle : v.done}</p>
      </header>
      {hasPhone && (
        <div className={styles.main}>
          {needsCode ? (
            <div className={styles.sheet}>
              <VerifyForm />
            </div>
          ) : (
            <ButtonLink href="/">{v.continue}</ButtonLink>
          )}
        </div>
      )}
    </div>
  );
}
