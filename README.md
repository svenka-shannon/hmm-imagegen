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

🚧 Scaffolding. Not usable yet.

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
