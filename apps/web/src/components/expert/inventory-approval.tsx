"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  approveInventoryAction,
  closeVerificationItemExpertAction,
  setTreeAttributesExpertAction,
  waiveCoverageAction,
} from "@/app/uzman/envanter/actions";
import { CoverageLine } from "@/components/expert/pipeline-checks";
import { InventoryMap, type InventoryMapSlot } from "@/components/office/inventory-map";
import { InventoryMapLegend } from "@/components/office/inventory-summary";
import { PanoramaViewer } from "@/components/office/panorama-viewer";
import { TreeAttributeEditor } from "@/components/office/tree-attribute-editor";
import { VerificationTours } from "@/components/office/verification-panel";
import styles from "@/components/office/inventory.module.css";
import type { ApproveInventoryResult, WaiveCoverageResult } from "@/lib/expert/inventory";
import type { CoverageSummary } from "@/lib/expert/pipeline-checks";
import { formatNumber, t } from "@/lib/i18n";
import type { InventoryWorkspace } from "@/lib/office/inventory-workspace";
import { bearingDeg, LocalFrame, wrap180 } from "@/lib/office/local-frame";

// Interactive part of the expert's inventory approval: the coded map with a
// panorama for spot checks, the tree attribute table (the expert corrects),
// the verification items, and the signature.

export interface ApprovalPanorama {
  id: string;
  lat: number;
  lon: number;
  headingDeg: number;
  hasPreview: boolean;
  hasFull: boolean;
}

const e = t.inventory.expert;
// Only panoramas this close to the tree are offered.
const MAX_PANORAMA_M = 25;

