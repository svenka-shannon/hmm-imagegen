import { useState } from "react";
import { INITIALS, type Initial, type ActorCategory } from "../../../src/pinyin";
import { useActors } from "../lib/store";
import { PrepDeckButton } from "../components/PrepDeckButton";

interface Props {
  readonly onComplete: () => void;
}

const SUGGESTED_CATEGORY: Record<Initial, ActorCategory> = {
  // Men
  b: "man", p: "man", m: "man", f: "man",
  // Women
  d: "woman", t: "woman", n: "woman", l: "woman",
  // Fictional
  g: "fictional", k: "fictional", h: "fictional",
  j: "fictional", q: "fictional", x: "fictional",
  // Gods / world leaders
  zh: "god-or-leader", ch: "god-or-leader", sh: "god-or-leader", r: "god-or-leader",
  z: "god-or-leader", c: "god-or-leader", s: "god-or-leader",
  // Null-initial — special; usually the user themselves or no actor
  "∅": "man",
};

export function ActorsWizard({ onComplete }: Props) {
  const { actors, setActor } = useActors();
  const [openInitial, setOpenInitial] = useState<Initial | null>(null);

  const filled = INITIALS.filter((i) => actors[i]?.name).length;

  return (
    <div className="wizard">
      <header className="wizard-header">
        <h1>Step 1 — Actors (Pinyin initials)</h1>
        <p>
          Pick a memorable real or fictional person for each initial. The more
          distinctive, the better. Each actor will star in every hanzi whose
          pinyin starts with that initial.
        </p>
        <p className="muted">{filled} / {INITIALS.length} assigned</p>
      </header>

      <div className="initial-grid">
        {INITIALS.map((initial) => {
          const a = actors[initial];
          return (
            <button
              key={initial}
              className={`initial-card ${a?.name ? "filled" : "empty"}`}
              onClick={() => setOpenInitial(initial)}
              data-testid={`initial-card-${initial}`}
            >
              <div className="initial-glyph">{initial}</div>
              <div className="initial-actor-name">
                {a?.name ?? <em>unassigned</em>}
              </div>
              <div className="initial-category-hint">
                ({SUGGESTED_CATEGORY[initial]})
              </div>
            </button>
          );
        })}
      </div>

      {openInitial && (
        <ActorDialog
          initial={openInitial}
          current={actors[openInitial]}
          onSave={(name, category, imageDataUrl) => {
            setActor(openInitial, { category, imageDataUrl, name });
            setOpenInitial(null);
          }}
          onClose={() => setOpenInitial(null)}
        />
      )}

      <PrepDeckButton />

      <footer className="wizard-footer">
        <button
          className="primary"
          onClick={onComplete}
          disabled={filled === 0}
          data-testid="next-button"
        >
          Continue → Sets
        </button>
      </footer>
    </div>
  );
}

interface ActorDialogProps {
  readonly initial: Initial;
  readonly current?: { name?: string; category?: ActorCategory; imageDataUrl?: string };
  readonly onSave: (name: string, category: ActorCategory, imageDataUrl?: string) => void;
  readonly onClose: () => void;
}

function ActorDialog({ initial, current, onSave, onClose }: ActorDialogProps) {
  const [name, setName] = useState(current?.name ?? "");
  const [category, setCategory] = useState<ActorCategory>(
    current?.category ?? SUGGESTED_CATEGORY[initial],
  );
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(
    current?.imageDataUrl,
  );

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setImageDataUrl(reader.result as string);
    });
    reader.readAsDataURL(file);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          Actor for initial <code className="big">{initial}-</code>
        </h2>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Arnold Schwarzenegger"
            autoFocus
            data-testid="actor-name-input"
          />
        </label>
        <label>
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ActorCategory)}
          >
            <option value="man">Man</option>
            <option value="woman">Woman</option>
            <option value="fictional">Fictional</option>
            <option value="god-or-leader">God or world leader</option>
          </select>
        </label>
        <label>
          Reference image (optional, recommended)
          <input
            type="file"
            accept="image/*"
            onChange={handleFile}
            data-testid="actor-image-input"
          />
        </label>
        {imageDataUrl && (
          <img src={imageDataUrl} alt="" className="actor-preview" />
        )}
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={!name.trim()}
            onClick={() => onSave(name.trim(), category, imageDataUrl)}
            data-testid="actor-save-button"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
