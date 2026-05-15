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
import { buildScene, resolveLibrary } from "../../../src/scene-prompt";
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
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  // Live preview of how many entries from the chosen source are
  // resolvable with the user's current actor + set library.
  const eligibleStats = (() => {
    const all = pickSource(source);
    let ready = 0;
    let unreadyForInitial = 0;
    let unreadyForFinal = 0;
    for (const entry of all) {
      const parts = parsePinyin(entry.pinyin);
      if (!parts) continue;
      const hasActor = !!actors[parts.initial];
      const hasSet = !!sets[parts.final];
      if (hasActor && hasSet) ready++;
      else if (!hasActor) unreadyForInitial++;
      else unreadyForFinal++;
    }
    return { ready, total: all.length, unreadyForInitial, unreadyForFinal };
  })();

  function appendLog(line: string) {
    setLog((prev) => [...prev, line]);
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
      const all = pickSource(source);
      const filtered = all.filter((entry) => {
        if (existing.has(entry.hanzi)) return false;
        if (!onlyReady) return true;
        const parts = parsePinyin(entry.pinyin);
        if (!parts) return false;
        return Boolean(actors[parts.initial]) && Boolean(sets[parts.final]);
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
        )}

        <div className="eligibility-stats" data-testid="eligibility-stats">
          <strong>{eligibleStats.ready}</strong> / {eligibleStats.total} eligible
          {eligibleStats.ready < eligibleStats.total && (
            <span className="muted">
              {" "}
              · {eligibleStats.unreadyForInitial} blocked by missing actors
              · {eligibleStats.unreadyForFinal} blocked by missing sets
            </span>
          )}
        </div>

        <button
          className="primary"
          onClick={build}
          disabled={busy || !deckName.trim() || (onlyReady && eligibleStats.ready === 0)}
          data-testid="generate-button"
        >
          {busy ? "Building…" : "Build & push to Anki"}
        </button>
      </div>

      {log.length > 0 && (
        <pre className="generate-log" data-testid="generate-log">
          {log.join("\n")}
        </pre>
      )}
    </div>
  );
}
