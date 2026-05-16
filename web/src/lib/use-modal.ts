import { useEffect, useRef } from "react";
import { useEscape } from "./use-escape";

/**
 * Wires standard modal-dialog behavior onto a container ref:
 *
 * - Esc closes the modal (via {@link useEscape})
 * - First focusable element receives focus on mount (skipped if a child
 *   already has `autoFocus` — React applies that synchronously)
 * - Tab + Shift-Tab are trapped inside the container
 * - Restores focus to the previously-focused element on unmount
 *
 * Returns the ref you must place on the modal's root element. Pair with
 * `role="dialog"` and `aria-modal="true"` on that element for screen
 * readers.
 */
export function useModal(onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEscape(onClose);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // If nothing inside the modal already has focus (React's autoFocus
    // is synchronous so an autofocused input will already own focus
    // here), focus the first focusable element.
    if (!container.contains(document.activeElement)) {
      const first = focusable(container)[0];
      first?.focus();
    }

    function handleKeydown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const items = focusable(container!);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !container!.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    container.addEventListener("keydown", handleKeydown);
    return () => {
      container.removeEventListener("keydown", handleKeydown);
      previouslyFocused?.focus?.();
    };
  }, []);

  return containerRef;
}

/** Visible, tab-reachable elements inside `root`, in DOM order. */
function focusable(root: HTMLElement): HTMLElement[] {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type=hidden])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");
  // We intentionally don't filter by visibility — inside a mounted
  // modal, all children are visible by construction, and offsetParent
  // is unreliable in jsdom (always null) which made tests flaky.
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}
