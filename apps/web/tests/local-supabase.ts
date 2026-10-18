import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export interface SupabaseTestEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

// Reads URL and keys from the environment, or from `supabase status` of the
// local stack. Fails early with a hint when the stack is not running.
export function resolveSupabaseEnv(): SupabaseTestEnv {
  const fromEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (fromEnv.url && fromEnv.anonKey && fromEnv.serviceRoleKey) {
    return fromEnv as SupabaseTestEnv;
  }

  const repoRoot = resolve(import.meta.dirname, "../../..");
  let status: Record<string, string>;
  try {
    const out = execFileSync("supabase", ["status", "-o", "json", "--workdir", repoRoot], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    status = JSON.parse(out.slice(out.indexOf("{")));
  } catch (error) {
    throw new Error(
      "Local Supabase is not running. Run `pnpm db:start && pnpm db:reset` at the repo root.",
      { cause: error },
    );
  }
  return {
    url: fromEnv.url ?? status.API_URL,
    anonKey: fromEnv.anonKey ?? status.ANON_KEY,
    serviceRoleKey: fromEnv.serviceRoleKey ?? status.SERVICE_ROLE_KEY,
  };
}
