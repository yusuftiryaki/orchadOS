import { SIGNUP_REFUSED_LOGIN } from "@/lib/signup/client";
import { createClient } from "@/lib/supabase/server";

// Where a refused sign-up completion goes (docs/musteri-yonetimi.md §7.2):
// `/` and /kayit/dogrula render on the server and cannot clear the session
// cookies themselves. A self sign-up session is signed out, then the login
// page explains how the registrant finishes (e-mail and password, then the
// phone code). Any other valid session is kept, so a link from another page
// cannot sign a customer out. The Location is relative (see demo/bitti).
// SIGNUP_REFUSED_PATH (lib/signup/client.ts) names this route.

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const meta: unknown = data?.claims?.app_metadata;
  const selfSignup =
    !!meta && typeof meta === "object" && (meta as { signup?: unknown }).signup === "self";
  // No valid claims: the account was just deleted or quarantined (its
  // sessions ended); only the stale cookies are left to clear.
  if (selfSignup || !data?.claims) await supabase.auth.signOut();
  return new Response(null, {
    status: 303,
    headers: { Location: SIGNUP_REFUSED_LOGIN, "Cache-Control": "private, no-store" },
  });
}
