function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}; see apps/web/.env.example`);
  }
  return value;
}

// NEXT_PUBLIC_* values must be read with literal property access so Next.js
// can inline them into the browser bundle.
export function supabaseEnv() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}
