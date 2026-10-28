"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A horizontally scrolling box that becomes a focusable, named region only
// while its content overflows, so keyboard users can scroll it (WCAG 2.1.1,
// axe `scrollable-region-focusable`) and a table that fits adds no tab stop.
export function ScrollBox({
  className,
  label,
  children,
}: {
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      if (el.scrollWidth > el.clientWidth + 1) {
        el.tabIndex = 0;
        el.setAttribute("role", "region");
        if (label) el.setAttribute("aria-label", label);
      } else {
        el.removeAttribute("tabindex");
        el.removeAttribute("role");
        el.removeAttribute("aria-label");
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [label]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
