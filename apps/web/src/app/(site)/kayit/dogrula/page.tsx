import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { siteText } from "@/lib/i18n/messages/site";
import { createClient } from "@/lib/supabase/server";
import styles from "../signup.module.css";
import { VerifyForm } from "./verify-form";
import { accountPhone } from "./verify-state";

const v = siteText.signup.verifyPage;

export const metadata: Metadata = { title: v.title };

// For a signed-in account whose phone is not confirmed yet (`/` links here
// when customer-signup answers phone_not_verified).
export default async function VerifyPhonePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/giris?next=%2Fkayit%2Fdogrula");

  const confirmed = Boolean(data.user.phone_confirmed_at);
  const hasPhone = accountPhone(data.user.phone) !== null;

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <h1>{v.title}</h1>
        {confirmed ? (
          <>
            <p className="muted">{v.done}</p>
            <Link href="/" className="button">
              {v.continue}
            </Link>
          </>
        ) : hasPhone ? (
          <>
            <p className="muted">{v.subtitle}</p>
            <VerifyForm />
          </>
        ) : (
          <p className="muted">{v.noPhone}</p>
        )}
      </div>
    </div>
  );
}
