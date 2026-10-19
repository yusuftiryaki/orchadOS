import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Any client typed against our schema: the SSR server client in the app, or a
// plain supabase-js client in integration tests.
export type Client = SupabaseClient<Database>;
