import { useEffect } from "react";

/** Call `onEscape` whenever the user presses Escape while the hook is mounted. */
export function useEscape(onEscape: () => void): void {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onEscape();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEscape]);
}
