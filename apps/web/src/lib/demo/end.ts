import "server-only";
import { cookies } from "next/headers";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

// The session cookies of @supabase/ssr: sb-<ref>-auth-token, chunked as .0, .1…
const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

// Ends the caller's demo session (docs/demo-turu.md §11.2): demo_end, sign
// out, and the auth cookies are deleted whatever GoTrue answered. auth-js keeps
// the local session when /logout fails with anything but 401/403/404, and a
// demo cookie that outlives demo_end would bounce between /demo/bitti and the
// portal.
export async function endDemoSession(supabase: Client): Promise<void> {
  try {
    await supabase.rpc("demo_end");
  } catch {
    // Signing out ends the session anyway.
  }
  try {
    await supabase.auth.signOut();
  } catch {
    // The cookies go below.
  }
  const store = await cookies();
  for (const { name } of store.getAll()) {
    if (AUTH_COOKIE.test(name)) store.delete(name);
  }
}
