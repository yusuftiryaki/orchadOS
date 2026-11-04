"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { StatusPage } from "@/components/site/status-page";
import { Button } from "@/components/ui/button";
import { IconAlert } from "@/components/ui/icons";
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
    <StatusPage
      title={t.error.title}
      testId="error-page"
      icon={<IconAlert size={26} />}
      action={<Button onClick={retry}>{t.error.retry}</Button>}
    >
      <p>{t.error.body}</p>
    </StatusPage>
  );
}
