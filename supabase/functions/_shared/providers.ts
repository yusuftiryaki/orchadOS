// Message providers behind one interface. No SMS / WhatsApp provider has been
// contracted yet, so:
// - record: sends nothing, keeps the message in private.message_outbox
//   (development, tests, the hosted test project). The default.
// - netgsm: skeleton for Netgsm (Turkish SMS provider; REST v2, Basic auth,
//   approved sender header). Used only when NETGSM_USERCODE, NETGSM_PASSWORD
//   and NETGSM_MSGHEADER are all set and MESSAGE_PROVIDER is not "record".
//   It has no WhatsApp: WhatsApp messages go out as SMS (sent_via netgsm/sms).
//   Not yet tried against a live account.
//
// Errors are reason codes only (never the number or the provider's text).

import type { Channel } from "./messaging.ts";

export type Purpose = "notification" | "login_code";

export interface OutgoingMessage {
  to: string; // E.164
  channel: Channel;
  body: string;
  purpose: Purpose;
  notificationId?: string;
}

export type SendResult =
  | { ok: true; via: string; providerMessageId: string | null }
  | { ok: false; error: string; permanent: boolean };

export interface MessageProvider {
  name: string;
  send(message: OutgoingMessage): Promise<SendResult>;
}

// Writes to the outbox through the REST API with the given headers (the
// caller's service role token, or the function's own service role key).
export function recordProvider(supabaseUrl: string, headers: Record<string, string>): MessageProvider {
  return {
    name: "record",
    async send(message) {
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/message_outbox_record`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          p_channel: message.channel,
          p_recipient: message.to,
          p_body: message.body,
          p_purpose: message.purpose,
          p_notification_id: message.notificationId ?? null,
        }),
      });
      if (!res.ok) return { ok: false, error: `record_${res.status}`, permanent: false };
      const id = await res.json();
      return { ok: true, via: `record/${message.channel}`, providerMessageId: String(id) };
    },
  };
}

export interface NetgsmConfig {
  usercode: string;
  password: string;
  header: string;
}

// Netgsm result codes that will not get better by retrying.
const NETGSM_PERMANENT = new Set(["20", "30", "40", "41", "70"]);

export function netgsmProvider(config: NetgsmConfig): MessageProvider {
  const auth = btoa(`${config.usercode}:${config.password}`);
  return {
    name: "netgsm",
    async send(message) {
      let res: Response;
      try {
        res = await fetch("https://api.netgsm.com.tr/sms/rest/v2/send", {
          method: "POST",
          headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
          body: JSON.stringify({
            msgheader: config.header,
            encoding: "TR",
            iysfilter: "0", // informational (not commercial) messages
            messages: [{ msg: message.body, no: message.to.replace(/^\+/, "") }],
          }),
        });
      } catch {
        return { ok: false, error: "provider_unreachable", permanent: false };
      }
      if (!res.ok) return { ok: false, error: `provider_http:${res.status}`, permanent: false };
      const out = (await res.json().catch(() => null)) as { code?: unknown; jobid?: unknown } | null;
      const code = typeof out?.code === "string" ? out.code : "unknown";
      if (code !== "00") {
        const safe = /^[0-9a-z]{1,10}$/.test(code) ? code : "unknown";
        return { ok: false, error: `provider_error:${safe}`, permanent: NETGSM_PERMANENT.has(code) };
      }
      return {
        ok: true,
        via: "netgsm/sms",
        providerMessageId: typeof out?.jobid === "string" ? out.jobid.slice(0, 100) : null,
      };
    },
  };
}

export function netgsmConfig(env: (name: string) => string | undefined): NetgsmConfig | null {
  if ((env("MESSAGE_PROVIDER") ?? "").trim() === "record") return null;
  const usercode = env("NETGSM_USERCODE")?.trim();
  const password = env("NETGSM_PASSWORD")?.trim();
  const header = env("NETGSM_MSGHEADER")?.trim();
  return usercode && password && header ? { usercode, password, header } : null;
}

// The real provider when it is configured, otherwise the record provider.
export function chooseProvider(
  env: (name: string) => string | undefined,
  record: () => MessageProvider,
): MessageProvider {
  const netgsm = netgsmConfig(env);
  return netgsm ? netgsmProvider(netgsm) : record();
}
