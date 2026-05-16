import { useState } from "react";
import { useActors, useSets } from "../lib/store";
import { syncPrepDeck } from "../lib/prep-deck";
import { useAnkiHealth } from "./AnkiHealthBanner";
import { FINALS, INITIALS } from "../../../src/pinyin";

export function PrepDeckButton() {
  const ankiHealth = useAnkiHealth();
  const ankiReady = ankiHealth?.connected === true;
  const { actors } = useActors();
  const { sets } = useSets();
  const [busy, setBusy] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const filledActors = INITIALS.filter((i) => actors[i]?.name);
  const filledSets = FINALS.filter((f) => sets[f]?.name);

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
      <div className="prep-deck-actions">
        <button
          onClick={() => setShowPreview((v) => !v)}
          data-testid="toggle-prep-preview"
          disabled={filledActors.length + filledSets.length === 0}
        >
          {showPreview ? "Hide preview" : `Preview ${filledActors.length + filledSets.length} prep cards`}
        </button>
        <button
          onClick={push}
          disabled={busy || !ankiReady || filledActors.length + filledSets.length === 0}
          className="primary"
          data-testid="push-prep-button"
          title={!ankiReady ? "AnkiConnect not reachable" : undefined}
        >
          {busy ? (
            <>
              <span className="spinner" /> Pushing…
            </>
          ) : (
            "Push to HMM Prep deck"
          )}
        </button>
      </div>

      {showPreview && (
        <div className="prep-preview" data-testid="prep-preview">
          {filledActors.length > 0 && (
            <>
              <h4>Actor cards ({filledActors.length})</h4>
              <ul>
                {filledActors.map((i) => (
                  <li key={i}>
                    <code>{i}-</code> · {actors[i]?.name}
                    <span className="muted"> ({actors[i]?.category})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {filledSets.length > 0 && (
            <>
              <h4>Set cards ({filledSets.length})</h4>
              <ul>
                {filledSets.map((f) => {
                  const s = sets[f]!;
                  const roomCount = s.rooms ? Object.values(s.rooms).filter(Boolean).length : 0;
                  return (
                    <li key={f}>
                      <code>-{f}</code> · {s.name}
                      <span className="muted"> ({roomCount}/5 rooms{s.exteriorDataUrl ? " + exterior" : ""})</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
      {!ankiReady && (
        <div className="error-banner" style={{ marginTop: 8 }}>
          <strong>Anki not reachable.</strong> Start Anki desktop with the
          AnkiConnect add-on installed first.
        </div>
      )}
      {log.length > 0 && (
        <pre className="generate-log" data-testid="prep-log">
          {log.join("\n")}
        </pre>
      )}
    </div>
  );
}
