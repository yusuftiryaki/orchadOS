"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import type { SignedWorld } from "@/components/portal/world-view";
import type { SizeFlag } from "@/components/portal/world-scene";
import worldStyles from "@/components/portal/world.module.css";
import { Button } from "@/components/ui/button";
import { reviewHref } from "@/lib/expert/urls";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import {
  canAccept,
  suggestionState,
  type AgeClass,
  type SizeClass,
  type SizeSuggestion,
} from "@/lib/lidar/size-class";
import type { StaffWorld } from "@/lib/lidar/staff";
import { DEFAULT_CAMERA_HEIGHT_M } from "@/lib/portal/crown-guide";
import styles from "./staff-world.module.css";

// The 3D world on the staff screens (docs/3d-dunya.md §9.4): a button that
// opens the parcel's LiDAR world over the whole page, straight in the
// overview (no panorama to start from). Every visit with a cloud is offered,
// those in review included. The tree panel shows the recorded size class and
// the LiDAR suggestion; with `accept` it can be accepted from the panel.

const WorldView = dynamic(() => import("@/components/portal/world-view"), { ssr: false });

const sw = t.staffWorld;
const ageNames = t.tree.values.ageClass;

export type AcceptSizeClass = (
  parcelId: string,
  treeId: string,
  sizeClass: SizeClass,
) => Promise<{ ok: boolean }>;

export function StaffWorldButton({
  world,
  visitId,
  focusTreeId = null,
  sign,
  accept,
  reviewSessionId,
}: {
  world: StaffWorld;
  // The visit to open; the newest visit with a cloud when it has none.
  visitId?: string | null;
  focusTreeId?: string | null;
  sign: (parcelId: string, assetId: string) => Promise<SignedWorld>;
  // Accepts a suggestion (office); absent: the panel only shows it.
  accept?: AcceptSizeClass;
  // Expert: the review the tree link opens.
  reviewSessionId?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  // Classes accepted while the world is open (the page refreshes behind it).
  const [accepted, setAccepted] = useState<Record<string, AgeClass>>({});
  const [message, setMessage] = useState<{ treeId: string; ok: boolean; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const start =
    world.visits.find((v) => v.id === visitId && v.assetId) ??
    world.visits.find((v) => v.assetId) ??
    null;
  const recorded = useCallback(
    (treeId: string): AgeClass =>
      accepted[treeId] ?? world.trees.find((x) => x.id === treeId)?.ageClass ?? "unknown",
    [accepted, world.trees],
  );
  const flags = useMemo(() => {
    const out: Record<string, SizeFlag> = {};
    for (const tree of world.trees) {
      const state = suggestionState(world.suggestions[tree.id], recorded(tree.id));
      if (state === "match") out[tree.id] = "match";
      else if (state !== "none") out[tree.id] = "differs";
    }
    return out;
  }, [world, recorded]);

  const signCloud = useCallback(
    (assetId: string) => sign(world.parcelId, assetId),
    [sign, world.parcelId],
  );
  const treeLink = useMemo(
    () =>
      reviewSessionId
        ? (treeId: string) => ({
            href: reviewHref(reviewSessionId, { tree: treeId }),
            label: sw.review,
          })
        : undefined,
    [reviewSessionId],
  );

  const treeExtra = (treeId: string) => {
    const suggestion: SizeSuggestion | undefined = world.suggestions[treeId];
    const current = recorded(treeId);
    const state = suggestionState(suggestion, current);
    const note = message?.treeId === treeId ? message : null;
    return (
      <div data-testid="world-size-class" data-state={state}>
        <dl className={worldStyles.facts}>
          <div>
            <dt>{sw.recorded}</dt>
            <dd data-testid="world-recorded-class">{ageNames[current]}</dd>
          </div>
          <div>
            <dt>{sw.suggestion}</dt>
            <dd data-testid="world-suggestion">
              {suggestion ? suggestionText(suggestion) : sw.states.none}
            </dd>
          </div>
        </dl>
        {suggestion && state !== "match" && <p className={styles.state}>{sw.states[state]}</p>}
        {accept && suggestion && canAccept(state) && (
          <Button
            size="sm"
            disabled={pending}
            data-testid="world-accept"
            onClick={() =>
              startTransition(async () => {
                const result = await accept(world.parcelId, treeId, suggestion.sizeClass);
                if (result.ok) {
                  setAccepted((a) => ({ ...a, [treeId]: suggestion.sizeClass }));
                  setMessage({
                    treeId,
                    ok: true,
                    text: sw.accepted(ageNames[suggestion.sizeClass]),
                  });
                  router.refresh();
                } else {
                  setMessage({ treeId, ok: false, text: sw.acceptFailed });
                }
              })
            }
          >
            {sw.apply}
          </Button>
        )}
        {note && (
          <p className={styles.state} role={note.ok ? "status" : "alert"}>
            {note.text}
          </p>
        )}
      </div>
    );
  };

  if (!start) return null;
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        title={sw.enterHint}
        data-testid="staff-world-enter"
      >
        <span aria-hidden="true">◈</span> {sw.enter}
      </Button>
      {open && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={sw.enter}>
          <WorldView
            visits={world.visits}
            visitId={start.id}
            start={null}
            cameraHeightM={DEFAULT_CAMERA_HEIGHT_M}
            trees={world.trees}
            sign={signCloud}
            treeLink={treeLink}
            treeExtra={treeExtra}
            sizeFlags={flags}
            focusTreeId={focusTreeId}
            backLabel={sw.close}
            hint={sw.hint}
            onExit={() => setOpen(false)}
          />
        </div>
      )}
    </>
  );
}

function suggestionText(s: SizeSuggestion): string {
  const value = sw.suggestionValue(
    ageNames[s.sizeClass],
    s.confidence === null ? null : formatNumber(s.confidence, 2),
  );
  return `${value}, ${sw.suggestionScan(formatDate(s.measuredAt))}`;
}
