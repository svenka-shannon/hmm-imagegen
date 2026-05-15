import { useState } from "react";
import { useActors, useSets } from "../lib/store";
import { addNotes, createDeck, type AnkiNote } from "../../../src/anki-connect";
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
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  function appendLog(line: string) {
    setLog((prev) => [...prev, line]);
  }

  async function build() {
    setBusy(true);
    setLog([]);
    try {
      appendLog(`Creating deck: ${deckName}`);
      await createDeck(deckName);
      appendLog("OK");

      const picked = pickSource(source).slice(0, count);
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
        notes.push({
          deckName,
          fields: {
            Front: entry.hanzi,
            Back: `<div><strong>${entry.pinyin}</strong></div><div>${entry.meaning}</div><div><em>${scene.short}</em></div>`,
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

        <button
          className="primary"
          onClick={build}
          disabled={busy || !deckName.trim()}
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
