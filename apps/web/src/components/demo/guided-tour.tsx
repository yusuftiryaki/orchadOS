"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { exitDemoAction } from "@/app/(site)/demo/actions";
import type { DemoTour } from "@/lib/demo/info";
import { onStepPage, stepIndex, stepUrl, TOUR_PARAM, TOUR_STEPS } from "@/lib/demo/tour-steps";
import { demoText } from "@/lib/i18n/messages/demo";
import styles from "./demo.module.css";

// The guided tour (docs/demo-turu.md §11.4): a non-modal card that walks the
// real portal pages. The step lives in the URL (?tur=<id>); the "closed" flag
// in sessionStorage. Targets are found by data-testid, scrolled into view and
// outlined; a step without any target on its page is skipped. While the tour
// is open the card stays mounted between steps, so keyboard focus survives
// İleri/Geri; a step change the visitor started moves focus to the heading,
// and a live region outside the card announces each step.

const T = demoText.tour;
const CLOSED_KEY = "orchados-demo-tour-closed";
const FIND_TIMEOUT_MS = 8000;
const FIND_INTERVAL_MS = 150;

function readClosed(): boolean {
  try {
    return window.sessionStorage.getItem(CLOSED_KEY) === "1";
  } catch {
    return false;
  }
}

const closedListeners = new Set<() => void>();

function writeClosed(closed: boolean) {
  try {
    if (closed) window.sessionStorage.setItem(CLOSED_KEY, "1");
    else window.sessionStorage.removeItem(CLOSED_KEY);
  } catch {
    // Storage blocked: the tour simply opens again on the next ?tur.
  }
  for (const listener of closedListeners) listener();
}

function subscribeClosed(listener: () => void) {
  closedListeners.add(listener);
  return () => closedListeners.delete(listener);
}

function findTargets(ids: string[]): HTMLElement[] {
  return ids.flatMap((id) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    return el ? [el] : [];
  });
}

// Next to the target on a wide screen when there is room; otherwise the CSS
// places the card (bottom right, or a bottom sheet on a phone).
function placeNextTo(target: HTMLElement | undefined): React.CSSProperties | undefined {
  if (!target || window.innerWidth < 720) return undefined;
  const rect = target.getBoundingClientRect();
  const width = 360;
  const gap = 16;
  const top = Math.max(80, Math.min(rect.top, window.innerHeight - 320));
  if (rect.right + gap + width <= window.innerWidth - gap) {
    return { top, left: rect.right + gap, right: "auto", bottom: "auto" };
  }
  if (rect.left - gap - width >= gap) {
    return { top, left: rect.left - gap - width, right: "auto", bottom: "auto" };
  }
  return undefined;
}

// The next step that turns up takes the focus: set by İleri/Geri, the arrow
// keys and "Turu başlat", never by a page load.
let focusNextStep = false;

// Keys reach the tour only from inside its card or from nowhere in particular
// (the page body): the map, the 360° viewer and any other widget keep theirs.
function tourKey(event: KeyboardEvent, card: HTMLElement | null): boolean {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return false;
  const target = event.target as Node | null;
  if (!target || target === document.body || target === document.documentElement) return true;
  if (!card?.contains(target)) return false;
  return !(target as HTMLElement).closest?.("input, textarea, select, [contenteditable]");
}

// Starts the tour from step 1 (the banner's "Turu başlat").
export function useStartTour(ctx: DemoTour) {
  const router = useRouter();
  return useCallback(() => {
    writeClosed(false);
    focusNextStep = true;
    const url = stepUrl(TOUR_STEPS[0], ctx, "/portal");
    if (url) router.push(url);
  }, [ctx, router]);
}

