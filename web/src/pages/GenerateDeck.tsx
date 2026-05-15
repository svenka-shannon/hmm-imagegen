import { useState } from "react";
import { useActors, useSets } from "../lib/store";
import {
  addNotes,
  createDeck,
  deckFieldValues,
  storeMediaFile,
  type AnkiNote,
} from "../../../src/anki-connect";
import { fetchAsBase64, generateScene } from "../lib/imagegen-client";
import { parsePinyin } from "../../../src/pinyin";
import { buildScene, estimateCost, resolveLibrary } from "../../../src/scene-prompt";
import {
  fromFreq,
  fromHeisig,
  type FreqEntry,
  type HeisigEntry,
  type SourceList,
  type UnifiedEntry,
} from "../../../src/sources";
import freqData from "../data/freq-top.json";
import heisigData from "../data/heisig.json";
import decompData from "../data/decomp.json";

const DECOMP = decompData as Record<string, string[]>;

const FREQ_ENTRIES: UnifiedEntry[] = (freqData as FreqEntry[]).map(fromFreq);
const HEISIG_ENTRIES: UnifiedEntry[] = (heisigData as HeisigEntry[])
  .map(fromHeisig)
  .filter((e): e is UnifiedEntry => e !== null);

function pickSource(s: SourceList): UnifiedEntry[] {
  return s === "heisig-rth" ? HEISIG_ENTRIES : FREQ_ENTRIES;
}

const DECK_NAME_DEFAULT = "HMM Generated Hanzi";

