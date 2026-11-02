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
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/field";
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
}: {
  ws: InventoryWorkspace;
  sessionId: string;
  // Slots named by a coding check.
  flaggedSlotIds: string[];
  panoramaSet: string | null;
  panoramas: ApprovalPanorama[];
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
          <div className={styles.mapFoot}>
            <InventoryMapLegend />
            <Checkbox
              id="approval-show-codes"
              label={t.inventory.showCodes}
              checked={showCodes}
              onChange={(ev) => setShowCodes(ev.target.checked)}
            />
          </div>
          <p className={styles.mapHint}>{e.mapClick}</p>
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
            parcelSpecies={ws.parcel.species}
            speciesOptions={ws.speciesOptions}
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
      <div id="dogrulama" className={styles.anchor}>
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
      </div>
    </>
  );
}

// Coverage of the inventory scan and, below the threshold, the expert's
// reasoned acceptance.
export function CoverageDetails({
  coverage,
  parcelId,
  sessionId,
  approved,
}: {
  // Newest coverage report of the inventory scan (null: none yet).
  coverage: CoverageSummary | null;
  parcelId: string;
  sessionId: string;
  approved: boolean;
}) {
  return (
    <section id="kapsama" className={styles.panel} data-testid="inventory-coverage">
      <h3>{e.approve.coverageTitle}</h3>
      <CoverageLine coverage={coverage} />
      {coverage?.waivedAt && coverage.waiverNote && (
        <p data-testid="coverage-waived">{e.approve.waived(coverage.waiverNote)}</p>
      )}
      {!approved && coverage && !coverage.passed && !coverage.waivedAt && (
        <WaiveForm parcelId={parcelId} sessionId={sessionId} />
      )}
    </section>
  );
}

function WaiveForm({ parcelId, sessionId }: { parcelId: string; sessionId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [result, setResult] = useState<WaiveCoverageResult | null>(null);
  const [pending, startTransition] = useTransition();
  const a = e.approve;
  return (
    <div className={styles.waiver} data-testid="coverage-waiver">
      <Field id="coverage-waiver-note" label={a.waiverLabel}>
        <Textarea
          rows={2}
          maxLength={2000}
          value={note}
          placeholder={a.waiverPlaceholder}
          onChange={(ev) => setNote(ev.target.value)}
        />
      </Field>
      <div>
        <Button
          variant="secondary"
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
        </Button>
      </div>
      {result && !result.ok && (
        <Alert tone="danger" role="alert">
          {a.waiverErrors[result.error] ?? a.waiverErrors.write_failed}
        </Alert>
      )}
    </div>
  );
}

// The signature. What blocks it (open verification items, coverage below the
// threshold, no slots) is listed first; signing stays closed until they are
// resolved.
export function ApproveForm({
  parcelId,
  sessionId,
  openItems,
  coverageBlocked,
  noSlots,
}: {
  parcelId: string;
  sessionId: string;
  openItems: number;
  coverageBlocked: boolean;
  noSlots: boolean;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<ApproveInventoryResult | null>(null);
  const [pending, startTransition] = useTransition();
  const a = e.approve;
  const blockers: { key: string; text: string; href?: string; link?: string }[] = [
    ...(noSlots ? [{ key: "slots", text: a.noSlots }] : []),
    ...(openItems > 0
      ? [{ key: "items", text: a.blockedOpen(openItems), href: "#dogrulama", link: a.openTours }]
      : []),
    ...(coverageBlocked
      ? [{ key: "coverage", text: a.coverageBlocked, href: "#kapsama", link: a.openCoverage }]
      : []),
  ];
  const blocked = blockers.length > 0;

  return (
    <section className={styles.signoff} data-testid="approve-inventory">
      <h2>{a.title}</h2>
      {blocked ? (
        <Alert tone="danger" title={a.blockedTitle} testId="approve-blockers">
          <ul className={styles.list}>
            {blockers.map((b) => (
              <li key={b.key}>
                {b.text} {b.href && <a href={b.href}>{b.link}</a>}
              </li>
            ))}
          </ul>
        </Alert>
      ) : (
        <p className={styles.hint}>{a.ready}</p>
      )}
      <Checkbox
        id="approve-confirm"
        label={a.confirm}
        checked={confirmed}
        disabled={blocked}
        onChange={(ev) => setConfirmed(ev.target.checked)}
        data-testid="approve-confirm"
      />
      <div>
        <Button
          disabled={blocked || !confirmed || pending}
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
        </Button>
      </div>
      {result?.ok && (
        <Alert tone="success" role="status" testId="approve-result">
          {a.done}
        </Alert>
      )}
      {result && !result.ok && (
        <Alert tone="danger" role="alert" title={a.errors[result.error]} testId="approve-error">
          {result.noSlots && <p>{a.noSlots}</p>}
          {result.openItems && result.openItems.length > 0 && (
            <p>{a.openItems(result.openItems.join(", "))}</p>
          )}
          {result.coverage && (
            <p>
              {a.coverageBelow(
                formatNumber(result.coverage.ratio * 100, 1),
                formatNumber(result.coverage.threshold * 100, 1),
              )}
            </p>
          )}
        </Alert>
      )}
    </section>
  );
}
