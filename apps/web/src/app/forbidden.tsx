import Link from "next/link";
import { t } from "@/lib/i18n";

export default function Forbidden() {
  return (
    <main className="centered">
      <div className="card" data-testid="forbidden">
        <h1>{t.forbidden.title}</h1>
        <p className="muted">{t.forbidden.body}</p>
        <Link href="/">{t.forbidden.back}</Link>
      </div>
    </main>
  );
}
