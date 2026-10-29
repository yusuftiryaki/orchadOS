"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useMemo,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  addZoneAction,
  closeVerificationItemAction,
  createVerificationTourAction,
  deleteZoneAction,
  recordVerificationResultAction,
  saveBoundaryAction,
  setTreeAttributesAction,
} from "@/app/ofis/parsel/[parcelId]/envanter/duzenle/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { cell, Table } from "@/components/ui/table";
import type { Database } from "@/lib/database.types";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import { boundaryProblem, m2ToDonum, openRing, ringAreaM2 } from "@/lib/office/boundary";
import type { EditResult } from "@/lib/office/inventory-edits";
import {
  INFRASTRUCTURE_KINDS,
  POINT_ZONE_KINDS,
  slotsWithOpenItems,
  WORKSPACE_TABS,
  type InventoryWorkspace,
  type WorkspaceTab,
} from "@/lib/office/inventory-workspace";
import type { LatLon } from "@/lib/office/local-frame";
import {
  sortReasons,
  verificationCandidates,
  type VerificationReason,
} from "@/lib/office/verification-candidates";
import { InventoryMap, type InventoryMapSlot } from "./inventory-map";
import { InventoryMapLegend } from "./inventory-summary";
import { TreeAttributeEditor } from "./tree-attribute-editor";
import { VerificationTours } from "./verification-panel";
import styles from "./inventory.module.css";

// Office work after the triangulation tool has saved the slots (MVP Module 2,
// steps 6-8): tree attributes, infrastructure, the boundary drawn on the scan
// track until the field app marks corners, and the verification tour. One map
// on the left; what a click on it does depends on the tab.

type ZoneKind = Database["public"]["Enums"]["zone_kind"];
const o = t.inventory.office;
const v = t.inventory.verification;

interface Pick {
  slotId: string;
  code: string;
  hasTree: boolean;
  reasons: Set<VerificationReason>;
  note: string;
  included: boolean;
  manual: boolean;
}

function errorText(result: EditResult): string | null {
  return result.ok ? null : (t.inventory.errors[result.error] ?? result.error);
}

