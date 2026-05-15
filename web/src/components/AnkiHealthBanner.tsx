import { useEffect, useState } from "react";
import { checkHealth, type AnkiHealth } from "../../../src/anki-connect";

/** Module-level subscriber list so other components can read the cached health
 * status without re-polling. Keeps polling to ONE timer regardless of how
 * many AnkiHealthBanner instances mount. */
let cached: AnkiHealth | null = null;
const subs = new Set<(h: AnkiHealth | null) => void>();
let pollerStarted = false;

function startPoller() {
  if (pollerStarted) return;
  pollerStarted = true;
  const tick = async () => {
    const res = await checkHealth();
    cached = res;
    for (const s of subs) s(res);
  };
  void tick();
  setInterval(tick, 8000);
}

export function useAnkiHealth(): AnkiHealth | null {
  const [h, setH] = useState<AnkiHealth | null>(cached);
  useEffect(() => {
    subs.add(setH);
    startPoller();
    return () => { subs.delete(setH); };
  }, []);
  return h;
}

export function AnkiHealthBanner() {
  const h = useAnkiHealth();
  if (!h) return <span className="anki-status checking">checking Anki…</span>;
  if (h.connected) {
    return (
      <span className="anki-status connected" data-testid="anki-status-connected">
        ● AnkiConnect v{h.version}
      </span>
    );
  }
  return (
    <a
      href="https://foosoft.net/projects/anki-connect/"
      target="_blank"
      rel="noreferrer"
      className="anki-status disconnected"
      title={h.error}
      data-testid="anki-status-disconnected"
    >
      ○ Anki not reachable — click for setup
    </a>
  );
}
