import "server-only";
import { forbidden, redirect } from "next/navigation";
import type { SessionUser } from "@/lib/auth/session";

// The billing screens of the portal need a customer profile on top of the
// portal section: every page calls requireSection("portal") and then this.
// A co-owner without a profile gets 403 (row level security would show them
// empty lists anyway). A demo visitor never has a profile and goes back to
// the gardens (docs/demo-turu.md §6.3).
export function assertCustomer(user: SessionUser): SessionUser {
  if (user.demo) redirect("/portal");
  if (!user.roles.customer) forbidden();
  return user;
}
