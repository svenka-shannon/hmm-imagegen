# hmm-imagegen

Tool for building Hanzi Movie Method (HMM) mnemonic decks for Mandarin Chinese, with AI-generated scene imagery.

The Hanzi Movie Method (Mandarin Blueprint) turns each Chinese character into a memorable movie scene:

- **Actors** (pinyin initials → real people the learner knows)
- **Sets** (pinyin finals → familiar buildings/places)
- **Rooms** (tones → fixed locations within each set: entrance/kitchen/bedroom/bathroom/roof)
- **Props** (character components → physical objects)
- **Scripts** (the action that encodes the character's meaning)

This tool walks the learner through building their personal actor + set library, then auto-generates an Anki deck of the most common hanzi with AI-rendered scene images.

## Status

**v0.1 — usable.** Wizard runs end-to-end: assign actors, assign sets,
generate scene images for top-N hanzi via Gemini (nano-banana), push to
Anki. See "Quickstart" below.

## Quickstart

```sh
# 1. Install deps
bun install

# 2. Set your Gemini API key (used for image generation)
cat > ~/.claude/secrets.env <<EOF
GEMINI_API_KEY=your-key-here
EOF

# 3. Install AnkiConnect inside Anki desktop:
#    Tools → Add-ons → Get Add-ons → Code: 2055492159
#    Then restart Anki (it must be running for the wizard to push cards).

# 4. Start the dev stack (Vite frontend + Bun backend)
bun run dev
# → frontend at http://localhost:5173, backend at http://localhost:4400

# 5. In the wizard:
#    Step 1 (Actors): pick a person for each of the 21 Pinyin initials.
#       Upload a reference photo each (required for image-gen).
#    Step 2 (Sets):   pick a location for each of the 13 Pinyin finals.
#       Upload tone-room photos per the budget/hybrid/strict mode picker.
#    Step 1.5/2.5: optionally click "Push to HMM Prep deck" to populate
#       a separate practice deck with one card per slot.
#    Step 3 (Generate): pick source (Top-N freq / Heisig RTH), set count,
#       toggle image-gen, click "Preview one card" to sanity-check, then
#       "Build & push to Anki".
```

## Non-destructive re-runs

Re-running the generator (or the prep-deck push) is **additive** — only
new hanzi are pushed; existing cards' review schedules in Anki are
untouched. If you change a ref image and re-run, the existing card
keeps its old image unless you explicitly check
"Force-refresh existing cards (resets review schedule)".

## Card eligibility rules

A character is eligible to enter the deck iff:

1. Its pinyin parses to a canonical (initial, final, tone) — covered by
   `src/pinyin.ts`. All 21 Mandarin initials + null-initial and 13
   consolidated finals are supported.
2. The user has assigned an actor to the initial AND a set to the final.
3. If image generation is on, the actor slot has a portrait AND the set
   slot has either an exterior or a tone-specific room photo. This is
   a hard requirement — the HMM premise is "YOUR actors in YOUR
   locations", so generic-kitchen fallback is disabled by design.

## Stack

- **Frontend**: Vite + React 19 + TypeScript
- **Backend**: Bun + SQLite (asset storage, session state)
- **Anki integration**: [AnkiConnect](https://foosoft.net/projects/anki-connect/) HTTP API (requires desktop Anki running)
- **Pinyin / decomposition**: cc-cedict + ids (radical decomposition)
- **Image generation**: pluggable — user provides API key (Gemini nano-banana, fal.ai Flux, OpenAI, etc.)

## High-level flow

1. **Setup wizard** — user assigns actors to all 21 pinyin initials, sets to all 13 pinyin finals, uploads reference images for each. Cards are pushed to the user's "HMM prep" Anki deck via AnkiConnect.
2. **Deck generator** — pick top-N most common hanzi, decompose each into initial + final + tone, resolve the actor + set + room from the learner's prep library, build a scene prompt, call image-gen, save the card to a new Anki deck.

## Repo layout

```
web/         Vite + React frontend (the wizard UI)
server/      Bun HTTP server (asset storage, AnkiConnect bridge)
src/         Shared TS types + utilities (pinyin lookup, OCLO-style order, etc.)
scripts/     Build / generation scripts
data/        Reference data files (cc-cedict subset, frequency lists, etc.)
```

## Development

```sh
bun install
bun run dev       # vite frontend on :5173 + bun server on :4400
```

## License

MIT (TBD).
