"use server";

import { redirect } from "next/navigation";
import { isDemoClaims } from "@/lib/auth/session";
import { demoExitTarget } from "@/lib/demo/exit";
import { requestDemoStart } from "@/lib/demo/start";
import { siteFlags } from "@/lib/flags";
import { formReader } from "@/lib/operations/validation";
import { clientIp } from "@/lib/site/client-ip";
import { createClient } from "@/lib/supabase/server";
import type { DemoStartState } from "./demo-state";

// Starts a demo (docs/demo-turu.md §11.2): demo-start opens a temporary
// account and returns a single-use token. The browser exchanges it
// (demo-start-form.tsx); the server never does, so GoTrue's per-IP limits
// apply to the visitor. The token is not logged.
export async function startDemoAction(
  _previous: DemoStartState,
  form: FormData,
): Promise<DemoStartState> {
  const flags = siteFlags();
  if (!flags.demoEnabled) return { status: "error", code: "demo_closed" };
  // Turnstile puts its token into this field of the surrounding form.
  const captchaToken = formReader(form)("cf-turnstile-response") || null;
  if (flags.turnstileSiteKey && !captchaToken) return { status: "error", code: "captcha_missing" };

  const result = await requestDemoStart({ captchaToken, clientIp: await clientIp() });
  if (!result.ok) return { status: "error", code: result.error };
  return {
    status: "ready",
    tokenHash: result.value.token_hash,
    verificationType: result.value.verification_type,
    next: result.value.next.startsWith("/") ? result.value.next : "/portal",
  };
}

// Ends the demo session (demo_end, sign out) and goes to `next`. Only a demo
// session is touched: a real user's session stays as it is.
export async function exitDemoAction(form: FormData): Promise<never> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (isDemoClaims(data?.claims)) {
    try {
      await supabase.rpc("demo_end");
    } catch {
      // The session ends with the sign-out anyway.
    }
    await supabase.auth.signOut();
  }
  redirect(demoExitTarget(form.get("next"), siteFlags().mainSiteUrl));
}
