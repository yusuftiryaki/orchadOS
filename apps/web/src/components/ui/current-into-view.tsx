"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A horizontally scrolling nav on a phone: keeps the current link
// (aria-current) in view, so "Hesabım" is not hidden past the edge, and
// marks `data-more` while links remain past the right edge (a fade cue).
export function CurrentIntoView({
  className,
  label,
  children,
}: {
  className?: string;
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const current = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (current && el.scrollWidth > el.clientWidth) {
      const left = current.offsetLeft - el.offsetLeft;
      if (left < el.scrollLeft || left + current.offsetWidth > el.scrollLeft + el.clientWidth) {
        el.scrollLeft = left - 16;
      }
    }
    const mark = () => {
      el.toggleAttribute("data-more", el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    mark();
    el.addEventListener("scroll", mark, { passive: true });
    window.addEventListener("resize", mark);
    return () => {
      el.removeEventListener("scroll", mark);
      window.removeEventListener("resize", mark);
    };
  });
  return (
    <nav ref={ref} aria-label={label} className={className}>
      {children}
    </nav>
  );
}
