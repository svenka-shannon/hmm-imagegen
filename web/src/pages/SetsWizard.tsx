import { useState } from "react";
import { FINALS, type Final, TONE_TO_ROOM } from "../../../src/pinyin";
import { useSets } from "../lib/store";
import { PrepDeckButton } from "../components/PrepDeckButton";
import { LibraryIO } from "../components/LibraryIO";
import { useModal } from "../lib/use-modal";
import { generatePortrait } from "../lib/imagegen-client";

interface Props {
  readonly onComplete: () => void;
}

const TONES: (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];

type UploadMode = "strict" | "hybrid" | "budget";

const MODE_LABEL: Record<UploadMode, string> = {
  budget: "Budget · just name + 1 exterior per set",
  hybrid: "Hybrid · name + tone-1 entrance shot",
  strict: "Strict · all 5 room images per set",
};
const MODE_HELP: Record<UploadMode, string> = {
  budget:
    "13 photos total. Fastest setup. Image-gen invents room interiors from the prompt, so tone-1 kitchen and tone-2 bedroom look generic.",
  hybrid:
    "~26 photos. Recommended. The entrance image anchors each set; other rooms are invented but the location feels right.",
  strict:
    "~65 photos. Maximum visual fidelity. Each tone renders in the actual room you photographed.",
};

const MODE_STORAGE_KEY = "hmm.sets.uploadMode";

export function SetsWizard({ onComplete }: Props) {
  const { sets, setSet } = useSets();
  const [openFinal, setOpenFinal] = useState<Final | null>(null);
  const [mode, setMode] = useState<UploadMode>(() => {
    const saved = localStorage.getItem(MODE_STORAGE_KEY) as UploadMode | null;
    return saved ?? "hybrid";
  });

  function handleModeChange(m: UploadMode) {
    setMode(m);
    localStorage.setItem(MODE_STORAGE_KEY, m);
  }

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

      <div className="mode-picker" data-testid="upload-mode-picker">
        <div className="mode-picker-label">How thorough?</div>
        {(Object.keys(MODE_LABEL) as UploadMode[]).map((m) => (
          <label key={m} className={`mode-option ${mode === m ? "active" : ""}`}>
            <input
              type="radio"
              name="upload-mode"
              checked={mode === m}
              onChange={() => handleModeChange(m)}
              data-testid={`upload-mode-${m}`}
            />
            <div>
              <div className="mode-option-title">{MODE_LABEL[m]}</div>
              <div className="mode-option-help">{MODE_HELP[m]}</div>
            </div>
          </label>
        ))}
      </div>

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
              {s?.exteriorDataUrl && (
                <img src={s.exteriorDataUrl} alt="" className="final-card-thumb" />
              )}
              <div className="final-glyph">-{final}</div>
              <div className="final-set-name">
                {s?.name ?? <span className="empty-cta">+ Click to assign</span>}
              </div>
              {s?.rooms && (
                <div className="final-card-rooms">
                  {[1, 2, 3, 4, 5].map((t) => (
                    <span
                      key={t}
                      className={`final-card-room-dot ${s.rooms?.[t as 1 | 2 | 3 | 4 | 5] ? "filled" : ""}`}
                      title={`Tone ${t}`}
                    />
                  ))}
                </div>
              )}
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

      <PrepDeckButton />

      <LibraryIO />

      <footer className="wizard-footer">
        <button
          className="primary"
          onClick={onComplete}
          disabled={filled === 0}
          data-testid="next-button"
        >
          Continue → Generate ({filled}/{FINALS.length} done)
        </button>
      </footer>
    </div>
  );
}

interface SetDialogProps {
  readonly final: Final;
  readonly current?: { name?: string; rooms?: Partial<Record<1 | 2 | 3 | 4 | 5, string>>; exteriorDataUrl?: string; description?: string };
  readonly onSave: (value: { name: string; rooms?: Partial<Record<1 | 2 | 3 | 4 | 5, string>>; exteriorDataUrl?: string; description?: string }) => void;
  readonly onClose: () => void;
}

function SetDialog({ final, current, onSave, onClose }: SetDialogProps) {
  const modalRef = useModal(onClose);
  const [name, setName] = useState(current?.name ?? "");
  const [exteriorDataUrl, setExteriorDataUrl] = useState<string | undefined>(
    current?.exteriorDataUrl,
  );
  const [rooms, setRooms] = useState<Partial<Record<1 | 2 | 3 | 4 | 5, string>>>(
    current?.rooms ?? {},
  );
  const [description, setDescription] = useState<string>(current?.description ?? "");
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  async function generateCanonicalExterior() {
    if (!name.trim() || !description.trim()) return;
    setGenBusy(true);
    setGenError(null);
    try {
      const dataUrl = await generatePortrait({
        description: description.trim(),
        kind: "set",
        name: name.trim(),
      });
      setExteriorDataUrl(dataUrl);
    } catch (err) {
      setGenError((err as Error).message);
    } finally {
      setGenBusy(false);
    }
  }

  function readFile(file: File, cb: (dataUrl: string) => void) {
    const reader = new FileReader();
    reader.addEventListener("load", () => cb(reader.result as string));
    reader.readAsDataURL(file);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-wide"
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`set-dialog-title-${final}`}
      >
        <h2 id={`set-dialog-title-${final}`}>
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

        <label>
          Description (fallback if you don't have photos)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. 1970s split-level on a wooded street, red brick + white shutters, big oak in the front yard"
            rows={2}
            data-testid="set-description-input"
          />
        </label>
        {description.trim() && (
          <div className="portrait-gen-row">
            <button
              type="button"
              onClick={() => void generateCanonicalExterior()}
              disabled={genBusy || !name.trim()}
              data-testid="set-generate-exterior"
              title="Generate a canonical exterior shot from the description so the place looks the same across every card"
            >
              {genBusy ? "Generating exterior…" : "Generate canonical exterior from description"}
            </button>
            {genError && <span className="portrait-gen-error">{genError}</span>}
          </div>
        )}

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={!name.trim()}
            onClick={() =>
              onSave({
                description: description.trim() || undefined,
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
