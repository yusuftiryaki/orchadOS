import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@/lib/supabase/types";

const sendSignupCode = vi.hoisted(() => vi.fn());
vi.mock("@/lib/signup/client", () => ({ sendSignupCode }));

const { sendAccountCode } = await import("./send-code");

type AuthError = { code?: string; message?: string } | null;

function fakeClient(signIn: AuthError) {
  const auth = {
    signInWithOtp: vi.fn(async () => ({ data: {}, error: signIn })),
    resend: vi.fn(async () => ({ data: {}, error: null })),
  };
  return { auth, client: { auth } as unknown as Client };
}

const PHONE = "+905321234567";
const TICKET = "t".repeat(43);

beforeEach(() => {
  vi.clearAllMocks();
  sendSignupCode.mockResolvedValue(true);
});

describe("sendAccountCode", () => {
  it("signs in a verified phone without send_code", async () => {
    const { auth, client } = fakeClient(null);
    expect(await sendAccountCode(client, PHONE, { ticket: TICKET })).toBeNull();
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      phone: PHONE,
      options: { shouldCreateUser: false, channel: "sms" },
    });
    expect(sendSignupCode).not.toHaveBeenCalled();
  });

  // A new self-service account has an unconfirmed phone; GoTrue refuses its
  // code request as a sign-up (review of PR #53, finding 2). The code is
  // asked for server side with the ticket (auth hardening, item 3), never
  // with Auth's public resend.
  it("asks an unconfirmed phone's code through send_code with the ticket", async () => {
    const { auth, client } = fakeClient({
      code: "signup_disabled",
      message: "Signups not allowed",
    });
    expect(await sendAccountCode(client, PHONE, { ticket: TICKET })).toBeNull();
    expect(sendSignupCode).toHaveBeenCalledWith(client, PHONE, TICKET);
    expect(auth.resend).not.toHaveBeenCalled();
  });

  it("reports an unreachable send_code", async () => {
    sendSignupCode.mockResolvedValue(false);
    const { client } = fakeClient({ code: "signup_disabled" });
    expect(await sendAccountCode(client, PHONE, { ticket: TICKET })).toBe("sendFailed");
  });

  // Review of PR #93, finding 1: an account the caller did not open.
  it("never asks for the confirmation code without a ticket", async () => {
    const { auth, client } = fakeClient({ code: "signup_disabled" });
    expect(await sendAccountCode(client, PHONE, { ticket: null })).toBe("not_registered");
    expect(sendSignupCode).not.toHaveBeenCalled();
    expect(auth.resend).not.toHaveBeenCalled();
  });

  it("reports an unknown number without send_code", async () => {
    const { client } = fakeClient({ code: "otp_disabled" });
    expect(await sendAccountCode(client, PHONE, { ticket: TICKET })).toBe("not_registered");
    expect(sendSignupCode).not.toHaveBeenCalled();
  });
});
