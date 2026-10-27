import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, BoResultNotice, Facts, day, when } from "@/components/back-office/parts";
import bo from "@/components/back-office/back-office.module.css";
import { QuoteLines } from "@/components/back-office/quote-lines";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { getQuote, userName } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { bpToPercent } from "@/lib/back-office/validation";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.quote;

// A quote, read only and printable (the internal block is not printed).
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSection("operasyon");
  const { id } = await params;
  const supabase = await createClient();
  const view = await getQuote(supabase, id);
  if (!view) notFound();
  const { quote: q, items, internal } = view;

  return (
    <main className="page">
      <div className={bo.noPrint}>
        <OpsNav current="applications" />
        {q.application_id && (
          <p>
            <Link href={boHref.application(q.application_id)}>← {T.application}</Link>
          </p>
        )}
      </div>
      <h1>{T.title(q.number)}</h1>
      <div className={bo.noPrint}>
        <BoResultNotice params={await searchParams} />
        <p className="muted">{T.printHint}</p>
      </div>
      <Facts
        testId="quote-facts"
        rows={[
          [
            B.applications.status,
            <Badge key="s" labels={billingText.quoteStatus} value={q.status} />,
          ],
          [T.customer, view.customerName],
          [
            T.package,
            `${q.package_name} (${q.periodic_visits_per_year} ${T.visits.toLowerCase()})`,
          ],
          [T.firstYear, q.first_year ? B.yes : B.no],
          [
            T.priceList(q.price_list_version),
            q.inputs && typeof q.inputs === "object"
              ? String((q.inputs as Record<string, unknown>).formula ?? "")
              : "",
          ],
          [T.issuedAt, when(q.issued_at)],
          [T.validUntil, day(q.valid_until)],
          [T.start, day(q.proposed_service_start)],
          ...(q.discount_bp > 0
            ? ([
                [T.discount, `%${bpToPercent(q.discount_bp)}`],
                [T.discountNote, q.discount_note],
              ] as [string, string | null][])
            : []),
          [T.noteToCustomer, q.note_to_customer],
          ...(view.orderId
            ? ([
                [
                  T.order,
                  <Link key="o" href={boHref.order(view.orderId)}>
                    {T.order}
                  </Link>,
                ],
              ] as [string, React.ReactNode][])
            : []),
          ...(q.renewal_of_order_id
            ? ([
                [
                  B.order.renewalOf,
                  <Link key="r" href={boHref.order(q.renewal_of_order_id)}>
                    {B.order.renewalOf}
                  </Link>,
                ],
              ] as [string, React.ReactNode][])
            : []),
        ]}
      />
      <QuoteLines testId="quote-lines" lines={items} vatRateBp={q.vat_rate_bp} />
      <section className={`${styles.section} ${bo.noPrint}`}>
        <h2>{B.internal}</h2>
        <Facts
          rows={[
            [T.issuedBy, userName(internal.issued_by) ?? B.none],
            [T.decidedBy, userName(internal.decided_by) ?? B.none],
          ]}
        />
      </section>
    </main>
  );
}
