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

const CATEGORY_LABEL: Record<ActorCategory, string> = {
  fictional: "Fictional characters",
  "god-or-leader": "Gods or world leaders",
  man: "Men in your life",
  woman: "Women in your life",
};
const CATEGORY_BLURB: Record<ActorCategory, string> = {
  fictional: "Memorable fictional people: Sherlock Holmes, Spider-Man, Frodo, Hermione.",
  "god-or-leader": "Larger-than-life figures: Zeus, Obama, Mandela, the Buddha, Beyoncé.",
  man: "Real men from your life: dad, brother, college roommate, your weird uncle.",
  woman: "Real women from your life: mom, sister, best friend, that one coworker.",
};
const CATEGORY_ORDER: ActorCategory[] = ["man", "woman", "fictional", "god-or-leader"];

export function ActorsWizard({ onComplete }: Props) {
  const { actors, setActor } = useActors();
  const [openInitial, setOpenInitial] = useState<Initial | null>(null);

  const filled = INITIALS.filter((i) => actors[i]?.name).length;

  // Group initials by Mandarin Blueprint's actor category so the user
  // sees them as ONE small bucket per group rather than 22 cards in
  // one big grid.
  const byCategory: Record<ActorCategory, Initial[]> = {
    fictional: [],
    "god-or-leader": [],
    man: [],
    woman: [],
  };
  for (const i of INITIALS) byCategory[SUGGESTED_CATEGORY[i]].push(i);

  return (
    <div className="wizard">
      <header className="wizard-header">
        <h1>Step 1 — Actors (Pinyin initials)</h1>
        <p>
          Pick a memorable real or fictional person for each Pinyin initial.
          Each actor will star in every hanzi whose pinyin starts with that
          initial — so they should be people you have strong, distinct visual
          memories of.
        </p>
        <p className="muted">
          Progress: <strong>{filled}</strong> / {INITIALS.length} assigned —{" "}
          {INITIALS.length - filled === 0
            ? "you're done!"
            : `${INITIALS.length - filled} to go`}
        </p>
      </header>

      {CATEGORY_ORDER.map((cat) => {
        const slots = byCategory[cat];
        const catFilled = slots.filter((i) => actors[i]?.name).length;
        return (
          <section key={cat} className="actor-category-section">
            <header className="actor-category-header">
              <h2>{CATEGORY_LABEL[cat]}</h2>
              <span className="actor-category-progress">
                {catFilled} / {slots.length}
              </span>
            </header>
            <p className="actor-category-blurb">{CATEGORY_BLURB[cat]}</p>
            <div className="initial-grid">
              {slots.map((initial) => {
                const a = actors[initial];
                return (
                  <button
                    key={initial}
                    className={`initial-card ${a?.name ? "filled" : "empty"}`}
                    onClick={() => setOpenInitial(initial)}
                    data-testid={`initial-card-${initial}`}
                  >
                    {a?.imageDataUrl && (
                      <img src={a.imageDataUrl} alt="" className="initial-card-thumb" />
                    )}
                    <div className="initial-glyph">{initial}</div>
                    <div className="initial-actor-name">
                      {a?.name ?? <span className="empty-cta">+ Click to assign</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

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
          Continue → Sets ({filled}/{INITIALS.length} done)
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
