import { useState } from "react";
import { INITIALS, type Initial, type ActorCategory } from "../../../src/pinyin";
import { useActors } from "../lib/store";
import { PrepDeckButton } from "../components/PrepDeckButton";
import { LibraryIO } from "../components/LibraryIO";
import { useModal } from "../lib/use-modal";

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
                    {(a?.imageDataUrls?.[0] ?? a?.imageDataUrl) && (
                      <img src={a?.imageDataUrls?.[0] ?? a?.imageDataUrl} alt="" className="initial-card-thumb" />
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
          onSave={(name, category, imageDataUrls, description) => {
            setActor(openInitial, { category, description, imageDataUrls, name });
            setOpenInitial(null);
          }}
          onClose={() => setOpenInitial(null)}
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
          Continue → Sets ({filled}/{INITIALS.length} done)
        </button>
      </footer>
    </div>
  );
}

interface ActorDialogProps {
  readonly initial: Initial;
  readonly current?: { name?: string; category?: ActorCategory; imageDataUrl?: string; imageDataUrls?: string[]; description?: string };
  readonly onSave: (
    name: string,
    category: ActorCategory,
    imageDataUrls: string[] | undefined,
    description?: string,
  ) => void;
  readonly onClose: () => void;
}

function ActorDialog({ initial, current, onSave, onClose }: ActorDialogProps) {
  const modalRef = useModal(onClose);
  const [name, setName] = useState(current?.name ?? "");
  const [category, setCategory] = useState<ActorCategory>(
    current?.category ?? SUGGESTED_CATEGORY[initial],
  );
  // Multi-ref images: an array of data URLs. Older state with a single
  // imageDataUrl is promoted to a one-element array on dialog open so
  // saving cleanly migrates the legacy field.
  const [imageDataUrls, setImageDataUrls] = useState<string[]>(() => {
    if (current?.imageDataUrls && current.imageDataUrls.length > 0) return current.imageDataUrls;
    return current?.imageDataUrl ? [current.imageDataUrl] : [];
  });
  const [description, setDescription] = useState<string>(current?.description ?? "");

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    Promise.all(
      files.map(
        (f) =>
          new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.addEventListener("load", () => res(r.result as string));
            r.addEventListener("error", () => rej(r.error));
            r.readAsDataURL(f);
          }),
      ),
    )
      .then((urls) => setImageDataUrls((prev) => [...prev, ...urls]))
      .catch(() => { /* ignore — the user can re-upload */ });
    e.target.value = ""; // allow re-selecting the same file
  }
  function removeImage(idx: number) {
    setImageDataUrls((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`actor-dialog-title-${initial}`}
      >
        <h2 id={`actor-dialog-title-${initial}`}>
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
          Reference photos (2-4 different angles work best)
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFiles}
            data-testid="actor-image-input"
          />
        </label>
        {imageDataUrls.length > 0 && (
          <div className="actor-preview-row" data-testid="actor-preview-row">
            {imageDataUrls.map((url, idx) => (
              <div key={idx} className="actor-preview-tile">
                <img src={url} alt="" className="actor-preview-thumb" />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="actor-preview-remove"
                  aria-label={`Remove photo ${idx + 1}`}
                >×</button>
              </div>
            ))}
          </div>
        )}
        <label>
          Description (fallback if you don't have a photo)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. tall thin grandfatherly character with a slightly protruding jaw, miserly"
            rows={2}
            data-testid="actor-description-input"
          />
        </label>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={!name.trim()}
            onClick={() => onSave(name.trim(), category, imageDataUrls.length > 0 ? imageDataUrls : undefined, description.trim() || undefined)}
            data-testid="actor-save-button"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
