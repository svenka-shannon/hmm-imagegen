import { useEffect, useState } from "react";
import { checkHealth, type AnkiHealth } from "../../../src/anki-connect";

export function AnkiHealthBanner() {
  const [h, setH] = useState<AnkiHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const res = await checkHealth();
      if (!cancelled) setH(res);
    }
    void poll();
    const id = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!h) return <span className="anki-status checking">checking Anki…</span>;
  if (h.connected) {
    return (
      <span className="anki-status connected" data-testid="anki-status-connected">
        ● AnkiConnect v{h.version}
      </span>
    );
  }
  return (
    <span
      className="anki-status disconnected"
      title={h.error}
      data-testid="anki-status-disconnected"
    >
      ○ Anki not reachable
    </span>
  );
}