export function InventoryApproval({
  ws,
  sessionId,
  flaggedSlotIds,
  panoramaSet,
  panoramas,
  coverage = null,
}: {
  ws: InventoryWorkspace;
  sessionId: string;
  // Slots named by a coding check.
  flaggedSlotIds: string[];
  panoramaSet: string | null;
  panoramas: ApprovalPanorama[];
  // Newest coverage report of the inventory scan (null: none yet).
  coverage?: CoverageSummary | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [lookVersion, setLookVersion] = useState(0);
  const [showCodes, setShowCodes] = useState(false);

  const flagged = useMemo(() => {
    const open = ws.tours.flatMap((tour) =>
      tour.items.filter((i) => i.status === "open").map((i) => i.slotId),
    );
    return new Set([...flaggedSlotIds, ...open]);
  }, [ws.tours, flaggedSlotIds]);

  const mapSlots: InventoryMapSlot[] = ws.slots.flatMap((s) =>
    s.position
      ? [
          {
            id: s.id,
            code: s.code,
            position: s.position,
            state: !s.tree ? "empty" : s.kind === "interstitial" ? "interstitial" : "tree",
            selected: selected.has(s.id) || focus === s.id,
            flagged: flagged.has(s.id),
          },
        ]
      : [],
  );

  // Nearest panorama to the focused slot and the direction to look in.
  const view = useMemo(() => {
    const slot = ws.slots.find((s) => s.id === focus);
    if (!slot?.position || panoramas.length === 0 || !panoramaSet) return null;
    const frame = new LocalFrame(slot.position.lat, slot.position.lon);
    const best = panoramas
      .map((p) => {
        const v = frame.toLocal(p);
        return { p, d: Math.hypot(v.x, v.y), x: v.x, y: v.y };
      })
      .reduce((a, b) => (b.d < a.d ? b : a));
    if (best.d > MAX_PANORAMA_M) return { slot, panorama: null, distance: best.d };
    // From the panorama towards the tree: the negated offset.
    const yaw = wrap180(bearingDeg({ x: -best.x, y: -best.y }) - best.p.headingDeg);
    return { slot, panorama: best.p, distance: best.d, yaw };
  }, [focus, ws.slots, panoramas, panoramaSet]);

  const imageUrl = (panoramaId: string, variant: "2k" | "4k") =>
    `/uzman/envanter/${sessionId}/panorama/${encodeURIComponent(panoramaSet!)}/${encodeURIComponent(panoramaId)}/${variant}`;

  return (
    <>
      <div className={styles.layout}>
        <div className={styles.mapColumn}>
          <InventoryMap
            label={t.inventory.mapLabel}
            boundary={ws.boundaries[0]?.ring ?? null}
            slots={mapSlots}
            zones={ws.zones}
            showCodes={showCodes}
            onSlotClick={(id, additive) => {
              setFocus(id);
              setLookVersion((n) => n + 1);
              const slot = ws.slots.find((s) => s.id === id);
              if (!slot?.tree) return;
              setSelected((sel) => {
                const next = new Set(additive ? sel : []);
                if (additive && sel.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            testId="approval-map"
            height={460}
          />
          <InventoryMapLegend />
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={showCodes}
              onChange={(ev) => setShowCodes(ev.target.checked)}
            />
            {t.inventory.showCodes}
          </label>
        </div>
        <div className={styles.side}>
          <section className={styles.panel} data-testid="approval-panorama">
            <h2>{e.panorama.title}</h2>
            {panoramas.length === 0 || !panoramaSet ? (
              <p className="muted">{e.panorama.none}</p>
            ) : view?.panorama ? (
              <>
                <p className="muted">
                  {e.panorama.nearest(view.slot.code, view.distance.toFixed(1))}
                </p>
                <PanoramaViewer
                  url={imageUrl(view.panorama.id, view.panorama.hasPreview ? "2k" : "4k")}
                  fullUrl={
                    view.panorama.hasPreview && view.panorama.hasFull
                      ? imageUrl(view.panorama.id, "4k")
                      : null
                  }
                  panoramaId={view.panorama.id}
                  lookYawDeg={view.yaw ?? 0}
                  lookVersion={lookVersion}
                  markers={[]}
                  onClick={() => {}}
                  label={e.panorama.label}
                />
              </>
            ) : (
              <p className="muted">{e.panorama.hint}</p>
            )}
          </section>
          <TreeAttributeEditor
            slots={ws.slots}
            selected={selected}
            onSelectionChange={setSelected}
            showSex
            onApply={async (treeIds, attributes) => {
              const result = await setTreeAttributesExpertAction({
                parcelId: ws.parcel.id,
                treeIds,
                attributes,
              });
              if (result.ok) router.refresh();
              return result;
            }}
          />
        </div>
      </div>
      <VerificationTours
        tours={ws.tours}
        canRecord={false}
        canClose={!ws.approved}
        onRecord={async () => ({ ok: false, error: "forbidden" })}
        onClose={async (itemId, note) => {
          const result = await closeVerificationItemExpertAction({
            parcelId: ws.parcel.id,
            itemId,
            note,
          });
          if (result.ok) router.refresh();
          return result;
        }}
      />
      <section className={styles.panel} data-testid="inventory-coverage">
        <h2>{e.approve.coverageTitle}</h2>
        <CoverageLine coverage={coverage} />
        {coverage?.waivedAt && coverage.waiverNote && (
          <p data-testid="coverage-waived">{e.approve.waived(coverage.waiverNote)}</p>
        )}
        {!ws.approved && coverage && !coverage.passed && !coverage.waivedAt && (
          <WaiveForm parcelId={ws.parcel.id} sessionId={sessionId} />
        )}
      </section>
      {!ws.approved && (
        <ApproveForm
          parcelId={ws.parcel.id}
          sessionId={sessionId}
          ws={ws}
          coverageBlocked={!!coverage && !coverage.passed && !coverage.waivedAt}
        />
      )}
    </>
  );
}

function WaiveForm({ parcelId, sessionId }: { parcelId: string; sessionId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [result, setResult] = useState<WaiveCoverageResult | null>(null);
  const [pending, startTransition] = useTransition();
  const a = e.approve;
  return (
    <div data-testid="coverage-waiver">
      <label>
        {a.waiverLabel}
        <textarea
          rows={2}
          maxLength={2000}
          value={note}
          placeholder={a.waiverPlaceholder}
          onChange={(ev) => setNote(ev.target.value)}
        />
      </label>
      <p>
        <button
          type="button"
          className="button button-secondary"
          disabled={pending || note.trim() === ""}
          onClick={() =>
            startTransition(async () => {
              const r = await waiveCoverageAction(parcelId, sessionId, note);
              setResult(r);
              if (r.ok) router.refresh();
            })
          }
        >
          {a.waiverSubmit}
        </button>
      </p>
      {result && !result.ok && (
        <p className={styles.error} role="alert">
          {a.waiverErrors[result.error] ?? a.waiverErrors.write_failed}
        </p>
      )}
    </div>
  );
}

function ApproveForm({
  parcelId,
  sessionId,
  ws,
  coverageBlocked,
}: {
  parcelId: string;
  sessionId: string;
  ws: InventoryWorkspace;
  coverageBlocked: boolean;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<ApproveInventoryResult | null>(null);
  const [pending, startTransition] = useTransition();
  const open = ws.tours.reduce(
    (n, tour) => n + tour.items.filter((i) => i.status === "open").length,
    0,
  );
  const a = e.approve;

  return (
    <section className={styles.panel} data-testid="approve-inventory">
      <h2>{a.title}</h2>
      {open > 0 && <p className={styles.notice}>{a.blockedOpen(open)}</p>}
      {coverageBlocked && <p className={styles.notice}>{a.coverageBlocked}</p>}
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(ev) => setConfirmed(ev.target.checked)}
          data-testid="approve-confirm"
        />
        {a.confirm}
      </label>
      <p>
        <button
          type="button"
          className="button"
          disabled={!confirmed || pending}
          data-testid="approve-submit"
          onClick={() =>
            startTransition(async () => {
              const r = await approveInventoryAction(parcelId, sessionId);
              setResult(r);
              if (r.ok) router.refresh();
            })
          }
        >
          {pending ? a.submitting : a.submit}
        </button>
      </p>
      {result?.ok && (
        <p className={styles.success} role="status" data-testid="approve-result">
          {a.done}
        </p>
      )}
      {result && !result.ok && (
        <div className={styles.error} role="alert" data-testid="approve-error">
          <p className={styles.error}>{a.errors[result.error]}</p>
          {result.noSlots && <p className={styles.error}>{a.noSlots}</p>}
          {result.openItems && result.openItems.length > 0 && (
            <p className={styles.error}>{a.openItems(result.openItems.join(", "))}</p>
          )}
          {result.coverage && (
            <p className={styles.error}>
              {a.coverageBelow(
                formatNumber(result.coverage.ratio * 100, 1),
                formatNumber(result.coverage.threshold * 100, 1),
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
