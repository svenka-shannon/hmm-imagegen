import { useEffect, useState } from "react";
import { useActors, useSets } from "../lib/store";
import {
  addNotes,
  createDeck,
  deckFieldValues,
  deckProgress,
  storeMediaFile,
  type AnkiNote,
  type DeckProgress,
} from "../../../src/anki-connect";
import { fetchAsBase64, generateScene } from "../lib/imagegen-client";
import { useAnkiHealth } from "../components/AnkiHealthBanner";
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

// The freq/heisig/decomp JSON together weigh ~1.1MB. We load them
// asynchronously (Vite emits each as its own chunk) so navigating to
// step 3 doesn't block on a 522KB freq-list when the user just wants
// to see the source picker. Without this the GenerateDeck chunk
// would be 800KB+ even after lazy-loading the page itself.
interface LoadedData {
  decomp: Record<string, string[]>;
  freq: UnifiedEntry[];
  heisig: UnifiedEntry[];
}

async function loadData(): Promise<LoadedData> {
  const [freqMod, heisigMod, decompMod] = await Promise.all([
    import("../data/freq-top.json"),
    import("../data/heisig.json"),
    import("../data/decomp.json"),
  ]);
  return {
    decomp: decompMod.default as Record<string, string[]>,
    freq: (freqMod.default as FreqEntry[]).map(fromFreq),
    heisig: (heisigMod.default as HeisigEntry[])
      .map(fromHeisig)
      .filter((e): e is UnifiedEntry => e !== null),
  };
}

const DECK_NAME_DEFAULT = "HMM Generated Hanzi";

