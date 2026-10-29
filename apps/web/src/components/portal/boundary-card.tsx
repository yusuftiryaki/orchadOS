"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveBoundaryAction } from "@/app/portal/parsel/[parcelId]/actions";
import { DemoNotice } from "@/components/demo/demo-notice";
import { InventoryMap } from "@/components/office/inventory-map";
import { demoText } from "@/lib/i18n/messages/demo";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import { m2ToDonum } from "@/lib/office/boundary";
import { BOUNDARY_DECLARATION, type BoundaryCard } from "@/lib/portal/boundary";
import { Panel } from "@/components/ui/panel";
import { BoundaryNotice, MapBoundaryCaption } from "./boundary-notice";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import layout from "./page.module.css";
import styles from "./parcel.module.css";

// Boundary card of the report card: the latest version on a map (the owner's
// first declaration faint underneath), its area and source, and the owner's
// approval. The card carries the boundary notice (H07): usage boundary, not
// a title, cadastre or ownership boundary.

const p = t.inventory.portal;

// A demo visitor (`demo`) sees the card without the approval. The parcel
// page shows the long notice once by its health map and passes
// `notice={false}`; the map, while the boundary waits for approval, keeps its
// short caption.
export function BoundaryCardView({
  parcelId,
  card,
  demo = false,
  notice = true,
}: {
  parcelId: string;
  card: BoundaryCard;
  demo?: boolean;
  notice?: boolean;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  // T16: the boundary declaration, when the org asks for it.
  const [declared, setDeclared] = useState(false);
  const needsDeclaration = card.declarationRequired === true;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const latest = card.latest;

  return (
    <Panel title={p.boundaryTitle} headingLevel={3} testId="boundary-card">
      {card.disputeOpen && (
        <Alert tone="warning" role="status" testId="boundary-dispute">
          <p>{t.legal.dispute.portalNotice}</p>
        </Alert>
      )}
      {!latest ? (
        <p className="muted">{p.noBoundary}</p>
      ) : (
        <>
          <div className={layout.stack}>
            <p>
              <strong data-testid="boundary-area">
                {latest.areaM2 != null &&
                  t.inventory.area(
                    formatNumber(latest.areaM2),
                    formatNumber(m2ToDonum(latest.areaM2), 2),
                  )}
              </strong>
            </p>
            <p className={`${styles.small} muted`} data-testid="boundary-source">
              {p.version(latest.version, t.inventory.boundarySource[latest.source])}
              {latest.vertexUncertaintyM != null &&
                `, ${p.uncertainty(formatNumber(latest.vertexUncertaintyM, 2)).toLocaleLowerCase("tr")}`}
            </p>
          </div>
          {/* Once approved, the health map shows the boundary; the card's own
              map is for checking it before the approval. */}
          {!latest.approvedAt && (
            <div className={layout.stack}>
              <InventoryMap
                label={p.boundaryTitle}
                boundary={latest.ring}
                declaredBoundary={card.declared?.ring ?? null}
                height={260}
                testId="boundary-map"
              />
              <MapBoundaryCaption />
              {card.declared && <p className={`${styles.small} muted`}>{p.declaredNote}</p>}
            </div>
          )}
          {notice && <BoundaryNotice />}
          {latest.approvedAt ? (
            <p className={styles.better} data-testid="boundary-approved">
              ✓ {p.approved(formatDate(latest.approvedAt), latest.approvedByMe)}
            </p>
          ) : card.canApprove && demo ? (
            <DemoNotice text={demoText.closed.boundary} />
          ) : card.canApprove ? (
            <div className={`${styles.form} ${styles.noPrint}`}>
              <Checkbox
                id={`boundary-confirm-${latest.id}`}
                label={p.confirm}
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                data-testid="boundary-confirm"
              />
              {needsDeclaration && (
                <Checkbox
                  id={`boundary-declaration-${latest.id}`}
                  label={BOUNDARY_DECLARATION}
                  checked={declared}
                  onChange={(e) => setDeclared(e.target.checked)}
                  data-testid="boundary-declaration"
                />
              )}
              <div className={styles.formActions}>
                <Button
                  disabled={!confirmed || (needsDeclaration && !declared) || pending}
                  data-testid="boundary-approve"
                  onClick={() =>
                    startTransition(async () => {
                      const result = await approveBoundaryAction(
                        parcelId,
                        latest.id,
                        needsDeclaration && declared,
                      );
                      setError(result.ok ? null : result.error);
                      if (result.ok) router.refresh();
                    })
                  }
                >
                  {pending ? p.approving : p.approve}
                </Button>
              </div>
              {error && (
                <Alert tone="danger" role="alert">
                  <p>{error === "demo_read_only" ? demoText.closed.boundary : p.approveError}</p>
                </Alert>
              )}
            </div>
          ) : card.awaitingApproval ? (
            <p className="muted" data-testid="boundary-awaiting">
              {p.awaiting} {card.role === "viewer" && p.viewerCannot}
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}
