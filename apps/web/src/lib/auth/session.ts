import "server-only";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { demoExpired } from "@/lib/demo/info";
import { getDemoInfo } from "@/lib/demo/session";
import { siteFlags } from "@/lib/flags";
import { createClient } from "@/lib/supabase/server";
import { loadUserRoles } from "./load-roles";
import { canAccessSection, type Section, type UserRoles } from "./roles";

export interface SessionUser {
  id: string;
  email: string | null;
  roles: UserRoles;
  // A demo visitor's account (app_metadata.demo, set only by demo-start with
  // the service role; docs/demo-turu.md §2).
  demo: boolean;
}

// app_metadata.demo === true in the JWT claims.
export function isDemoClaims(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;
  const meta = (claims as { app_metadata?: unknown }).app_metadata;
  return Boolean(meta && typeof meta === "object" && (meta as { demo?: unknown }).demo === true);
}

// Once per request, shared by layouts and pages.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const roles = await loadUserRoles(supabase, claims.sub);
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    roles,
    demo: isDemoClaims(claims),
  };
});

// Where an ended demo goes: /demo/bitti closes the session and shows
// /demo?bitti=1.
export const DEMO_END_PATH = "/demo/bitti";

// The demo session gate (docs/demo-turu.md §11.3). For a demo visitor: false
// when this deployment no longer serves the demo, demo_info() is gone (the
// account or session was deleted) or the session has ended. Real users: true.
export async function demoGate(user: SessionUser): Promise<boolean> {
  if (!user.demo) return true;
  if (!siteFlags().demoEnabled) return false;
  return !demoExpired(await getDemoInfo());
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(siteFlags().mainSiteUrl ? "/demo" : "/giris");
  // Before any role check: an expired visitor whose access housekeeping has
  // already deleted sees the end page, not a 403.
  if (!(await demoGate(user))) redirect(DEMO_END_PATH);
  return user;
}

// Called by both the section layout and its pages: a layout is not re-rendered
// on every navigation, so it cannot be the only gate.
export async function requireSection(section: Section): Promise<SessionUser> {
  const user = await requireUser();
  if (!canAccessSection(user.roles, section)) forbidden();
  return user;
}
