"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { siteText } from "@/lib/i18n/messages/site";
import { altchaPayload, solveAltcha } from "@/lib/site/altcha-solver";
import { captchaChallengeAction } from "@/lib/site/captcha-actions";
import type { CaptchaPurpose, WebCaptchaProvider } from "@/lib/site/captcha";

interface TurnstileApi {
  render(element: HTMLElement, options: { sitekey: string; language?: string }): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Cloudflare Turnstile widget. It adds a hidden `cf-turnstile-response` field
// to the surrounding form; the customer-signup function verifies the token.
// A token is single use, so a new `resetKey` (a new action result) renders a
// fresh challenge.
export function Turnstile({ siteKey, resetKey }: { siteKey: string; resetKey: unknown }) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  // next/script calls onReady after loading and on every later mount.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const api = window.turnstile;
    if (!ready || !api || !container.current) return;
    if (widget.current === null) {
      widget.current = api.render(container.current, { sitekey: siteKey, language: "tr" });
    } else {
      api.reset(widget.current);
    }
  }, [ready, siteKey, resetKey]);

  useEffect(
    () => () => {
      if (widget.current !== null) window.turnstile?.remove(widget.current);
      widget.current = null;
    },
    [],
  );

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
      <div ref={container} data-testid="turnstile" />
    </>
  );
}

// The self-hosted robot check (docs/hukuk/kararlar.md H03, T12): asks our
// Edge Function for a signed challenge through a server action, solves it with
// Web Crypto and puts the answer into a hidden `altcha` field. No external
// script and no third-party request. A new `resetKey` (a new action result)
// starts a fresh challenge, since each answer is single use.
export function AltchaWidget({
  purpose,
  resetKey,
}: {
  purpose: CaptchaPurpose;
  resetKey: unknown;
}) {
  const [attempt, setAttempt] = useState(0);
  // The outcome of the run for this resetKey and attempt; an older one counts
  // as still solving.
  const [run, setRun] = useState<{ key: unknown; attempt: number; payload: string | null }>();

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const challenge = await captchaChallengeAction(purpose).catch(() => null);
      if (controller.signal.aborted) return;
      const number = challenge ? await solveAltcha(challenge, controller.signal) : null;
      if (controller.signal.aborted) return;
      const payload = challenge && number !== null ? altchaPayload(challenge, number) : null;
      setRun({ key: resetKey, attempt, payload });
    })();
    return () => controller.abort();
  }, [purpose, resetKey, attempt]);

  const current = run && run.key === resetKey && run.attempt === attempt ? run : null;
  const status = !current ? "solving" : current.payload ? "done" : "failed";
  const payload = current?.payload ?? "";

  const c = siteText.captcha;
  return (
    <div data-testid="altcha" data-state={status}>
      <input type="hidden" name="altcha" value={payload} />
      <p className="muted" role="status">
        {status === "solving" ? c.solving : status === "done" ? c.done : c.failed}
        {status === "failed" && (
          <>
            {" "}
            <button type="button" className="link" onClick={() => setAttempt((n) => n + 1)}>
              {c.retry}
            </button>
          </>
        )}
      </p>
    </div>
  );
}

// The widget of the configured provider: Turnstile with its site key (none
// locally and in CI), or the self-hosted check.
export function CaptchaWidget({
  provider,
  siteKey,
  purpose,
  resetKey,
}: {
  provider: WebCaptchaProvider | undefined;
  siteKey: string | null;
  purpose: CaptchaPurpose;
  resetKey: unknown;
}) {
  if (provider === "altcha") return <AltchaWidget purpose={purpose} resetKey={resetKey} />;
  return siteKey ? <Turnstile siteKey={siteKey} resetKey={resetKey} /> : null;
}
