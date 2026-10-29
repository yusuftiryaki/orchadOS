import { money } from "@/components/back-office/parts";
import type { CustomerList } from "@/lib/back-office/data";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import { maskPhone } from "@/lib/notifications/phone";
import type { OwnerProfile } from "@/lib/operations/data";

const T = t.operations;

// One row of the owners list, ready to show: built on the server, so the
// browser gets only masked phones and no e-mail.
export interface CustomerListRow {
  profileId: string;
  name: string;
  phone: string;
  self: boolean;
  parcels: string;
  openOrders: string;
  paid: string;
  contact: string;
  kvkk: string;
  // The KVKK notice was given (and when): "Yok" is shown as a warning.
  kvkkOk: boolean;
}

export interface CustomerListView {
  rows: CustomerListRow[];
  // An org returned the full 1000 rows: older profiles are not shown.
  truncated: boolean;
}

// ops_customers rows with the contact preference and KVKK consent of
// ops_owner_profiles; `selfOnly` keeps the self-service sign-ups.
export function customerListView(
  list: CustomerList,
  profiles: OwnerProfile[],
  selfOnly: boolean,
): CustomerListView {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return {
    truncated: list.truncated,
    rows: list.rows
      .filter((c) => !selfOnly || c.signup_source === "self")
      .map((c) => {
        const p = byId.get(c.profile_id);
        const kvkkOk = Boolean(p?.kvkk_consent && p.kvkk_consent_at);
        return {
          profileId: c.profile_id,
          name: c.full_name,
          phone: maskPhone(c.phone),
          self: c.signup_source === "self",
          parcels: formatNumber(c.parcel_count),
          openOrders: formatNumber(c.open_order_count),
          paid: money(c.paid_kurus),
          contact: p
            ? (T.contactPreference[p.contact_preference as keyof typeof T.contactPreference] ??
              p.contact_preference)
            : "",
          kvkk:
            kvkkOk && p?.kvkk_consent_at
              ? T.owners.consentYes(formatDate(p.kvkk_consent_at), p.kvkk_text_version ?? "")
              : T.owners.consentNo,
          kvkkOk,
        };
      }),
  };
}