export function GenerateDeck() {
  const { actors } = useActors();
  const { sets } = useSets();
  const [source, setSource] = useState<SourceList>("top-freq");
  const [count, setCount] = useState(20);
  const [deckName, setDeckName] = useState(DECK_NAME_DEFAULT);
  const [onlyReady, setOnlyReady] = useState(true);
  const [generateImages, setGenerateImages] = useState(false);
  const [imageBackend, setImageBackend] = useState<"gemini" | "mock">("gemini");
  const [imageModel, setImageModel] = useState("gemini-2.5-flash-image");
  const [stylePrefix, setStylePrefix] = useState(() => localStorage.getItem("hmm.stylePrefix") ?? "");
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewScene, setPreviewScene] = useState<string | null>(null);
  const [previewHanzi, setPreviewHanzi] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  // A card is "ready" for inclusion when its actor + set slots are
  // filled. When image-gen is on, "ready" tightens to also require
  // reference images for both — admin's HMM rule:
  // "It should be based on the references" — generating Arnold in
  // a random kitchen defeats the whole HMM premise of using YOUR
  // specific actors + YOUR specific locations.
  function setHasRefForTone(
    set: { rooms?: Partial<Record<1 | 2 | 3 | 4 | 5, string>>; exteriorDataUrl?: string } | undefined,
    tone: 1 | 2 | 3 | 4 | 5,
  ): boolean {
    if (!set) return false;
    if (set.rooms?.[tone]) return true;
    return Boolean(set.exteriorDataUrl);
  }
  function isCardReady(entry: { pinyin: string }, requireRefs: boolean): boolean {
    const parts = parsePinyin(entry.pinyin);
    if (!parts) return false;
    const actor = actors[parts.initial];
    const set = sets[parts.final];
    if (!actor || !set) return false;
    if (!requireRefs) return true;
    if (!actor.imageDataUrl) return false;
    if (!setHasRefForTone(set, parts.tone)) return false;
    return true;
  }

  // Live preview of how many entries from the chosen source are
  // resolvable with the user's current actor + set library.
  const eligibleStats = (() => {
    const all = pickSource(source);
    let ready = 0;
    let unreadyForInitial = 0;
    let unreadyForFinal = 0;
    let unreadyForActorRef = 0;
    let unreadyForSetRef = 0;
    for (const entry of all) {
      const parts = parsePinyin(entry.pinyin);
      if (!parts) continue;
      const actor = actors[parts.initial];
      const set = sets[parts.final];
      if (!actor) { unreadyForInitial++; continue; }
      if (!set) { unreadyForFinal++; continue; }
      if (generateImages) {
        if (!actor.imageDataUrl) { unreadyForActorRef++; continue; }
        if (!setHasRefForTone(set, parts.tone)) { unreadyForSetRef++; continue; }
      }
      ready++;
    }
    return { ready, total: all.length, unreadyForActorRef, unreadyForInitial, unreadyForFinal, unreadyForSetRef };
  })();

  // Fidelity check — count actor/set slots that have a reference image.
  // Surfaced as a warning when image-gen is on so the user knows
  // consistency-across-cards will be weaker without refs.
  const refStats = (() => {
    let actorsWithRef = 0;
    let actorsTotal = 0;
    let setsWithRef = 0;
    let setsTotal = 0;
    for (const a of Object.values(actors)) {
      if (!a) continue;
      actorsTotal++;
      if (a.imageDataUrl) actorsWithRef++;
    }
    for (const s of Object.values(sets)) {
      if (!s) continue;
      setsTotal++;
      // A set "has a ref" if it has at least one room OR an exterior.
      const hasAnyRoom = s.rooms && Object.values(s.rooms).some((u) => Boolean(u));
      if (hasAnyRoom || s.exteriorDataUrl) setsWithRef++;
    }
    return { actorsWithRef, actorsTotal, setsTotal, setsWithRef };
  })();

  function appendLog(line: string) {
    setLog((prev) => [...prev, line]);
  }

  /**
   * Render one card end-to-end (scene prompt → image-gen → preview) without
   * touching Anki. Picks the first eligible entry from the active source so
   * the user can sanity-check what their actor/set library produces.
   */
  async function preview() {
    setPreviewBusy(true);
    setPreviewUrl(null);
    setPreviewScene(null);
    setPreviewHanzi(null);
    try {
      const all = pickSource(source);
      // Preview uses the same readiness rule as the build path: if
      // image-gen is on, the candidate must have BOTH refs.
      const candidate = all.find((entry) => isCardReady(entry, generateImages));
      if (!candidate) {
        appendLog(
          generateImages
            ? "preview: no eligible character — every actor + set used must have reference images uploaded"
            : "preview: no eligible character — assign at least one actor + set pair",
        );
        return;
      }
      const parts = parsePinyin(candidate.pinyin)!;
      const lib = resolveLibrary(parts, actors, sets)!;
      const components = DECOMP[candidate.hanzi] ?? [];
      const scene = buildScene({
        actor: lib.actor,
        components,
        meaning: candidate.meaning,
        pinyin: parts,
        set: lib.set,
        stylePrefix: stylePrefix || undefined,
      });
      setPreviewHanzi(candidate.hanzi);
      setPreviewScene(scene.short);
      const gen = await generateScene({
        backend: imageBackend,
        model: imageModel,
        prompt: scene.long,
        refs: scene.refs.map((r) => r.dataUrl),
      });
      setPreviewUrl(gen.url);
      appendLog(`preview: ${candidate.hanzi} → ${gen.url}`);
    } catch (err) {
      appendLog(`preview failed: ${(err as Error).message}`);
    } finally {
      setPreviewBusy(false);
    }
  }

  async function build() {
    setBusy(true);
    setLog([]);
    try {
      appendLog(`Creating deck: ${deckName} (no-op if it already exists)`);
      await createDeck(deckName);
      appendLog("OK");

      // Pre-fetch existing Hanzi in the deck so re-runs are incremental.
      // The dedupe key is the "Hanzi" field — Anki's allowDuplicate:false
      // also rejects re-adds at insert time, but doing it here gives us a
      // clean "X new, Y already in deck" preview AND avoids the failed-
      // insert log noise.
      appendLog("Fetching existing notes in deck for dedup…");
      const existing = new Set<string>(
        await deckFieldValues(deckName, "Hanzi").catch((err: Error) => {
          appendLog(`  (could not read existing notes: ${err.message}; will rely on Anki's dedup)`);
          return [];
        }),
      );
      appendLog(`  ${existing.size} hanzi already in deck — will skip those`);

      // Filter source list based on the onlyReady toggle + existing-dedup
      // BEFORE slicing by count — so "count=20, onlyReady=true" means
      // "first 20 NEW resolvable chars" not "first 20 chars total".
      // When image-gen is on, readiness ALSO requires ref images for
      // the actor + set (HMM rule: scenes must be based on YOUR refs,
      // not a generic kitchen).
      const all = pickSource(source);
      const filtered = all.filter((entry) => {
        if (existing.has(entry.hanzi)) return false;
        if (!onlyReady && !generateImages) return true;
        return isCardReady(entry, generateImages);
      });
      const picked = filtered.slice(0, count);
      appendLog(
        `Source ${source}: ${all.length} total, ${existing.size} already in deck, ${filtered.length} new+eligible, taking first ${picked.length}`,
      );
      const notes: AnkiNote[] = [];
      let skipped = 0;
      for (const entry of picked) {
        const parts = parsePinyin(entry.pinyin);
        if (!parts) {
          appendLog(`  skip ${entry.hanzi}: cannot parse pinyin "${entry.pinyin}"`);
          skipped++;
          continue;
        }
        const lib = resolveLibrary(parts, actors, sets);
        if (!lib) {
          appendLog(`  skip ${entry.hanzi}: missing actor for "${parts.initial}-" or set for "-${parts.final}"`);
          skipped++;
          continue;
        }
        const components = DECOMP[entry.hanzi] ?? [];
        const scene = buildScene({
          actor: lib.actor,
          components,
          meaning: entry.meaning,
          pinyin: parts,
          set: lib.set,
          stylePrefix: stylePrefix || undefined,
        });
        appendLog(`  ${entry.hanzi} (${entry.pinyin}) → ${scene.short}`);

        // Optional image generation. One scene per card. Failures are
        // non-fatal — the note still gets pushed without an image so the
        // user has a usable card and can re-generate later.
        let imageTag = "";
        if (generateImages) {
          try {
            const gen = await generateScene({
              backend: imageBackend,
              model: imageModel,
              prompt: scene.long,
              refs: scene.refs.map((r) => r.dataUrl),
            });
            const base64 = await fetchAsBase64(gen.url);
            const ankiFilename = `hmm-${entry.hanzi}-${parts.tone}-${Date.now()}.png`;
            await storeMediaFile(ankiFilename, base64);
            imageTag = `<div><img src="${ankiFilename}" style="max-width: 400px"></div>`;
            appendLog(`     ↳ generated image (${ankiFilename})`);
          } catch (err) {
            appendLog(`     ↳ image-gen failed: ${(err as Error).message}`);
          }
        }

        notes.push({
          deckName,
          fields: {
            Front: entry.hanzi,
            Back: `${imageTag}<div><strong>${entry.pinyin}</strong></div><div>${entry.meaning}</div><div><em>${scene.short}</em></div>`,
            Components: components.join(""),
            Hanzi: entry.hanzi,
            Meaning: entry.meaning,
            Pinyin: entry.pinyin,
            Scene: scene.short,
            ScenePrompt: scene.long,
          },
          modelName: "Basic",
          options: { allowDuplicate: false },
          tags: ["hmm-imagegen", source, ...components.map((c) => `comp:${c}`)],
        });
      }
      if (skipped > 0) appendLog(`(${skipped} skipped due to missing library entries)`);
      appendLog(`Pushing ${notes.length} notes…`);
      const result = await addNotes(notes);
      const ok = result.filter((id) => id !== null).length;
      appendLog(`Added ${ok}/${notes.length} notes to ${deckName}.`);
    } catch (err) {
      appendLog(`ERROR: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wizard">
      <header className="wizard-header">
        <h1>Step 3 — Generate Hanzi deck</h1>
        <p>
          Pick a source list, choose how many characters to include, and push
          a new deck to Anki. Image generation comes in the next step (you'll
          provide an API key).
        </p>
      </header>

      <div className="generate-form">
        <label>
          Source list
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as SourceList)}
            data-testid="source-select"
          >
            <option value="top-freq">Top-N by frequency</option>
            <option value="heisig-rth">Heisig RTH order (1-3000)</option>
          </select>
        </label>

        <label>
          How many characters
          <input
            type="number"
            value={count}
            min={1}
            max={3000}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
            data-testid="count-input"
          />
        </label>

        <label>
          Deck name
          <input
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            data-testid="deck-name-input"
          />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={onlyReady}
            onChange={(e) => setOnlyReady(e.target.checked)}
            data-testid="only-ready-checkbox"
          />
          Only include hanzi whose actor + set are ready
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={generateImages}
            onChange={(e) => setGenerateImages(e.target.checked)}
            data-testid="generate-images-checkbox"
          />
          Generate scene images (Gemini / nano-banana)
        </label>

        {generateImages && (
          <>
            <label>
              Image backend
              <select
                value={imageBackend}
                onChange={(e) => setImageBackend(e.target.value as "gemini" | "mock")}
                data-testid="image-backend-select"
              >
                <option value="gemini">Gemini (nano-banana)</option>
                <option value="mock">Mock (1x1 PNG, no API calls)</option>
              </select>
            </label>

            <label>
              Model
              <select
                value={imageModel}
                onChange={(e) => setImageModel(e.target.value)}
                disabled={imageBackend === "mock"}
                data-testid="image-model-select"
              >
                <option value="gemini-2.5-flash-image">2.5 Flash Image (cheaper, faster)</option>
                <option value="gemini-3-pro-image-preview">3 Pro Image (better quality)</option>
              </select>
            </label>

            <label className="style-prefix-label">
              Style prefix (optional)
              <textarea
                value={stylePrefix}
                onChange={(e) => {
                  setStylePrefix(e.target.value);
                  localStorage.setItem("hmm.stylePrefix", e.target.value);
                }}
                placeholder='e.g. "Studio Ghibli anime style, hand-drawn line art with watercolor wash"'
                rows={2}
                data-testid="style-prefix-input"
              />
            </label>
          </>
        )}

        <div className="eligibility-stats" data-testid="eligibility-stats">
          <strong>{eligibleStats.ready}</strong> / {eligibleStats.total} eligible
          {eligibleStats.ready < eligibleStats.total && (
            <span className="muted">
              {" "}
              · {eligibleStats.unreadyForInitial} blocked by missing actors
              · {eligibleStats.unreadyForFinal} blocked by missing sets
              {generateImages && (eligibleStats.unreadyForActorRef > 0 || eligibleStats.unreadyForSetRef > 0) && (
                <>
                  {" "}
                  · {eligibleStats.unreadyForActorRef} blocked by no actor photo
                  · {eligibleStats.unreadyForSetRef} blocked by no room/exterior photo
                </>
              )}
            </span>
          )}
        </div>

        {generateImages && imageBackend === "gemini" && (() => {
          const willGen = Math.min(count, onlyReady ? eligibleStats.ready : eligibleStats.total);
          const est = estimateCost(imageModel, willGen);
          return (
            <div className="cost-estimate" data-testid="cost-estimate">
              <strong>Estimated cost: ${est.total.toFixed(2)}</strong>
              <span className="muted">
                {" "}
                · {willGen} image{willGen === 1 ? "" : "s"} × ${est.perImage.toFixed(3)}/img · {est.label}
              </span>
            </div>
          );
        })()}

        {generateImages && (refStats.actorsWithRef < refStats.actorsTotal || refStats.setsWithRef < refStats.setsTotal) && (
          <div className="fidelity-warning" data-testid="fidelity-warning">
            <strong>HMM requirement</strong> · scenes are generated from YOUR actor + location refs. Cards missing either ref are EXCLUDED from the deck (no generic-kitchen fallback). Currently {refStats.actorsWithRef}/{refStats.actorsTotal} actors and {refStats.setsWithRef}/{refStats.setsTotal} sets have ref photos — upload more in steps 1-2 to expand eligibility.
          </div>
        )}

        <div className="generate-actions">
          <button
            onClick={preview}
            disabled={previewBusy || busy || eligibleStats.ready === 0}
            data-testid="preview-button"
            title="Render one sample card without pushing to Anki"
          >
            {previewBusy ? "Generating preview…" : "Preview one card"}
          </button>
          <button
            className="primary"
            onClick={build}
            disabled={busy || previewBusy || !deckName.trim() || (onlyReady && eligibleStats.ready === 0)}
            data-testid="generate-button"
          >
            {busy ? "Building…" : "Build & push to Anki"}
          </button>
        </div>
      </div>

      {(previewUrl || previewScene) && (
        <div className="preview-card" data-testid="preview-card">
          <div className="preview-meta">
            <strong>{previewHanzi}</strong>
            <span className="muted">{previewScene}</span>
          </div>
          {previewUrl && (
            <img src={previewUrl} alt={previewScene ?? ""} className="preview-image" />
          )}
        </div>
      )}

      {log.length > 0 && (
        <pre className="generate-log" data-testid="generate-log">
          {log.join("\n")}
        </pre>
      )}
    </div>
  );
}
