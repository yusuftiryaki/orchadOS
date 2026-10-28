"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { t } from "@/lib/i18n";

// A request that failed for a transient reason (for example demo_info could
// not be read, docs/demo-turu.md §11.3): the session stays, the visitor
// retries. The retry renders the server components again.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });
  return (
    <main className="centered">
      <div className="card" data-testid="error-page">
        <h1>{t.error.title}</h1>
        <p className="muted">{t.error.body}</p>
        <button type="button" className="button" onClick={retry}>
          {t.error.retry}
        </button>
      </div>
    </main>
  );
}