export function InventoryWorkspaceView({
  ws,
  track,
  canDeleteZones,
  initialTab,
}: {
  ws: InventoryWorkspace;
  track: LatLon[];
  canDeleteZones: boolean;
  initialTab: WorkspaceTab;
}) {
  const router = useRouter();
  const parcelId = ws.parcel.id;
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCodes, setShowCodes] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Infrastructure being drawn.
  const [zoneKind, setZoneKind] = useState<ZoneKind>("well");
  const [zoneName, setZoneName] = useState("");
  const [zonePoints, setZonePoints] = useState<LatLon[]>([]);
  const [zoneToDelete, setZoneToDelete] = useState<InventoryWorkspace["zones"][number] | null>(
    null,
  );
  // Boundary being drawn.
  const [ring, setRing] = useState<LatLon[]>([]);
  const [uncertainty, setUncertainty] = useState(0.5);

  // Verification list: computed candidates plus slots added on the map.
  const openSlots = useMemo(() => slotsWithOpenItems(ws.tours), [ws.tours]);
  const initialPicks = useMemo(() => {
    const candidates = verificationCandidates(
      ws.slots.map((s) => ({ ...s, treeId: s.tree?.id ?? null })),
      { exclude: openSlots },
    );
    return new Map<string, Pick>(
      candidates.map((c) => [
        c.slotId,
        {
          slotId: c.slotId,
          code: c.code,
          hasTree: c.treeId !== null,
          reasons: new Set(c.reasons),
          note: "",
          included: true,
          manual: false,
        },
      ]),
    );
  }, [ws.slots, openSlots]);
  const [picks, setPicks] = useState(initialPicks);
  // A refresh after a write recomputes the list (new tour, closed items).
  const [picksFrom, setPicksFrom] = useState(initialPicks);
  if (picksFrom !== initialPicks) {
    setPicksFrom(initialPicks);
    setPicks(initialPicks);
  }
  const [plannedDate, setPlannedDate] = useState("");

  const finish = useCallback(
    (result: EditResult, okText: string) => {
      const error = errorText(result);
      setMessage(error ? { ok: false, text: error } : { ok: true, text: okText });
      if (result.ok) router.refresh();
      return result.ok;
    },
    [router],
  );

  const slotById = useMemo(() => new Map(ws.slots.map((s) => [s.id, s])), [ws.slots]);
  const mapSlots: InventoryMapSlot[] = useMemo(
    () =>
      ws.slots.flatMap((s) =>
        s.position
          ? [
              {
                id: s.id,
                code: s.code,
                position: s.position,
                state: !s.tree ? "empty" : s.kind === "interstitial" ? "interstitial" : "tree",
                selected:
                  tab === "attributes"
                    ? selected.has(s.id)
                    : tab === "verification"
                      ? Boolean(picks.get(s.id)?.included)
                      : false,
                flagged: openSlots.has(s.id),
              } satisfies InventoryMapSlot,
            ]
          : [],
      ),
    [ws.slots, tab, selected, picks, openSlots],
  );

  const latestBoundary = ws.boundaries[0] ?? null;

  // --- map clicks ----------------------------------------------------------

  const saveZone = (points: LatLon[]) => {
    startTransition(async () => {
      const result = await addZoneAction({ parcelId, kind: zoneKind, name: zoneName, points });
      if (finish(result, o.infrastructure.added)) {
        setZonePoints([]);
        setZoneName("");
      }
    });
  };

  const onMapClick = (p: LatLon) => {
    setMessage(null);
    if (tab === "infrastructure") {
      if (POINT_ZONE_KINDS.includes(zoneKind)) saveZone([p]);
      else setZonePoints((pts) => [...pts, p]);
    } else if (tab === "boundary") {
      setRing((r) => [...r, p]);
    }
  };

  const onSlotClick = (id: string, additive: boolean) => {
    if (tab === "attributes") {
      const slot = slotById.get(id);
      if (!slot?.tree) return;
      setSelected((sel) => {
        const next = new Set(additive ? sel : sel.has(id) ? sel : []);
        if (sel.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else if (tab === "verification") {
      if (openSlots.has(id)) return;
      setPicks((current) => {
        const next = new Map(current);
        const existing = next.get(id);
        const slot = slotById.get(id)!;
        if (existing) next.set(id, { ...existing, included: !existing.included });
        else
          next.set(id, {
            slotId: id,
            code: slot.code,
            hasTree: Boolean(slot.tree),
            reasons: new Set<VerificationReason>(["other"]),
            note: "",
            included: true,
            manual: true,
          });
        return next;
      });
    }
  };

  const clickableSlots = tab === "attributes" || tab === "verification";

  // --- verification --------------------------------------------------------

  const pickList = [...picks.values()].sort(
    (a, b) =>
      ws.slots.findIndex((s) => s.id === a.slotId) - ws.slots.findIndex((s) => s.id === b.slotId),
  );
  const included = pickList.filter((p) => p.included);
  const updatePick = (id: string, change: (p: Pick) => Pick) =>
    setPicks((current) => new Map(current).set(id, change(current.get(id)!)));
  const toggleReason = (id: string, reason: VerificationReason) =>
    updatePick(id, (p) => {
      const reasons = new Set(p.reasons);
      if (reasons.has(reason)) reasons.delete(reason);
      else reasons.add(reason);
      if (reasons.size === 0) reasons.add("other");
      return { ...p, reasons };
    });

  const createTour = () => {
    startTransition(async () => {
      const result = await createVerificationTourAction({
        parcelId,
        plannedDate: plannedDate || null,
        items: included.map((p) => ({
          slotId: p.slotId,
          reasons: sortReasons(p.reasons),
          note: p.note || null,
        })),
      });
      finish(result, result.ok ? v.created(result.items) : "");
    });
  };

  // --- boundary ------------------------------------------------------------

  const areaM2 = ring.length >= 3 ? ringAreaM2(ring) : 0;
  const problem = ring.length > 0 ? boundaryProblem(ring) : "too_few_points";
  const saveRing = () => {
    startTransition(async () => {
      const result = await saveBoundaryAction({
        parcelId,
        ring,
        vertexUncertaintyM: uncertainty,
        sessionId: ws.inventorySession?.id ?? null,
      });
      if (finish(result, result.ok ? o.boundary.saved(result.version) : "")) setRing([]);
    });
  };

  const selectTab = (name: WorkspaceTab) => {
    setTab(name);
    setMessage(null);
    // Keep ?sekme= in step with the open tab, without a server round trip.
    const url = new URL(window.location.href);
    url.searchParams.set("sekme", name);
    window.history.replaceState(window.history.state, "", url);
  };
  const tabId = (name: WorkspaceTab) => `workspace-tab-${name}`;
  const onTabKey = (event: ReactKeyboardEvent, index: number) => {
    const last = WORKSPACE_TABS.length - 1;
    const next =
      event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    selectTab(WORKSPACE_TABS[next]);
    document.getElementById(tabId(WORKSPACE_TABS[next]))?.focus();
  };

  return (
    <div className={styles.layout}>
      <div className={styles.mapColumn}>
        <InventoryMap
          label={t.inventory.mapLabel}
          boundary={latestBoundary?.ring ?? null}
          slots={mapSlots}
          zones={ws.zones}
          track={track}
          draft={
            tab === "boundary"
              ? { points: ring, closed: true }
              : tab === "infrastructure"
                ? { points: zonePoints, closed: false }
                : null
          }
          showCodes={showCodes}
          onMapClick={onMapClick}
          onSlotClick={clickableSlots ? onSlotClick : undefined}
          testId="workspace-map"
        />
        <div className={styles.mapFoot}>
          <InventoryMapLegend track={track.length > 0} />
          <Checkbox
            id="workspace-show-codes"
            label={t.inventory.showCodes}
            checked={showCodes}
            onChange={(e) => setShowCodes(e.target.checked)}
          />
        </div>
        <p className={styles.mapHint}>{o.mapClick[tab]}</p>
      </div>

      <div className={styles.side}>
        <div role="tablist" aria-label={o.tabsLabel} className={styles.tabs}>
          {WORKSPACE_TABS.map((name, i) => (
            <button
              key={name}
              type="button"
              role="tab"
              id={tabId(name)}
              aria-controls={tab === name ? "workspace-panel" : undefined}
              aria-selected={tab === name}
              tabIndex={tab === name ? 0 : -1}
              className={styles.tab}
              onClick={() => selectTab(name)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {o.tabs[name]}
            </button>
          ))}
        </div>
        {message && message.text && (
          <Alert
            tone={message.ok ? "success" : "danger"}
            role={message.ok ? "status" : "alert"}
            testId="workspace-message"
          >
            {message.text}
          </Alert>
        )}

        <div
          role="tabpanel"
          id="workspace-panel"
          aria-labelledby={tabId(tab)}
          className={styles.tabPanel}
        >
          {tab === "attributes" && (
            <TreeAttributeEditor
              slots={ws.slots}
              selected={selected}
              onSelectionChange={setSelected}
              onApply={async (treeIds, attributes) => {
                const result = await setTreeAttributesAction({ parcelId, treeIds, attributes });
                if (result.ok) router.refresh();
                return result;
              }}
            />
          )}

          {tab === "infrastructure" && (
            <section className={styles.panel} data-testid="infrastructure">
              <h2>{o.infrastructure.title}</h2>
              <p className={styles.hint}>{o.infrastructure.hint}</p>
              <div className={styles.fields}>
                <Field id="zone-kind" label={o.infrastructure.kind}>
                  <Select
                    value={zoneKind}
                    onChange={(e) => {
                      setZoneKind(e.target.value as ZoneKind);
                      setZonePoints([]);
                    }}
                    data-testid="zone-kind"
                  >
                    {INFRASTRUCTURE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {t.inventory.zoneKinds[k]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="zone-name" label={o.infrastructure.name}>
                  <Input
                    value={zoneName}
                    onChange={(e) => setZoneName(e.target.value)}
                    maxLength={200}
                  />
                </Field>
              </div>
              {!POINT_ZONE_KINDS.includes(zoneKind) && (
                <div className={styles.toolbar}>
                  <span className={styles.status}>{o.boundary.vertices(zonePoints.length)}</span>
                  <Button
                    disabled={pending || zonePoints.length < 2}
                    onClick={() => saveZone(zonePoints)}
                  >
                    {o.infrastructure.finish}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={zonePoints.length === 0}
                    onClick={() => setZonePoints((p) => p.slice(0, -1))}
                  >
                    {o.infrastructure.undo}
                  </Button>
                  <Button
                    variant="quiet"
                    disabled={zonePoints.length === 0}
                    onClick={() => setZonePoints([])}
                  >
                    {o.infrastructure.cancel}
                  </Button>
                </div>
              )}
              <h3>{o.infrastructure.list}</h3>
              {ws.zones.length === 0 ? (
                <p className={styles.hint}>{o.infrastructure.none}</p>
              ) : (
                <Table data-testid="zone-list">
                  <thead>
                    <tr>
                      <th>{o.infrastructure.columns.kind}</th>
                      <th>{o.infrastructure.columns.name}</th>
                      {canDeleteZones && (
                        <th>
                          <span className="sr-only">{o.infrastructure.columns.actions}</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {ws.zones.map((z) => (
                      <tr key={z.id}>
                        <td>{t.inventory.zoneKinds[z.kind]}</td>
                        <td>{z.name ?? ""}</td>
                        {canDeleteZones && (
                          <td className={styles.rowAction}>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={pending}
                              onClick={() => setZoneToDelete(z)}
                            >
                              {o.infrastructure.delete}
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
              {!canDeleteZones && ws.zones.length > 0 && (
                <p className={styles.hint}>{o.infrastructure.deleteOpsOnly}</p>
              )}
              <Dialog
                open={zoneToDelete !== null}
                onClose={() => setZoneToDelete(null)}
                title={o.infrastructure.deleteTitle}
                closeLabel={o.infrastructure.deleteCancel}
                footer={
                  <>
                    <Button variant="secondary" onClick={() => setZoneToDelete(null)}>
                      {o.infrastructure.deleteCancel}
                    </Button>
                    <Button
                      variant="danger"
                      disabled={pending}
                      onClick={() => {
                        const zone = zoneToDelete;
                        setZoneToDelete(null);
                        if (!zone) return;
                        startTransition(async () => {
                          finish(
                            await deleteZoneAction({ parcelId, zoneId: zone.id }),
                            o.infrastructure.deleted,
                          );
                        });
                      }}
                    >
                      {o.infrastructure.deleteConfirm}
                    </Button>
                  </>
                }
              >
                <p>
                  {zoneToDelete &&
                    o.infrastructure.deleteBody(
                      zoneToDelete.name
                        ? `${t.inventory.zoneKinds[zoneToDelete.kind]} “${zoneToDelete.name}”`
                        : t.inventory.zoneKinds[zoneToDelete.kind],
                    )}
                </p>
              </Dialog>
            </section>
          )}

          {tab === "boundary" && (
            <section className={styles.panel} data-testid="boundary-editor">
              <h2>{o.boundary.title}</h2>
              <p className={styles.hint}>{o.boundary.hint}</p>
              <div className={styles.toolbar}>
                <span className={styles.status} data-testid="boundary-vertices">
                  {o.boundary.vertices(ring.length)}
                </span>
                {areaM2 > 0 && (
                  <strong data-testid="boundary-area">
                    {t.inventory.areaShort(
                      formatNumber(areaM2),
                      formatNumber(m2ToDonum(areaM2), 2),
                    )}
                  </strong>
                )}
              </div>
              <div className={styles.toolbar}>
                <Field id="boundary-uncertainty" label={o.boundary.uncertainty}>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={uncertainty}
                    onChange={(e) => setUncertainty(Number(e.target.value))}
                    data-testid="boundary-uncertainty"
                    className={styles.narrow}
                  />
                </Field>
                <Button
                  variant="secondary"
                  disabled={ring.length === 0}
                  onClick={() => setRing((r) => r.slice(0, -1))}
                >
                  {o.boundary.undo}
                </Button>
                <Button variant="quiet" disabled={ring.length === 0} onClick={() => setRing([])}>
                  {o.boundary.clear}
                </Button>
                {latestBoundary && (
                  <Button
                    variant="secondary"
                    onClick={() => setRing(openRing(latestBoundary.ring))}
                  >
                    {o.boundary.copyLatest}
                  </Button>
                )}
              </div>
              {ring.length > 0 && problem && (
                <p className={styles.error}>{t.inventory.errors[problem]}</p>
              )}
              <div>
                <Button
                  disabled={pending || problem !== null || !(uncertainty >= 0)}
                  onClick={saveRing}
                  data-testid="boundary-save"
                >
                  {o.boundary.save}
                </Button>
              </div>
              <h3>{o.boundary.versions}</h3>
              {ws.boundaries.length === 0 ? (
                <p className={styles.hint}>{o.boundary.noVersions}</p>
              ) : (
                <Table data-testid="boundary-versions">
                  <thead>
                    <tr>
                      <th>{o.boundary.columns.version}</th>
                      <th>{o.boundary.columns.source}</th>
                      <th className={cell.num}>{o.boundary.columns.area}</th>
                      <th>{o.boundary.columns.approval}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ws.boundaries.map((b) => (
                      <tr key={b.id}>
                        <td className={cell.code}>{o.boundary.version(b.version)}</td>
                        <td>{t.inventory.boundarySource[b.source]}</td>
                        <td className={cell.num}>
                          {b.areaM2 != null
                            ? t.inventory.areaShort(
                                formatNumber(b.areaM2),
                                formatNumber(m2ToDonum(b.areaM2), 2),
                              )
                            : "—"}
                        </td>
                        <td>
                          {b.ownerApprovedAt ? (
                            <Badge tone="success">
                              {o.boundary.approvedOn(formatDate(b.ownerApprovedAt))}
                            </Badge>
                          ) : (
                            <Badge tone="warning">{o.boundary.notApproved}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </section>
          )}

          {tab === "verification" && (
            <div className={styles.stack}>
              <section className={styles.panel} data-testid="verification-create">
                <h2>{v.title}</h2>
                <p className={styles.hint}>{v.hint}</p>
                <h3>{v.candidates}</h3>
                <p className={styles.hint}>{v.candidatesHint}</p>
                {pickList.length === 0 ? (
                  <p className={styles.hint}>{v.noCandidates}</p>
                ) : (
                  <div className={styles.scroll}>
                    <Table data-testid="candidate-table">
                      <thead>
                        <tr>
                          <th>
                            <span className="sr-only">{t.inventory.attributes.columns.select}</span>
                          </th>
                          <th>{v.columns.code}</th>
                          <th>{v.columns.reasons}</th>
                          <th>{v.columns.note}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pickList.map((p) => (
                          <tr key={p.slotId} data-code={p.code}>
                            <td>
                              <label className={styles.rowCheck}>
                                <input
                                  type="checkbox"
                                  checked={p.included}
                                  aria-label={p.code}
                                  onChange={() =>
                                    updatePick(p.slotId, (x) => ({ ...x, included: !x.included }))
                                  }
                                />
                              </label>
                            </td>
                            <td className={cell.code}>{p.code}</td>
                            <td>
                              <span className={styles.chips}>
                                {sortReasons(p.reasons)
                                  .filter((r) => r !== "possible_sapling" && r !== "multi_stem")
                                  .map((r) => (
                                    <Badge key={r}>{t.inventory.reasons[r]}</Badge>
                                  ))}
                              </span>
                              <label className={styles.inline}>
                                <input
                                  type="checkbox"
                                  checked={p.reasons.has(
                                    p.hasTree ? "multi_stem" : "possible_sapling",
                                  )}
                                  onChange={() =>
                                    toggleReason(
                                      p.slotId,
                                      p.hasTree ? "multi_stem" : "possible_sapling",
                                    )
                                  }
                                />
                                {p.hasTree ? v.addMultiStem : v.addSapling}
                              </label>
                            </td>
                            <td>
                              <input
                                className={styles.cellInput}
                                value={p.note}
                                maxLength={2000}
                                aria-label={`${v.note} ${p.code}`}
                                onChange={(e) =>
                                  updatePick(p.slotId, (x) => ({ ...x, note: e.target.value }))
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
                <div className={styles.toolbar}>
                  <Field id="tour-date" label={v.plannedDate}>
                    <Input
                      type="date"
                      value={plannedDate}
                      onChange={(e) => setPlannedDate(e.target.value)}
                    />
                  </Field>
                  <Button
                    disabled={pending || included.length === 0}
                    onClick={createTour}
                    data-testid="create-tour"
                  >
                    {pending ? v.creating : `${v.create} (${included.length})`}
                  </Button>
                </div>
              </section>
              <VerificationTours
                tours={ws.tours}
                canRecord
                canClose
                onRecord={async (itemId, treePresent, note) => {
                  const result = await recordVerificationResultAction({
                    parcelId,
                    itemId,
                    treePresent,
                    note,
                  });
                  if (result.ok) router.refresh();
                  return result;
                }}
                onClose={async (itemId, note) => {
                  const result = await closeVerificationItemAction({ parcelId, itemId, note });
                  if (result.ok) router.refresh();
                  return result;
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
