import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { parseDemoInfo, type DemoInfo } from "./info";

// demo_info() could not be read (PostgREST or the database failed). Not the
// end of a session: the request fails and the visitor can retry, so a
// transient error never reaches /demo/bitti and its demo_end.
export class DemoInfoUnavailableError extends Error {
  constructor(message: string) {
    super(`demo_info unavailable: ${message}`);
    this.name = "DemoInfoUnavailableError";
  }
}

// The caller's demo session (demo_info()), once per request; null for anyone
// who is not a demo visitor and for a token PostgREST rejects (PGRST3xx: the
// session is gone). Any other error throws DemoInfoUnavailableError.
export const getDemoInfo = cache(async (): Promise<DemoInfo | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("demo_info");
  if (error) {
    if (error.code?.startsWith("PGRST3")) return null;
    throw new DemoInfoUnavailableError(error.code || error.message);
  }
  return parseDemoInfo(data);
});
