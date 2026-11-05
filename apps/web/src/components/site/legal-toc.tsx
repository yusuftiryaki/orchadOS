"use client";

import { useEffect, useState } from "react";

// The legal text's contents beside the text on a wide screen: the section
// being read is marked (aria-current="location") as the reader scrolls.
export function LegalToc({
  sections,
  className,
}: {
  sections: { id: string; text: string }[];
  className?: string;
}) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const headings = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;
    // The last heading that has passed the upper fifth of the screen.
    function update() {
      const line = window.innerHeight * 0.2;
      let current: string | null = null;
      for (const el of headings) {
        if (el.getBoundingClientRect().top <= line) current = el.id;
      }
      setActive(current);
    }
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", update);
    };
  }, [sections]);

  return (
    <ol className={className}>
      {sections.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`} aria-current={active === s.id ? "location" : undefined}>
            {s.text}
          </a>
        </li>
      ))}
    </ol>
  );
}
