"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./tabs.module.css";

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

// In-page tabs (ARIA tablist): arrow keys, Home and End move between tabs.
// Use TabLinks when each tab is its own URL.
export function Tabs({
  label,
  items,
  initial,
}: {
  label: string;
  items: TabItem[];
  initial?: string;
}) {
  const base = useId();
  const [active, setActive] = useState(initial ?? items[0]?.id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = items.length - 1;
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
    setActive(items[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className={styles.list}>
        {items.map((item, i) => (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${item.id}`}
            aria-controls={`${base}-panel-${item.id}`}
            aria-selected={item.id === active}
            tabIndex={item.id === active ? 0 : -1}
            className={styles.tab}
            onClick={() => setActive(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${base}-panel-${item.id}`}
          aria-labelledby={`${base}-tab-${item.id}`}
          hidden={item.id !== active}
          tabIndex={0}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
