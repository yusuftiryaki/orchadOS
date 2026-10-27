"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

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
