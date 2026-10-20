"use client";

import { useEffect } from "react";

// Keyboard shortcuts of the review page: J next tree, K previous, A accept the
// AI suggestion, 1–5 pick a class in the correction form. Elements opt in with
// data-shortcut / data-shortcut-class; keys typed into form fields are ignored.
export function ReviewShortcuts() {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      const click = (selector: string) => {
        const el = document.querySelector<HTMLElement>(selector);
        if (!el || (el as HTMLButtonElement).disabled) return false;
        el.click();
        return true;
      };
      const key = event.key.toLowerCase();
      let handled = false;
      if (key === "j") handled = click('[data-shortcut="next"]');
      else if (key === "k") handled = click('[data-shortcut="previous"]');
      else if (key === "a") handled = click('[data-shortcut="accept"]');
      else if (/^[1-5]$/.test(key)) {
        const radio = document.querySelector<HTMLInputElement>(`[data-shortcut-class="${key}"]`);
        if (radio && !radio.disabled) {
          radio.checked = true;
          radio.focus();
          handled = true;
        }
      }
      if (handled) event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