export function GenerateDeck() {
  const ankiHealth = useAnkiHealth();
  const ankiReady = ankiHealth?.connected === true;
  const { actors } = useActors();
  const { sets } = useSets();
  const [data, setData] = useState<LoadedData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadData()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err: Error) => { if (!cancelled) setDataError(err.message); });
    return () => { cancelled = true; };
  }, []);
  const [source, setSource] = useState<SourceList>("top-freq");
  const [count, setCount] = useState(20);
  const [deckName, setDeckName] = useState(DECK_NAME_DEFAULT);
  const [onlyReady, setOnlyReady] = useState(true);
  const [generateImages, setGenerateImages] = useState(false);
  const [imageBackend, setImageBackend] = useState<"gemini" | "mock">("gemini");
  const [imageModel, setImageModel] = useState("gemini-2.5-flash-image");
  const [stylePrefix, setStylePrefix] = useState(() => localStorage.getItem("hmm.stylePrefix") ?? "");
  const [forceUpdate, setForceUpdate] = useState(false);
  const [busy, setBusy] = useState(false);
  // Sync flow — top up the deck's new-card buffer when it runs low,
  // so daily review never bottoms out. Defaults tuned for ~5/day study
  // pace: if you have <10 unseen, add 20 more.
  const [progress, setProgress] = useState<DeckProgress | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncThreshold, setSyncThreshold] = useState(() =>
    Number(localStorage.getItem("hmm.syncThreshold") ?? 10),
  );
  const [syncBatch, setSyncBatch] = useState(() =>
    Number(localStorage.getItem("hmm.syncBatch") ?? 20),
  );
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewScene, setPreviewScene] = useState<string | null>(null);
  const [previewHanzi, setPreviewHanzi] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  // A card is "ready" for inclusion when its actor + set slots are
  // filled. When image-gen is on, "ready" tightens to also require
  // a SUBJECT REFERENCE for both — either a reference image (highest
  // fidelity) or a free-text description (less consistent but better
  // than nothing for slots where the user has no usable photo).
  // Admin's HMM rule still holds: cards never fall back to "Arnold in
  // a random kitchen" — they always carry SOME reference signal.
  function setHasRefForTone(
    set:
      | {
          rooms?: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;
          exteriorDataUrl?: string;
          description?: string;
        }
      | undefined,
    tone: 1 | 2 | 3 | 4 | 5,
  ): boolean {
    if (!set) return false;
    if (set.rooms?.[tone]) return true;
    if (set.exteriorDataUrl) return true;
    return Boolean(set.description?.trim());
  }
  function actorHasRef(
    actor: { imageDataUrl?: string; imageDataUrls?: string[]; description?: string } | undefined,
  ): boolean {
    if (!actor) return false;
    if (actor.imageDataUrls && actor.imageDataUrls.length > 0) return true;
    if (actor.imageDataUrl) return true;
    return Boolean(actor.description?.trim());
  }
  function isCardReady(entry: { pinyin: string }, requireRefs: boolean): boolean {
    const parts = parsePinyin(entry.pinyin);
    if (!parts) return false;
    const actor = actors[parts.initial];
    const set = sets[parts.final];
    if (!actor || !set) return false;
    if (!requireRefs) return true;
    if (!actorHasRef(actor)) return false;
    if (!setHasRefForTone(set, parts.tone)) return false;
    return true;
  }

  function pickSource(s: SourceList): UnifiedEntry[] {
    if (!data) return [];
    return s === "heisig-rth" ? data.heisig : data.freq;
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
        if (!actorHasRef(actor)) { unreadyForActorRef++; continue; }
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
      if ((a.imageDataUrls && a.imageDataUrls.length > 0) || a.imageDataUrl) actorsWithRef++;
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
      const components = data!.decomp[candidate.hanzi] ?? [];
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
    return runBuild(count, { clearLog: true });
  }

  /**
   * Pull deck stats from AnkiConnect — count of new (unseen), learning,
   * review, mature, and total cards in `deckName`. Surfaced in the
   * Sync section so the user can see where they are without leaving
   * the app.
   */
  async function refreshProgress() {
    setProgressError(null);
    try {
      const p = await deckProgress(deckName);
      setProgress(p);
      return p;
    } catch (err) {
      setProgressError((err as Error).message);
      return null;
    }
  }

  /**
   * "Sync with Anki" — pulls progress, and if the new-card buffer is
   * below `syncThreshold`, tops up by `syncBatch` more entries from
   * the active source. Idempotent (dedup-by-Hanzi inside runBuild).
   */
  async function sync() {
    setSyncBusy(true);
    setLog([]);
    try {
      appendLog(`Syncing with Anki deck "${deckName}"…`);
      const p = await refreshProgress();
      if (!p) {
        appendLog(`  could not read deck progress${progressError ? `: ${progressError}` : ""}`);
        return;
      }
      appendLog(
        `  ${p.total} total · ${p.newBuffer} new · ${p.learning} learning · ${p.review} review · ${p.mature} mature (ivl≥21d)`,
      );
      if (p.newBuffer >= syncThreshold) {
        appendLog(
          `  buffer healthy (${p.newBuffer} ≥ threshold ${syncThreshold}) — nothing to top up`,
        );
        return;
      }
      appendLog(`  buffer low (${p.newBuffer} < ${syncThreshold}) — adding ${syncBatch} more`);
      await runBuild(syncBatch);
      const after = await refreshProgress();
      if (after) {
        appendLog(`  done · deck now has ${after.total} total · ${after.newBuffer} new`);
      }
    } finally {
      setSyncBusy(false);
    }
  }

  async function runBuild(targetCount: number, opts: { clearLog?: boolean } = {}) {
    setBusy(true);
    if (opts.clearLog) setLog([]);
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
      // forceUpdate is the opt-in escape hatch — when ON, existing
      // hanzi are eligible too. This RESETS their review schedule in
      // Anki, so it's off by default (admin spec: "When images change
      // or get added we shouldn't update the card statuses").
      const all = pickSource(source);
      const filtered = all.filter((entry) => {
        if (!forceUpdate && existing.has(entry.hanzi)) return false;
        if (!onlyReady && !generateImages) return true;
        return isCardReady(entry, generateImages);
      });
      const picked = filtered.slice(0, targetCount);
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
        const components = data!.decomp[entry.hanzi] ?? [];
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

  if (dataError) {
    return (
      <div className="wizard">
        <header className="wizard-header">
          <h1>Step 3 — Generate Hanzi deck</h1>
        </header>
        <div className="error-banner">
          <strong>Failed to load character data.</strong> {dataError}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="wizard" data-testid="generate-loading">
        <header className="wizard-header">
          <h1>Step 3 — Generate Hanzi deck</h1>
          <p className="muted">Loading character data…</p>
        </header>
        <div className="loading-row">
          <span className="spinner" /> Loading freq + Heisig + decomp lists (~1MB)…
        </div>
      </div>
    );
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

        <label className="checkbox-row" title="Default OFF — re-runs are additive, existing cards' review schedules are untouched. Turn ON to refresh images on existing cards (resets their schedule).">
          <input
            type="checkbox"
            checked={forceUpdate}
            onChange={(e) => setForceUpdate(e.target.checked)}
            data-testid="force-update-checkbox"
          />
          Force-refresh existing cards (resets review schedule)
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
            {previewBusy ? (
              <>
                <span className="spinner" /> Generating preview…
              </>
            ) : (
              "Preview one card"
            )}
          </button>
          <button
            className="primary"
            onClick={build}
            disabled={busy || previewBusy || !deckName.trim() || (onlyReady && eligibleStats.ready === 0) || !ankiReady}
            data-testid="generate-button"
            title={!ankiReady ? "AnkiConnect not reachable — start Anki desktop with the AnkiConnect add-on installed" : undefined}
          >
            {busy ? (
              <>
                <span className="spinner" /> Building…
              </>
            ) : (
              "Build & push to Anki"
            )}
          </button>
        </div>

        {!ankiReady && (
          <div className="error-banner" data-testid="anki-not-ready-banner">
            <strong>⚠ Anki not reachable.</strong> Start Anki desktop and
            install the <a href="https://foosoft.net/projects/anki-connect/" target="_blank" rel="noreferrer">AnkiConnect</a> add-on
            (code <code>2055492159</code>) before building. The wizard works
            without it, but the final push will fail.
          </div>
        )}
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

      <section className="sync-section" data-testid="sync-section">
        <h3>Sync with Anki</h3>
        <p className="muted">
          As you review the deck in Anki, the buffer of unseen "new" cards
          shrinks. Click Sync to pull current progress; if the buffer drops
          below the threshold, the next batch of characters is added
          automatically — using the source + image-gen settings above.
        </p>

        {progress && (
          <div className="sync-progress" data-testid="sync-progress">
            <div className="sync-stat"><strong>{progress.total}</strong><span>total</span></div>
            <div className="sync-stat"><strong>{progress.newBuffer}</strong><span>new (unseen)</span></div>
            <div className="sync-stat"><strong>{progress.learning}</strong><span>learning</span></div>
            <div className="sync-stat"><strong>{progress.review}</strong><span>review</span></div>
            <div className="sync-stat"><strong>{progress.mature}</strong><span>mature (≥21d)</span></div>
          </div>
        )}
        {progressError && (
          <div className="error-banner" data-testid="sync-error">{progressError}</div>
        )}

        <div className="sync-controls">
          <label>
            Top up when new &lt;
            <input
              type="number"
              min={0}
              max={1000}
              value={syncThreshold}
              onChange={(e) => {
                const v = Math.max(0, Number(e.target.value));
                setSyncThreshold(v);
                localStorage.setItem("hmm.syncThreshold", String(v));
              }}
              data-testid="sync-threshold-input"
            />
          </label>
          <label>
            Batch size
            <input
              type="number"
              min={1}
              max={500}
              value={syncBatch}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value));
                setSyncBatch(v);
                localStorage.setItem("hmm.syncBatch", String(v));
              }}
              data-testid="sync-batch-input"
            />
          </label>
        </div>

        <div className="sync-actions">
          <button
            onClick={() => void refreshProgress()}
            disabled={syncBusy || busy || !ankiReady}
            data-testid="refresh-progress-button"
            title="Read deck stats from AnkiConnect without adding cards"
          >
            Refresh stats
          </button>
          <button
            className="primary"
            onClick={() => void sync()}
            disabled={syncBusy || busy || previewBusy || !ankiReady || !deckName.trim() || (onlyReady && eligibleStats.ready === 0)}
            data-testid="sync-button"
            title={!ankiReady ? "AnkiConnect not reachable" : "Pull progress + top up the new-card buffer if it's low"}
          >
            {syncBusy ? (
              <>
                <span className="spinner" /> Syncing…
              </>
            ) : (
              "Sync with Anki"
            )}
          </button>
        </div>
      </section>

      {log.length > 0 && (
        <pre className="generate-log" data-testid="generate-log">
          {log.join("\n")}
        </pre>
      )}
    </div>
  );
}
