import { isDemoClaims } from "@/lib/auth/session";
import { endDemoSession } from "@/lib/demo/end";
import { createClient } from "@/lib/supabase/server";

// The end of a demo session (docs/demo-turu.md §11.2): the session gate sends
// expired visitors here. Only a demo session is ended (demo_end, sign out),
// then /demo?bitti=1. Anyone else goes to /demo with their session untouched,
// so an <img>, a link or a prefetch from another page cannot sign them out.
// The Location is relative: behind a proxy the server's own host name is not
// the one the browser used.
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  let target = "/demo";
  if (isDemoClaims(data?.claims)) {
    await endDemoSession(supabase);
    target = "/demo?bitti=1";
  }
  return new Response(null, {
    status: 303,
    headers: { Location: target, "Cache-Control": "private, no-store" },
  });
}
