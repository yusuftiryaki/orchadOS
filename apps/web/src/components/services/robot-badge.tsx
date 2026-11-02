"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  type PointerEvent,
} from "react";
import { servicesText as S } from "@/lib/i18n/messages/services";
import { POPOVER_CLOSED, popoverReducer } from "@/lib/services/robot-popover";
import type { RobotModel } from "@/lib/services/robots";
import styles from "./robot-badge.module.css";

const R = S.robot;
// Leaving the badge for its card crosses a small gap; a short delay keeps a
// hover-opened card from closing on the way.
const HOVER_CLOSE_MS = 150;
// The card keeps this far from the viewport edges (the portal's gutter).
const EDGE = 16;

// "Otonom robot · MARABA-I" (IP15): the robot that does a service, on the
// offer cards, the request form, the request page and "Hizmetlerim". The
// button opens a card with a representative image, the technical drawing,
// the model's one-line description and its capabilities. A mouse hover opens
// the same card; nothing is hover-only (see lib/services/robot-popover.ts).
// Escape and a click or tap outside close it; Escape returns focus to the
// button. Non-modal: the page stays usable while it is open.
export function RobotBadge({
  robot,
  compact = false,
  testId = "robot-badge",
}: {
  robot: RobotModel;
  // A smaller badge for list rows ("Hizmetlerim"); the touch target stays 44 px.
  compact?: boolean;
  testId?: string;
}) {
  const [state, dispatch] = useReducer(popoverReducer, POPOVER_CLOSED);
  const cardId = useId();
  const titleId = useId();
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Focus handed back to the button after closing must not reopen the card.
  const quietFocus = useRef(false);
  const returnFocus = () => {
    quietFocus.current = true;
    button.current?.focus();
    quietFocus.current = false;
  };

  const clearHoverTimer = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };
  useEffect(() => clearHoverTimer, []);

  // Escape anywhere and a pointer down outside close an open card.
  useEffect(() => {
    if (!state.open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const within = root.current?.contains(document.activeElement);
      dispatch("escape");
      if (within || state.pinned) returnFocus();
    }
    function onPointerDown(event: globalThis.PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) dispatch("outside");
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [state.open, state.pinned]);

  // Keep the card inside the viewport: shift it left or right so that it
  // stays EDGE px from either side (a badge near the right edge on a phone).
  const place = useCallback(() => {
    const el = card.current;
    if (!el) return;
    el.style.setProperty("--shift", "0px");
    const rect = el.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    let shift = 0;
    if (rect.right > width - EDGE) shift = width - EDGE - rect.right;
    if (rect.left + shift < EDGE) shift = EDGE - rect.left;
    el.style.setProperty("--shift", `${Math.round(shift)}px`);
  }, []);

  useLayoutEffect(() => {
    if (!state.open) return;
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [state.open, place]);

  function onPointerEnter(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    clearHoverTimer();
    dispatch("hover-enter");
  }

  function onPointerLeave(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => dispatch("hover-leave"), HOVER_CLOSE_MS);
  }

  return (
    <span
      ref={root}
      className={compact ? `${styles.root} ${styles.compact}` : styles.root}
      data-testid={testId}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && !event.currentTarget.contains(next)) dispatch("focus-out");
      }}
    >
      <button
        ref={button}
        type="button"
        className={styles.trigger}
        aria-expanded={state.open}
        aria-controls={cardId}
        data-testid="robot-badge-button"
        onFocus={(event) => {
          // Keyboard focus opens the card like a hover does (a mouse click
          // focuses without :focus-visible and toggles instead).
          if (quietFocus.current) return;
          let visible = false;
          try {
            visible = event.currentTarget.matches(":focus-visible");
          } catch {
            visible = false;
          }
          if (visible) dispatch("focus-in");
        }}
        onClick={() => {
          clearHoverTimer();
          dispatch("toggle");
        }}
      >
        <RobotIcon className={styles.icon} />
        <span>{R.badge(robot.name)}</span>
      </button>
      <div
        ref={card}
        id={cardId}
        role="dialog"
        aria-labelledby={titleId}
        className={styles.card}
        hidden={!state.open}
        data-testid="robot-card"
        onPointerEnter={clearHoverTimer}
      >
        {robot.imagePath && (
          <figure className={styles.figure}>
            <Image
              src={robot.imagePath}
              alt={R.imageAlt(robot.name)}
              width={786}
              height={456}
              sizes="(max-width: 420px) calc(100vw - 64px), 352px"
              className={styles.image}
            />
            <figcaption className={styles.caption}>{R.imageCaption}</figcaption>
          </figure>
        )}
        <div className={styles.body}>
          <div className={styles.head}>
            <p className={styles.kind}>{R.kind}</p>
            <p id={titleId} className={styles.title}>
              {robot.name}
            </p>
          </div>
          <p className={styles.description}>{robot.shortDescription}</p>
          {robot.capabilities.length > 0 && (
            <>
              <p className={styles.listTitle}>{R.capabilities}</p>
              <ul className={styles.list}>
                {robot.capabilities.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}
          <div className={styles.foot}>
            {robot.drawingPath && (
              <a href={robot.drawingPath} target="_blank" rel="noopener" className={styles.link}>
                {R.drawing} <span className="sr-only">{R.newTab}</span>
              </a>
            )}
            <button
              type="button"
              className={styles.close}
              onClick={() => {
                dispatch("escape");
                returnFocus();
              }}
            >
              {R.close}
            </button>
          </div>
        </div>
      </div>
    </span>
  );
}

// A small rover: body, sensor mast and two wheels. currentColor, 20 px.
export function RobotIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3v3" />
      <circle cx="12" cy="3" r="0.6" fill="currentColor" />
      <rect x="4" y="6" width="16" height="9" rx="2" />
      <path d="M9 10.5h.01M15 10.5h.01" strokeWidth="2.4" />
      <circle cx="7.5" cy="18.5" r="2.5" />
      <circle cx="16.5" cy="18.5" r="2.5" />
      <path d="M10 18.5h4" />
    </svg>
  );
}
