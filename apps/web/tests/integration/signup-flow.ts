import { expect, inject } from "vitest";
import { requestSignupCode } from "@/lib/billing/signup-code";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { anonClient, serviceClient } from "./fixtures";

// The self sign-up flow against the local stack (docs/musteri-yonetimi.md §7),
// step by step as the web runs it: customer-signup register, the code step
// (signup_code_grant with the register's ticket, then the code), verifyOtp,
// complete. Codes are read from the outbox of the send-sms hook's record
// provider. Every register carries the proxy secret and a TEST-NET client IP
// (203.0.113.x) of the caller's choosing for the per-IP limit.

const PROXY_SECRET = "signup-proxy-local";

export const randomDigits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
export const randomPhone = () => `+90555${randomDigits(7)}`;

export type Response = { status: number; json: Record<string, unknown> };

export async function signupCall(
  payload: Record<string, unknown>,
  ip: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const res = await fetch(`${inject("supabase").url}/functions/v1/customer-signup`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-orchados-proxy-secret": PROXY_SECRET,
      ...headers,
    },
    body: JSON.stringify(payload.action === "register" ? { ...payload, client_ip: ip } : payload),
  });
  return { status: res.status, json: await res.json() };
}

export function registerBody(fields: {
  phone: string;
  email: string;
  password?: string;
  ticket?: string;
}) {
  return {
    action: "register",
    full_name: "Deneme Müşteri",
    phone: fields.phone,
    email: fields.email,
    password: fields.password ?? "parola-1234",
    contact_preference: "sms",
    consents: {
      kvkk_notice_version: LEGAL_TEXT_VERSIONS.kvkk_notice,
      explicit_text_version: "riza-v1-taslak",
      explicit_service_improvement: false,
      explicit_marketing: false,
    },
    ...(fields.ticket ? { ticket: fields.ticket } : {}),
  };
}

// Every login code the hook recorded for the phone, newest first.
export async function codes(phone: string): Promise<string[]> {
  const { data, error } = await serviceClient().rpc("message_outbox_list", {
    p_recipient: phone,
    p_limit: 50,
  });
  if (error) throw error;
  return (data ?? [])
    .filter((m) => m.purpose === "login_code")
    .map((m) => /\b(\d{6})\b/.exec(m.body)?.[1] ?? "")
    .filter(Boolean);
}

export async function latestCode(phone: string): Promise<string | null> {
  return (await codes(phone))[0] ?? null;
}

type AnonClient = ReturnType<typeof anonClient>;

// The web's code step (kayit/actions.ts sendCode): the phone confirmation
// code only after signup_code_grant accepted the register's ticket.
export async function sendCode(client: AnonClient, phone: string, ticket?: string | null) {
  const own = ticket
    ? await client.rpc("signup_code_grant", { p_phone: phone, p_ticket: ticket })
    : { data: false, error: null };
  expect(own.error).toBeNull();
  return requestSignupCode(client.auth, phone, { confirm: own.data === true });
}

// Enters the phone's latest code (verifyOtp, as /kayit, /giris and
// /kayit/dogrula do) in a fresh browser; returns its client and access token.
export async function enterLatestCode(phone: string, client: AnonClient = anonClient()) {
  const code = await latestCode(phone);
  expect(code).toMatch(/^\d{6}$/);
  const verified = await client.auth.verifyOtp({ phone, token: code!, type: "sms" });
  expect(verified.error).toBeNull();
  return {
    client,
    userId: verified.data.user!.id,
    token: verified.data.session!.access_token,
  };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

// complete as the web sends it: with the browser's ticket, or without one.
export const complete = (token: string, ticket: string | null, ip = "203.0.113.200") =>
  signupCall({ action: "complete", ...(ticket ? { ticket } : {}) }, ip, bearer(token));

export const claim = (token: string, ip = "203.0.113.200") =>
  signupCall({ action: "claim" }, ip, bearer(token));

export async function userById(id: string) {
  return (await serviceClient().auth.admin.getUserById(id)).data.user;
}

export async function usersByEmail(emails: string[]) {
  const { data, error } = await serviceClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.filter((u) => u.email && emails.includes(u.email));
}
