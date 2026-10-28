"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveBoundaryAction } from "@/app/portal/parsel/[parcelId]/actions";
import { DemoNotice } from "@/components/demo/demo-notice";
import { InventoryMap } from "@/components/office/inventory-map";
import { demoText } from "@/lib/i18n/messages/demo";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import { m2ToDonum } from "@/lib/office/boundary";
import type { BoundaryCard } from "@/lib/portal/boundary";
import { BoundaryNotice, MapBoundaryCaption } from "./boundary-notice";
import styles from "./portal.module.css";

// Boundary card of the report card: the latest version on a map (the owner's
// first declaration faint underneath), its area and source, and the owner's
// approval. The card carries the boundary notice (H07): usage boundary, not
// a title, cadastre or ownership boundary.

const p = t.inventory.portal;

// A demo visitor (`demo`) sees the card without the approval.
export function BoundaryCardView({
  parcelId,
  card,
  demo = false,
}: {
  parcelId: string;
  card: BoundaryCard;
  demo?: boolean;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const latest = card.latest;

  return (
    <section className={styles.section} aria-labelledby="sinir-baslik" data-testid="boundary-card">
      <h2 id="sinir-baslik">{p.boundaryTitle}</h2>
      {!latest ? (
        <p className="muted">{p.noBoundary}</p>
      ) : (
        <>
          <p>
            <strong data-testid="boundary-area">
              {latest.areaM2 != null &&
                t.inventory.area(
                  formatNumber(latest.areaM2),
                  formatNumber(m2ToDonum(latest.areaM2), 2),
                )}
            </strong>
            <br />
            <span className="muted" data-testid="boundary-source">
              {p.version(latest.version, t.inventory.boundarySource[latest.source])}
              {latest.vertexUncertaintyM != null &&
                ` · ${p.uncertainty(formatNumber(latest.vertexUncertaintyM, 2))}`}
            </span>
          </p>
          <InventoryMap
            label={p.boundaryTitle}
            boundary={latest.ring}
            declaredBoundary={card.declared?.ring ?? null}
            height={260}
            testId="boundary-map"
          />
          <MapBoundaryCaption />
          {card.declared && <p className="muted">{p.declaredNote}</p>}
          <BoundaryNotice className={styles.notice} />
          {latest.approvedAt ? (
            <p data-testid="boundary-approved">
              ✓ {p.approved(formatDate(latest.approvedAt), latest.approvedByMe)}
            </p>
          ) : card.canApprove && demo ? (
            <DemoNotice text={demoText.closed.boundary} />
          ) : card.canApprove ? (
            <div className={styles.noPrint}>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  data-testid="boundary-confirm"
                />{" "}
                {p.confirm}
              </label>
              <p>
                <button
                  type="button"
                  className="button"
                  disabled={!confirmed || pending}
                  data-testid="boundary-approve"
                  onClick={() =>
                    startTransition(async () => {
                      const result = await approveBoundaryAction(parcelId, latest.id);
                      setError(result.ok ? null : result.error);
                      if (result.ok) router.refresh();
                    })
                  }
                >
                  {pending ? p.approving : p.approve}
                </button>
              </p>
              {error && (
                <p role="alert" className={styles.danger}>
                  {error === "demo_read_only" ? demoText.closed.boundary : p.approveError}
                </p>
              )}
            </div>
          ) : card.awaitingApproval ? (
            <p className="muted" data-testid="boundary-awaiting">
              {p.awaiting} {card.role === "viewer" && p.viewerCannot}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
