import { NextResponse, type NextRequest } from "next/server";
import { isDemoClaims } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// The end of a demo session (docs/demo-turu.md §11.2): the session gate sends
// expired visitors here. Only a demo session is ended (demo_end, sign out),
// then /demo?bitti=1. Anyone else goes to /demo with their session untouched,
// so an <img>, a link or a prefetch from another page cannot sign them out.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const target = new URL("/demo", request.url);
  if (isDemoClaims(data?.claims)) {
    try {
      await supabase.rpc("demo_end");
    } catch {
      // Signing out ends the session anyway.
    }
    await supabase.auth.signOut();
    target.searchParams.set("bitti", "1");
  }
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
