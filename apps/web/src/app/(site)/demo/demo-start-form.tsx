"use client";

import { useActionState, useEffect, useState } from "react";
import { CaptchaWidget } from "@/components/site/turnstile";
import styles from "@/components/demo/demo.module.css";
import { demoText, type DemoStartError } from "@/lib/i18n/messages/demo";
import type { WebCaptchaProvider } from "@/lib/site/captcha";
import { createClient } from "@/lib/supabase/browser";
import { startDemoAction } from "./actions";
import { INITIAL_DEMO_STATE, type DemoStartState } from "./demo-state";

const d = demoText.start;

// The start button. On "ready" the browser exchanges the single-use token for
// its own session (docs/demo-turu.md §2) and opens the portal.
export function DemoStartForm({
  turnstileSiteKey,
  captchaProvider,
  label,
}: {
  turnstileSiteKey: string | null;
  captchaProvider?: WebCaptchaProvider;
  label: string;
}) {
  const [state, action, pending] = useActionState(startDemoAction, INITIAL_DEMO_STATE);
  // The result whose token the browser could not exchange.
  const [failed, setFailed] = useState<DemoStartState | null>(null);

  useEffect(() => {
    if (state.status !== "ready") return;
    let cancelled = false;
    createClient()
      .auth.verifyOtp({
        token_hash: state.tokenHash,
        type: state.verificationType as "magiclink",
      })
      .then(({ error }) => {
        if (cancelled) return;
        if (error) {
          setFailed(state);
        } else {
          // A new demo starts with the guided tour open.
          try {
            window.sessionStorage.removeItem("orchados-demo-tour-closed");
          } catch {
            // Storage blocked: nothing was kept either.
          }
          window.location.assign(state.next);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

  const opening = state.status === "ready" && failed !== state;
  const error: DemoStartError | null =
    failed === state ? "verify_failed" : state.status === "error" ? state.code : null;
  const busy = pending || opening;
  return (
    <form action={action} className={styles.startForm}>
      <CaptchaWidget
        provider={captchaProvider}
        siteKey={turnstileSiteKey}
        purpose="demo"
        resetKey={state}
      />
      {error && (
        <p className="error" role="alert" data-testid="demo-start-error">
          {d.errors[error]}
        </p>
      )}
      <button className="button" type="submit" disabled={busy} data-testid="demo-start">
        {opening ? d.opening : pending ? d.starting : label}
      </button>
    </form>
  );
}
