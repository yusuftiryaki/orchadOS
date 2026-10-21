import { locale, t } from "@/lib/i18n";

const T = t.notifications;

// Time of a queue event, Turkey time (operations works on Turkish days).
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Istanbul",
  }).format(new Date(iso));
}

// The sender's reason code as text: known codes, provider codes, else the code.
export function errorLabel(code: string | null): string | null {
  if (!code) return null;
  if (T.errors[code]) return T.errors[code];
  const provider = /^provider_(?:error|http):(.+)$/.exec(code);
  if (provider) return T.providerError(provider[1]);
  return code;
}
