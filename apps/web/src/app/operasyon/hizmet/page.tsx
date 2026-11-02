import Link from "next/link";
import { day, money } from "@/components/back-office/parts";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/field";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Toolbar } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, pageOf } from "@/components/ui/pagination";
import { statusTone } from "@/components/ui/status";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { formatNumber } from "@/lib/i18n";
import { opsServicesText } from "@/lib/i18n/messages/ops-services";
import { opsOrgs } from "@/lib/operations/data";
import {
  listServiceRequests,
  listServiceTypes,
  serviceDemand,
  type ServiceDemandRow,
} from "@/lib/operations/service-data";
import { SERVICE_STATUSES, readQueueFilters, serviceHref } from "@/lib/operations/services";
import { opsHref } from "@/lib/operations/urls";
import { createClient } from "@/lib/supabase/server";
import styles from "./service.module.css";

const S = opsServicesText;
const NONE = "—";

// The service request queue (IP15, docs/personel-kilavuzu.md "Hizmet
// talepleri"): demand per service and season first (pre-requests are the
// signal for the next season), then the requests, open work first.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const params = await searchParams;
  const filters = readQueueFilters(params);
  const supabase = await createClient();
  const [rows, demand, types] = await Promise.all([
    listServiceRequests(supabase, filters),
    serviceDemand(supabase),
    opsOrgs(supabase, user.id).then((orgs) =>
      listServiceTypes(
        supabase,
        orgs.map((o) => o.id),
      ),
    ),
  ]);
  const seasons = [...new Set(demand.map((d) => d.season_year))].sort((a, b) => b - a);
  const shown = pageOf(rows, params.sayfa);
  const query = {
    hizmet: filters.serviceTypeId,
    sezon: filters.seasonYear ? String(filters.seasonYear) : null,
  };
  const pageHref = (p: number) => {
    const base = serviceHref.queue({ durum: filters.status, ...query });
    return `${base}${base.includes("?") ? "&" : "?"}sayfa=${p}`;
  };

  return (
    <main className="page">
      <PageHeader
        title={S.title}
        lead={S.lead}
        actions={
          <ButtonLink variant="secondary" href={serviceHref.catalog()}>
            {S.catalogLink}
          </ButtonLink>
        }
      />

      <Demand rows={demand} />

      <div>
        <Toolbar end={S.count(formatNumber(rows.length))}>
          <FilterTabs
            label={S.statusFilter}
            testId="service-status-filters"
            items={[null, ...SERVICE_STATUSES].map((status) => ({
              href: serviceHref.queue({ durum: status, ...query }),
              label: status ? S.status[status] : S.all,
              current: filters.status === status,
            }))}
          />
        </Toolbar>
        <form
          className={styles.filters}
          action={serviceHref.queue()}
          data-testid="service-filters"
          aria-label={S.filters}
        >
          {filters.status && <input type="hidden" name="durum" value={filters.status} />}
          <Field id="service-filter" label={S.serviceFilter}>
            <Select name="hizmet" defaultValue={filters.serviceTypeId ?? ""}>
              <option value="">{S.allServices}</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="season-filter" label={S.seasonFilter}>
            <Select
              name="sezon"
              defaultValue={filters.seasonYear ? String(filters.seasonYear) : ""}
            >
              <option value="">{S.allSeasons}</option>
              {seasons.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="secondary" type="submit">
            {S.apply}
          </Button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={S.empty}>
          <p>{S.emptyHint}</p>
        </EmptyState>
      ) : (
        <>
          <Table data-testid="service-queue">
            <thead>
              <tr>
                <th>{S.columns.number}</th>
                <th>{S.columns.parcel}</th>
                <th>{S.columns.requester}</th>
                <th>{S.columns.status}</th>
                <th>{S.columns.window}</th>
                <th>{S.columns.weed}</th>
                <th className={cell.num}>{S.columns.amount}</th>
                <th className={cell.num}>{S.columns.scheduled}</th>
                <th className={cell.num}>{S.columns.photos}</th>
                <th>{S.columns.payment}</th>
              </tr>
            </thead>
            <tbody>
              {shown.rows.map((r) => (
                <tr key={r.id} data-service-request-id={r.id} data-status={r.status}>
                  <td className={`${cell.code} ${cell.nowrap}`}>
                    <Link href={serviceHref.request(r.id)}>{r.number}</Link>
                    <span className={styles.sub}>{r.service_name}</span>
                    {r.robot_model_name && (
                      <span className={styles.sub} data-testid="service-robot-model">
                        {S.robotLine(r.robot_model_name)}
                      </span>
                    )}
                  </td>
                  <td className={cell.nowrap}>
                    <Link href={opsHref.parcel(r.parcel_id)}>{r.parcel_name}</Link>
                    <span className={styles.sub}>
                      {[r.village, r.district].filter(Boolean).join(", ") || NONE}
                    </span>
                  </td>
                  <td className={cell.nowrap}>
                    {r.requester_name ?? <span className="muted">{S.noName}</span>}
                    <span className={styles.sub}>
                      {r.requester_phone ? (
                        <a href={`tel:${r.requester_phone}`}>{r.requester_phone}</a>
                      ) : (
                        S.noPhone
                      )}
                    </span>
                  </td>
                  <td>
                    <span className={styles.badges}>
                      <Badge tone={statusTone(r.status)}>{S.status[r.status] ?? r.status}</Badge>
                      {r.early_performance_requested && <Badge>{S.early}</Badge>}
                      {r.status === "done" && r.performer && (
                        <Badge testId="service-performer">
                          {S.performedBy(S.performer[r.performer] ?? r.performer)}
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td>{S.window[r.preferred_window] ?? r.preferred_window}</td>
                  <td>
                    {r.recommended_weed_height
                      ? (S.weed[r.recommended_weed_height] ?? r.recommended_weed_height)
                      : NONE}
                  </td>
                  <td className={`${cell.num} ${cell.nowrap}`}>
                    {r.quote_total_kurus != null ? (
                      <>
                        {money(r.quote_total_kurus)}
                        <span className={styles.sub}>{S.quote}</span>
                      </>
                    ) : r.estimate_total_kurus != null ? (
                      <>
                        {money(r.estimate_total_kurus)}
                        <span className={styles.sub}>
                          {S.estimate}
                          {r.price_list_version != null && ` · v${r.price_list_version}`}
                        </span>
                      </>
                    ) : (
                      <Badge tone="warning">{S.noEstimate}</Badge>
                    )}
                  </td>
                  <td className={`${cell.num} ${cell.nowrap}`}>
                    {r.status === "done" ? day(r.completed_on) : day(r.scheduled_date)}
                  </td>
                  <td className={`${cell.num} ${cell.nowrap}`}>
                    {formatNumber(r.before_photos)} / {formatNumber(r.after_photos)}
                  </td>
                  <td className={cell.nowrap}>
                    {r.payment_received_on ? (
                      <Badge tone="success">{S.paid}</Badge>
                    ) : r.status === "done" ? (
                      <Badge tone="warning">{S.unpaid}</Badge>
                    ) : (
                      NONE
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination {...shown} href={pageHref} />
        </>
      )}
    </main>
  );
}

// Requests per service and season by status; pre-requests lead.
function Demand({ rows }: { rows: ServiceDemandRow[] }) {
  const C = S.demandColumns;
  return (
    <Panel plain title={S.demandTitle} description={S.demandLead} id="demand">
      {rows.length === 0 ? (
        <EmptyState compact headingLevel={3} title={S.demandEmpty} />
      ) : (
        <Table data-testid="service-demand">
          <thead>
            <tr>
              <th>{C.service}</th>
              <th className={cell.num}>{C.season}</th>
              <th className={cell.num}>{C.pre}</th>
              <th className={cell.num}>{C.requested}</th>
              <th className={cell.num}>{C.scheduled}</th>
              <th className={cell.num}>{C.done}</th>
              <th className={cell.num}>{C.cancelled}</th>
              <th className={cell.num}>{C.total}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={`${d.service_type_id}-${d.season_year}`}>
                <td className={cell.nowrap}>{d.service_name}</td>
                <td className={cell.num}>
                  <Link
                    href={serviceHref.queue({
                      hizmet: d.service_type_id,
                      sezon: String(d.season_year),
                    })}
                  >
                    {d.season_year}
                  </Link>
                </td>
                <td className={cell.num}>
                  <Link
                    className={styles.demandPre}
                    data-testid="demand-pre"
                    href={serviceHref.queue({
                      durum: "pre_request",
                      hizmet: d.service_type_id,
                      sezon: String(d.season_year),
                    })}
                  >
                    {formatNumber(d.pre_requests)}
                  </Link>
                </td>
                <td className={cell.num}>{formatNumber(d.requested)}</td>
                <td className={cell.num}>{formatNumber(d.scheduled)}</td>
                <td className={cell.num}>{formatNumber(d.done)}</td>
                <td className={cell.num}>{formatNumber(d.cancelled)}</td>
                <td className={cell.num}>{formatNumber(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}
