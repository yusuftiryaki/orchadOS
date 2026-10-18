import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { LoginForm } from "./login-form";
import { safeNextPath } from "./login-methods";
import styles from "./login.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const target = safeNextPath(next);
  if (await getSessionUser()) redirect(target);

  return (
    <main className="centered">
      <div className={`card ${styles.card}`}>
        <h1>{t.app.name}</h1>
        <p className="muted">{t.app.tagline}</p>
        <h2>{t.login.title}</h2>
        <LoginForm next={target} />
      </div>
    </main>
  );
}
