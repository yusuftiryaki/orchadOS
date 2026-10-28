import "server-only";
import { headers } from "next/headers";

// The visitor's address as seen by our server, passed with the proxy secret to
// the Edge Functions that rate limit per IP (customer-signup, demo-start). The
// platform's proxy sets the header.
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || null;
}
