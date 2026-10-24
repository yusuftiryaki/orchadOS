import Link from "next/link";
import { planFollowupsAction } from "@/app/operasyon/actions";
import type { Followup } from "@/lib/expert/followups";
import { formatDate, t } from "@/lib/i18n";
import type { Visit } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import styles from "./operations.module.css";

// Open follow-up requests of the experts, and the extra visits the processing
// pipeline asks for when a scan's coverage is below its threshold. Verification
// and extra-visit requests are linked to a visit ops plans; close-up requests
// ride on the next scan's close-up list by themselves.

const f = t.expert.followups;
const T = t.operations.dashboard;

export function ExpertRequests({
  followups,
  parcels,
  visits,
}: {
  followups: Followup[];
  parcels: Map<string, string>;
  // Planned visits, to link a request to.
  visits: Visit[];
}) {
  return (
    <section className={styles.section} data-testid="expert-requests">
      <h2>{T.requests}</h2>
      <p className="muted">{T.requestsHint}</p>
      <ul className={styles.plainList}>
        {followups.map((item) => {
          const candidates = visits.filter(
            (v) =>
              v.parcel_id === item.parcelId &&
              v.status === "planned" &&
              (item.kind !== "verification" || v.kind === "verification"),
          );
          return (
            <li
              key={item.id}
              data-followup-kind={item.kind}
              data-followup-status={item.status}
              data-followup-origin={item.origin}
            >
              <p>
                <strong>{f.kinds[item.kind]}</strong> · {f.origin[item.origin]} ·{" "}
                <Link href={opsHref.parcel(item.parcelId)}>
                  {parcels.get(item.parcelId) ?? "?"}
                </Link>{" "}
                · {f.status[item.status]} · {formatDate(item.createdAt)}
                {item.note && <span className="muted"> · {item.note}</span>}
              </p>
              {item.kind === "closeup" ? (
                <p className="muted">{T.closeupAuto}</p>
              ) : item.status === "open" ? (
                candidates.length > 0 ? (
                  <form action={planFollowupsAction} className={styles.inline}>
                    <input type="hidden" name="request_id" value={item.id} />
                    <label>
                      {T.linkVisit}
                      <select name="session_id" required defaultValue={candidates[0].id}>
                        {candidates.map((v) => (
                          <option key={v.id} value={v.id}>
                            {t.operations.visitKind[
                              v.kind as keyof typeof t.operations.visitKind
                            ] ?? v.kind}{" "}
                            · {v.planned_date ? formatDate(v.planned_date) : "—"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="button" type="submit">
                      {T.link}
                    </button>
                  </form>
                ) : (
                  <Link className="button button-secondary" href={opsHref.newVisit(item.parcelId)}>
                    {item.kind === "verification" ? T.planVerification : T.planVisit}
                  </Link>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
