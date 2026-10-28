import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// The sign-up ticket (docs/musteri-yonetimi.md §7, review of PR #93): every
// 200 of customer-signup register carries an opaque ticket; `claim` hands one
// to a session opened with the account's password (/kayit/dogrula). It stays
// on the server side of the browser: an httpOnly, SameSite=Lax cookie, never
// shown in a page or a URL. With it
//   - the web lets Auth send a phone confirmation code only for the pending
//     sign-up this browser's register wrote (signup_code_grant; the Send SMS
//     hook refuses any other), never for an account someone else opened with
//     that phone;
//   - every complete (/kayit, /kayit/dogrula, `/`) sends it, and
//     customer-signup refuses a pending sign-up whose ticket this browser
//     does not hold, so the phone's owner is never signed in to someone
//     else's account;
//   - a new register replaces this browser's own sign-up in progress
//     ("Bilgileri değiştir").
// The cookie also binds the ticket to the phone it was issued for (an HMAC
// with a server key): resend only sends a code to the phone that went through
// register's robot check and rate limits in this browser. On HTTPS it carries
// the __Host- prefix (Secure, Path=/, no Domain), so a sibling subdomain or a
// plain-HTTP response cannot plant an attacker's ticket (cookie fixation).

const secure = () => process.env.NODE_ENV === "production";
const cookieName = () => (secure() ? "__Host-orchados_signup" : "orchados_signup");
const TICKET_RE = /^[A-Za-z0-9_-]{43}$/;
// A day: the unverified account is deleted after that anyway (§7.3).
const MAX_AGE_S = 24 * 60 * 60;

// SIGNUP_PROXY_SECRET is server only and set wherever sign-up runs; without it
// (development) a key per server process does. On Vercel that key differs
// between lambda instances and resend would keep asking to register again, so
// the misconfiguration is logged once.
let fallbackKey: Buffer | null = null;
function bindingKey(): Buffer | string {
  const secret = process.env.SIGNUP_PROXY_SECRET;
  if (secret) return secret;
  if (!fallbackKey && secure() && process.env.VERCEL) {
    console.error("signup: SIGNUP_PROXY_SECRET is not set; sign-up tickets bind per instance");
  }
  fallbackKey ??= randomBytes(32);
  return fallbackKey;
}

export function ticketBinding(ticket: string, phone: string): string {
  return createHmac("sha256", bindingKey())
    .update(`signup-ticket\n${ticket}\n${phone}`)
    .digest("base64url");
}

export function encodeTicketCookie(ticket: string, phone: string): string {
  return `${ticket}.${ticketBinding(ticket, phone)}`;
}

export interface TicketCookie {
  ticket: string;
  binding: string;
}

export function decodeTicketCookie(value: string | undefined): TicketCookie | null {
  const [ticket, binding, extra] = (value ?? "").split(".");
  if (extra !== undefined || !ticket || !binding || !TICKET_RE.test(ticket)) return null;
  return { ticket, binding };
}

// The cookie was issued for this phone.
export function ticketFitsPhone(cookie: TicketCookie, phone: string): boolean {
  const expected = Buffer.from(ticketBinding(cookie.ticket, phone));
  const sent = Buffer.from(cookie.binding);
  return expected.length === sent.length && timingSafeEqual(expected, sent);
}

export async function readTicket(): Promise<TicketCookie | null> {
  return decodeTicketCookie((await cookies()).get(cookieName())?.value);
}

export async function storeTicket(ticket: string, phone: string): Promise<void> {
  (await cookies()).set(cookieName(), encodeTicketCookie(ticket, phone), {
    httpOnly: true,
    sameSite: "lax",
    secure: secure(),
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function clearTicket(): Promise<void> {
  (await cookies()).set(cookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: secure(),
    path: "/",
    maxAge: 0,
  });
}
