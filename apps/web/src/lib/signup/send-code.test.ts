import { describe, expect, it, vi } from "vitest";
import type { Client } from "@/lib/supabase/types";
import { sendAccountCode } from "./send-code";

type AuthError = { code?: string; message?: string } | null;

function fakeClient(signIn: AuthError, resend: AuthError = null) {
  const auth = {
    signInWithOtp: vi.fn(async () => ({ data: {}, error: signIn })),
    resend: vi.fn(async () => ({ data: {}, error: resend })),
  };
  return { auth, client: { auth } as unknown as Client };
}

const PHONE = "+905321234567";

describe("sendAccountCode", () => {
  it("signs in a verified phone without resend", async () => {
    const { auth, client } = fakeClient(null);
    expect(await sendAccountCode(client, PHONE)).toBeNull();
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      phone: PHONE,
      options: { shouldCreateUser: false, channel: "sms" },
    });
    expect(auth.resend).not.toHaveBeenCalled();
  });

  // A new self-service account has an unconfirmed phone; GoTrue refuses its
  // code request as a sign-up (review of PR #53, finding 2).
  it("asks an unconfirmed phone's code with resend", async () => {
    const { auth, client } = fakeClient({
      code: "signup_disabled",
      message: "Signups not allowed",
    });
    expect(await sendAccountCode(client, PHONE)).toBeNull();
    expect(auth.resend).toHaveBeenCalledWith({ type: "sms", phone: PHONE });
  });

  it("maps a resend error", async () => {
    const { client } = fakeClient(
      { code: "signup_disabled" },
      { code: "over_sms_send_rate_limit", message: "after 40 seconds" },
    );
    expect(await sendAccountCode(client, PHONE)).toBe("tooSoon");
  });

  it("reports an unknown number without resend", async () => {
    const { auth, client } = fakeClient({ code: "otp_disabled" });
    expect(await sendAccountCode(client, PHONE)).toBe("not_registered");
    expect(auth.resend).not.toHaveBeenCalled();
  });
});
