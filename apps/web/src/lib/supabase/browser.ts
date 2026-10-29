"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

// Browser client. Only the demo start uses it: the visitor's browser exchanges
// the demo token for a session itself (docs/demo-turu.md §2), so GoTrue's
// per-IP limits apply to the visitor, not to our server. The session lands in
// the same cookies the server reads.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
