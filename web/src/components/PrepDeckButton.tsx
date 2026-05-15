import { useState } from "react";
import { useActors, useSets } from "../lib/store";
import { syncPrepDeck } from "../lib/prep-deck";

export function PrepDeckButton() {
  const { actors } = useActors();
  const { sets } = useSets();
  const [busy, setBusy] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  async function push() {
    setBusy(true);
    setLog([]);
    try {
      const r = await syncPrepDeck({ actors, forceUpdate, sets });
      setLog([...r.log, ...r.errors.map((e) => `ERROR: ${e}`)]);
    } catch (err) {
      setLog([`unexpected error: ${(err as Error).message}`]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prep-deck-section">
      <h3>HMM Prep Deck</h3>
      <p className="muted">
        Push your actor + set library to a separate Anki deck so you can
        review the mappings themselves. Only adds new slots — existing
        cards (and their review schedules) are untouched unless you
        check "force update".
      </p>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={forceUpdate}
          onChange={(e) => setForceUpdate(e.target.checked)}
          data-testid="prep-force-update"
        />
        Force-refresh images on existing prep cards (resets review schedule)
      </label>
      <button
        onClick={push}
        disabled={busy}
        className="primary"
        data-testid="push-prep-button"
      >
        {busy ? "Pushing…" : "Push to HMM Prep deck"}
      </button>
      {log.length > 0 && (
        <pre className="generate-log" data-testid="prep-log">
          {log.join("\n")}
        </pre>
      )}
    </div>
  );
}
