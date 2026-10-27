import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { siteText } from "@/lib/i18n/messages/site";
import { completeSignup } from "@/lib/signup/client";
import { createClient } from "@/lib/supabase/server";
import styles from "../signup.module.css";
import { VerifyForm } from "./verify-form";
import { accountPhone } from "./verify-state";

const v = siteText.signup.verifyPage;

export const metadata: Metadata = { title: v.title };

// For a signed-in account that has to prove its phone (`/` links here when
// customer-signup answers phone_not_verified). A confirmed phone is not
// enough: complete wants a phone code in this session (otp amr), so a
// password session gets the code form too. "Done" only when complete agrees.
export default async function VerifyPhonePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/giris?next=%2Fkayit%2Fdogrula");

  const hasPhone = accountPhone(data.user.phone) !== null;
  let needsCode = hasPhone;
  if (hasPhone && data.user.phone_confirmed_at) {
    const result = await completeSignup(supabase);
    if (result.ok && result.status === "completed") redirect("/portal");
    needsCode = !result.ok && result.error === "phone_not_verified";
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <h1>{v.title}</h1>
        {!hasPhone ? (
          <p className="muted">{v.noPhone}</p>
        ) : needsCode ? (
          <>
            <p className="muted">{v.subtitle}</p>
            <VerifyForm />
          </>
        ) : (
          <>
            <p className="muted">{v.done}</p>
            <Link href="/" className="button">
              {v.continue}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
