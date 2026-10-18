import Link from "next/link";
import { t } from "@/lib/i18n";

export default function NotFound() {
  return (
    <main className="centered">
      <div className="card">
        <h1>{t.notFound.title}</h1>
        <Link href="/">{t.notFound.back}</Link>
      </div>
    </main>
  );
}