export function GuidedTour({
  ctx,
  signupNext,
  packagesHref,
}: {
  ctx: DemoTour;
  // exitDemoAction's next for "Gerçek hesap aç".
  signupNext: string;
  packagesHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tur = params.get(TOUR_PARAM);
  const index = stepIndex(tur);
  const step = index >= 0 ? TOUR_STEPS[index] : null;
  const search = params.toString();
  const current = `${pathname}${search ? `?${search}` : ""}`;

  // Closed until hydrated: the server never renders the card.
  const closed = useSyncExternalStore(subscribeClosed, readClosed, () => true);
  // "<step>|<address>" whose targets were found.
  const [found, setFound] = useState<string | null>(null);
  const [place, setPlace] = useState<React.CSSProperties | undefined>(undefined);
  const [fullscreen, setFullscreen] = useState(false);
  const direction = useRef(1);
  const highlighted = useRef<HTMLElement[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const clearHighlight = () => {
    for (const el of highlighted.current) el.classList.remove(styles.highlight);
    highlighted.current = [];
  };

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const go = useCallback(
    (to: number, dir: number) => {
      direction.current = dir;
      for (let i = to; i >= 0 && i < TOUR_STEPS.length; i += dir) {
        const url = stepUrl(TOUR_STEPS[i], ctx, current);
        if (url) {
          router.push(url, { scroll: false });
          return;
        }
      }
      // Nothing left in that direction: the closing card.
      const last = stepUrl(TOUR_STEPS[TOUR_STEPS.length - 1], ctx, current);
      if (last) router.push(last, { scroll: false });
    },
    [ctx, current, router],
  );

  // A step change the visitor asked for.
  const move = useCallback(
    (to: number, dir: number) => {
      focusNextStep = true;
      go(to, dir);
    },
    [go],
  );

  const close = useCallback(() => {
    focusNextStep = false;
    writeClosed(true);
    clearHighlight();
    const next = new URLSearchParams(search);
    next.delete(TOUR_PARAM);
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [pathname, router, search]);

  // Go to the step's page, then find and outline its targets.
  useEffect(() => {
    if (!step || closed) {
      clearHighlight();
      return;
    }
    if (!onStepPage(step, ctx, pathname, new URLSearchParams(search))) {
      const url = stepUrl(step, ctx, current);
      if (url) router.replace(url, { scroll: false });
      else go(index + direction.current, direction.current);
      return;
    }
    let stopped = false;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = () => {
      if (stopped) return;
      const targets = findTargets(step.targets);
      if (targets.length === 0) {
        if (Date.now() - started < FIND_TIMEOUT_MS) {
          timer = setTimeout(look, FIND_INTERVAL_MS);
        } else if (index < TOUR_STEPS.length - 1) {
          go(index + direction.current, direction.current);
        }
        return;
      }
      clearHighlight();
      for (const el of targets) el.classList.add(styles.highlight);
      highlighted.current = targets;
      if (!step.anyPage) targets[0].scrollIntoView({ block: "center" });
      setPlace(step.anyPage ? undefined : placeNextTo(targets[0]));
      setFound(`${step.id}|${current}`);
    };
    timer = setTimeout(look, 0);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // `current` is derived from pathname and search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, closed, pathname, search, ctx]);

  useEffect(() => () => clearHighlight(), []);

  const active = step !== null && !closed && found === `${step.id}|${current}`;

  useEffect(() => {
    if (!active || !focusNextStep) return;
    focusNextStep = false;
    headingRef.current?.focus({ preventScroll: true });
  }, [active, found]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (!tourKey(event, cardRef.current)) return;
      if (event.key === "Escape") close();
      else if (event.key === "ArrowRight" && index < TOUR_STEPS.length - 1) move(index + 1, 1);
      else if (event.key === "ArrowLeft" && index > 0) move(index - 1, -1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close, move, index]);

  // Mounted for every step of an open tour; until the new step's targets are
  // found it keeps its place and says it is busy.
  const open = step !== null && !closed;
  const last = index === TOUR_STEPS.length - 1;
  return (
    <>
      <div className={styles.srOnly} aria-live="polite" data-testid="tour-announcer">
        {active && step
          ? `${T.label} ${T.counter(index + 1, TOUR_STEPS.length)}: ${step.title}`
          : ""}
      </div>
      {open && step && (
        <div
          ref={cardRef}
          className={styles.tourCard}
          style={place}
          role="dialog"
          aria-modal="false"
          aria-label={T.label}
          aria-busy={!active}
          data-testid="guided-tour"
          data-step={active ? step.id : undefined}
          data-state={active ? "ready" : "loading"}
          hidden={fullscreen}
        >
          <div className={styles.tourHead}>
            <span>{T.label}</span>
            <span data-testid="tour-counter">{T.counter(index + 1, TOUR_STEPS.length)}</span>
          </div>
          <h2 ref={headingRef} tabIndex={-1} className={styles.tourTitle}>
            {step.title}
          </h2>
          <p>{step.body}</p>
          {last && (
            <div className={styles.tourControls} style={{ marginBottom: 8 }}>
              <form action={exitDemoAction}>
                <input type="hidden" name="next" value={signupNext} />
                <button className="button" type="submit" data-testid="tour-signup">
                  {T.signup}
                </button>
              </form>
              <Link
                className="button button-secondary"
                href={packagesHref}
                data-testid="tour-packages"
              >
                {T.packages}
              </Link>
            </div>
          )}
          <div className={styles.tourControls}>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => move(index - 1, -1)}
              disabled={index === 0}
              data-testid="tour-prev"
            >
              {T.prev}
            </button>
            {last ? (
              <button type="button" className="button" onClick={close} data-testid="tour-next">
                {T.finish}
              </button>
            ) : (
              <button
                type="button"
                className="button"
                onClick={() => move(index + 1, 1)}
                data-testid="tour-next"
              >
                {T.next}
              </button>
            )}
            <button
              type="button"
              className={styles.tourClose}
              onClick={close}
              data-testid="tour-close"
            >
              {T.close}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// "Turu başlat": in the banner on a wide screen, in the shell header on a
// phone (the banner has no room there), so a closed tour can always restart.
export function TourStartButton({
  ctx,
  className,
  testId,
}: {
  ctx: DemoTour;
  className: string;
  testId: string;
}) {
  const startTour = useStartTour(ctx);
  return (
    <button type="button" className={className} onClick={startTour} data-testid={testId}>
      {demoText.banner.startTour}
    </button>
  );
}
