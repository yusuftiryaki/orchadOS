"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./section-nav.module.css";

export interface SectionNavItem {
  // "#harita": the id of a section on the same page.
  href: string;
  label: string;
}

// "Bu sayfada": the sticky tab row of a long report page. The links are
// plain anchors (they work without JavaScript and in print the row is
// hidden); in the browser the tab of the section being read is marked as
// the current one (scroll spy) and kept in view inside the row on a phone.
export function SectionNav({ items, label }: { items: SectionNavItem[]; label: string }) {
  const [active, setActive] = useState<string | null>(items[0]?.href ?? null);
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const nav = navRef.current;
      if (!nav) return;
      // A section counts as current once its top passes under the tab row.
      const line = nav.getBoundingClientRect().bottom + 24;
      let current: string | null = items[0]?.href ?? null;
      for (const item of items) {
        const el = document.getElementById(item.href.slice(1));
        if (el && el.getBoundingClientRect().top <= line) current = item.href;
      }
      // At the very end of the page the last section is the current one,
      // even when it is too short to reach the line.
      const doc = document.documentElement;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 2 && items.length > 0) {
        current = items[items.length - 1].href;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [items]);

  // Keep the current tab visible in the horizontally scrolling row (never
  // scrolls the page itself).
  useEffect(() => {
    const list = listRef.current;
    if (!list || !active) return;
    const link = list.querySelector<HTMLAnchorElement>(`a[href="${active}"]`);
    if (!link) return;
    const left = link.offsetLeft - list.offsetLeft;
    const right = left + link.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = left - 16;
    else if (right > list.scrollLeft + list.clientWidth)
      list.scrollLeft = right - list.clientWidth + 16;
  }, [active]);

  return (
    <nav ref={navRef} aria-label={label} className={styles.nav} data-testid="section-nav">
      <ul ref={listRef} className={styles.list}>
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className={styles.link}
              aria-current={active === item.href ? "location" : undefined}
              onClick={() => setActive(item.href)}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
