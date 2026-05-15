import { useState } from "react";
import { useActors, useSets } from "../lib/store";
import { addNotes, createDeck, type AnkiNote } from "../../../src/anki-connect";
import { parsePinyin, TONE_TO_ROOM } from "../../../src/pinyin";

type SourceList = "top-freq" | "heisig-rth";

interface HanziEntry {
  hanzi: string;
  pinyin: string;
  meaning: string;
  /** Heisig RTH number, if from that source. */
  heisig?: number;
}

/**
 * Stub: in the real flow this comes from data/freq-top.json or
 * data/heisig-rth.json. For now we use a tiny demo list so the
 * deck-gen UI is exercisable end-to-end.
 */
const DEMO_HANZI: HanziEntry[] = [
  { hanzi: "妈", meaning: "mother", pinyin: "mā" },
  { hanzi: "爸", meaning: "father", pinyin: "bà" },
  { hanzi: "林", meaning: "forest", pinyin: "lín" },
  { hanzi: "家", meaning: "home / family", pinyin: "jiā" },
  { hanzi: "山", meaning: "mountain", pinyin: "shān" },
];

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

      // Limit demo: only use cards we can resolve.
      const picked = DEMO_HANZI.slice(0, count);
      const notes: AnkiNote[] = [];
      for (const entry of picked) {
        const parts = parsePinyin(entry.pinyin);
        if (!parts) {
          appendLog(`  skip ${entry.hanzi}: cannot parse pinyin "${entry.pinyin}"`);
          continue;
        }
        const actor = actors[parts.initial]?.name ?? `(no actor for ${parts.initial})`;
        const set = sets[parts.final]?.name ?? `(no set for ${parts.final})`;
        const room = TONE_TO_ROOM[parts.tone];
        const scene =
          `${actor} in the ${room} of ${set} — ${entry.meaning}`;
        appendLog(`  ${entry.hanzi} (${entry.pinyin}) → ${scene}`);
        notes.push({
          deckName,
          fields: {
            Front: entry.hanzi,
            Back: `<div><strong>${entry.pinyin}</strong></div><div>${entry.meaning}</div><div><em>${scene}</em></div>`,
            Hanzi: entry.hanzi,
            Meaning: entry.meaning,
            Pinyin: entry.pinyin,
            Scene: scene,
          },
          modelName: "Basic",
          options: { allowDuplicate: false },
          tags: ["hmm-imagegen", source],
        });
      }
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
