import { useState } from "react";
import { FINALS, type Final, TONE_TO_ROOM } from "../../../src/pinyin";
import { useSets } from "../lib/store";

interface Props {
  readonly onComplete: () => void;
}

const TONES: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];

export function SetsWizard({ onComplete }: Props) {
  const { sets, setSet } = useSets();
  const [openFinal, setOpenFinal] = useState<Final | null>(null);

  const filled = FINALS.filter((f) => sets[f]?.name).length;

  return (
    <div className="wizard">
      <header className="wizard-header">
        <h1>Step 2 — Sets (Pinyin finals)</h1>
        <p>
          Pick a familiar building or place for each final — your childhood
          home, an old workplace, your favorite cafe. Within each set,
          tones map to fixed rooms (entrance/kitchen/bedroom/bathroom/roof).
        </p>
        <p className="muted">{filled} / {FINALS.length} assigned</p>
      </header>

      <div className="rooms-legend">
        {TONES.map((t) => (
          <span key={t} className="rooms-legend-item">
            <strong>Tone {t}:</strong> {TONE_TO_ROOM[t]}
          </span>
        ))}
      </div>

      <div className="final-grid">
        {FINALS.map((final) => {
          const s = sets[final];
          return (
            <button
              key={final}
              className={`final-card ${s?.name ? "filled" : "empty"}`}
              onClick={() => setOpenFinal(final)}
              data-testid={`final-card-${final}`}
            >
              <div className="final-glyph">-{final}</div>
              <div className="final-set-name">
                {s?.name ?? <em>unassigned</em>}
              </div>
            </button>
          );
        })}
      </div>

      {openFinal && (
        <SetDialog
          final={openFinal}
          current={sets[openFinal]}
          onSave={(value) => {
            setSet(openFinal, value);
            setOpenFinal(null);
          }}
          onClose={() => setOpenFinal(null)}
        />
      )}

      <footer className="wizard-footer">
        <button
          className="primary"
          onClick={onComplete}
          disabled={filled === 0}
          data-testid="next-button"
        >
          Continue → Generate
        </button>
      </footer>
    </div>
  );
}

interface SetDialogProps {
  readonly final: Final;
  readonly current?: { name?: string; rooms?: Partial<Record<1 | 2 | 3 | 4 | 5, string>>; exteriorDataUrl?: string };
  readonly onSave: (value: { name: string; rooms?: Partial<Record<1 | 2 | 3 | 4 | 5, string>>; exteriorDataUrl?: string }) => void;
  readonly onClose: () => void;
}

function SetDialog({ final, current, onSave, onClose }: SetDialogProps) {
  const [name, setName] = useState(current?.name ?? "");
  const [exteriorDataUrl, setExteriorDataUrl] = useState<string | undefined>(
    current?.exteriorDataUrl,
  );
  const [rooms, setRooms] = useState<Partial<Record<1 | 2 | 3 | 4 | 5, string>>>(
    current?.rooms ?? {},
  );

  function readFile(file: File, cb: (dataUrl: string) => void) {
    const reader = new FileReader();
    reader.addEventListener("load", () => cb(reader.result as string));
    reader.readAsDataURL(file);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>
          Set for final <code className="big">-{final}</code>
        </h2>
        <label>
          Location name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Childhood home, Oracle Park, Grandma's house"
            autoFocus
            data-testid="set-name-input"
          />
        </label>
        <label>
          Exterior shot (optional)
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) readFile(f, setExteriorDataUrl);
            }}
          />
        </label>
        {exteriorDataUrl && (
          <img src={exteriorDataUrl} alt="" className="actor-preview" />
        )}

        <h3>Per-tone rooms (recommended)</h3>
        <div className="room-grid">
          {TONES.map((t) => (
            <div key={t} className="room-row">
              <div className="room-label">
                <strong>Tone {t}</strong>
                <span className="muted">{TONE_TO_ROOM[t]}</span>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readFile(f, (url) => setRooms({ ...rooms, [t]: url }));
                }}
              />
              {rooms[t] && (
                <img src={rooms[t]} alt="" className="room-preview" />
              )}
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={!name.trim()}
            onClick={() =>
              onSave({
                exteriorDataUrl,
                name: name.trim(),
                rooms,
              })
            }
            data-testid="set-save-button"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
