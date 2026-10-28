import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { parseDemoInfo, type DemoInfo } from "./info";

// The caller's demo session (demo_info()), once per request; null for
// anyone who is not a demo visitor and when the call fails.
export const getDemoInfo = cache(async (): Promise<DemoInfo | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("demo_info");
  if (error) return null;
  return parseDemoInfo(data);
});
