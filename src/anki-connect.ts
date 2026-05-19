/**
 * AnkiConnect HTTP bridge.
 *
 * AnkiConnect is a desktop-Anki add-on that exposes Anki's API over
 * `http://localhost:8765`. It runs only while Anki is open on the
 * user's machine. Browser fetches to localhost work because the
 * AnkiConnect add-on configures permissive CORS.
 *
 * Docs: https://foosoft.net/projects/anki-connect/
 *
 * This module is dependency-free and works in both browser and node/bun.
 */

const DEFAULT_ENDPOINT = "http://127.0.0.1:8765";
const API_VERSION = 6;

export interface AnkiRequestOptions {
  endpoint?: string;
  signal?: AbortSignal;
}

export class AnkiConnectError extends Error {
  override readonly name = "AnkiConnectError";
  constructor(message: string, readonly action: string) {
    super(message);
  }
}

async function invoke<T = unknown>(
  action: string,
  params: Record<string, unknown> = {},
  opts: AnkiRequestOptions = {},
): Promise<T> {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const res = await fetch(endpoint, {
    body: JSON.stringify({ action, version: API_VERSION, params }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal: opts.signal,
  }).catch((err: unknown) => {
    throw new AnkiConnectError(
      `failed to reach AnkiConnect at ${endpoint} — is Anki running with the AnkiConnect add-on enabled?` +
        ` (${(err as Error).message})`,
      action,
    );
  });
  if (!res.ok) {
    throw new AnkiConnectError(`HTTP ${res.status}`, action);
  }
  const body = (await res.json()) as { result: T; error: string | null };
  if (body.error) {
    throw new AnkiConnectError(body.error, action);
  }
  return body.result;
}

/* ============================================================
 * Deck operations
 * ============================================================ */

export const deckNames = (opts?: AnkiRequestOptions): Promise<string[]> =>
  invoke<string[]>("deckNames", {}, opts);

export const createDeck = (name: string, opts?: AnkiRequestOptions): Promise<number> =>
  invoke<number>("createDeck", { deck: name }, opts);

/* ============================================================
 * Model (note-type) operations
 * ============================================================ */

export const modelNames = (opts?: AnkiRequestOptions): Promise<string[]> =>
  invoke<string[]>("modelNames", {}, opts);

export interface CreateModelOpts {
  modelName: string;
  inOrderFields: string[];
  css?: string;
  cardTemplates: { Name: string; Front: string; Back: string }[];
  isCloze?: boolean;
}

export const createModel = (
  opts: CreateModelOpts,
  req?: AnkiRequestOptions,
): Promise<unknown> => invoke("createModel", opts as unknown as Record<string, unknown>, req);

/* ============================================================
 * Note operations
 * ============================================================ */

export interface AnkiNote {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags?: string[];
  options?: { allowDuplicate?: boolean };
  /** Media attachments (images uploaded alongside the note). */
  picture?: AnkiMediaAttachment[];
}

export interface AnkiMediaAttachment {
  /** Base64-encoded media. */
  data?: string;
  /** URL to fetch — Anki fetches from this URL. */
  url?: string;
  /** Filename to save under in Anki's media folder. */
  filename: string;
  /** Which note fields to insert `<img src="filename">` into. */
  fields: string[];
}

export const addNote = (note: AnkiNote, opts?: AnkiRequestOptions): Promise<number> =>
  invoke<number>("addNote", { note }, opts);

export const addNotes = (notes: AnkiNote[], opts?: AnkiRequestOptions): Promise<(number | null)[]> =>
  invoke<(number | null)[]>("addNotes", { notes }, opts);

/* ============================================================
 * Search operations — used by the deck-generation step to
 * filter out hanzi already in the deck so re-runs are
 * additive (no review-schedule disruption).
 * ============================================================ */

/** Returns the note IDs matching a search query (e.g. `deck:"My Deck"`). */
export const findNotes = (query: string, opts?: AnkiRequestOptions): Promise<number[]> =>
  invoke<number[]>("findNotes", { query }, opts);

export interface NoteInfo {
  noteId: number;
  modelName: string;
  tags: string[];
  fields: Record<string, { value: string; order: number }>;
}

export const notesInfo = (noteIds: number[], opts?: AnkiRequestOptions): Promise<NoteInfo[]> =>
  invoke<NoteInfo[]>("notesInfo", { notes: noteIds }, opts);

/** Convenience: collect the value of one specific field across all notes in a deck. */
export async function deckFieldValues(
  deckName: string,
  field: string,
  opts?: AnkiRequestOptions,
): Promise<string[]> {
  const ids = await findNotes(`deck:"${deckName.replaceAll('"', '\\"')}"`, opts);
  if (ids.length === 0) return [];
  const infos = await notesInfo(ids, opts);
  return infos.map((info) => info.fields[field]?.value).filter((v): v is string => Boolean(v));
}

/* ============================================================
 * Card-level operations — used by the sync flow to inspect
 * deck progress (how many cards are still "new" / unseen,
 * how many are mature, when each note was added).
 * ============================================================ */

/** Returns card IDs matching an Anki search query (e.g. `deck:"X" is:new`). */
export const findCards = (query: string, opts?: AnkiRequestOptions): Promise<number[]> =>
  invoke<number[]>("findCards", { query }, opts);

/**
 * Per-card metadata returned by AnkiConnect's `cardsInfo`. We only model
 * the fields the sync flow cares about; AnkiConnect returns many more.
 */
export interface CardInfo {
  cardId: number;
  /** Note (parent) id — multiple cards can share a note. */
  note: number;
  /** Card queue: 0=new, 1=learning, 2=review, 3=day-learning, -1=suspended, etc. */
  queue: number;
  /** Card type: 0=new, 1=learning, 2=review, 3=relearning. */
  type: number;
  /** Current review interval in days. Mature when >= 21. */
  interval: number;
  /** Field values keyed by field name. */
  fields: Record<string, { value: string; order: number }>;
}

export const cardsInfo = (
  cardIds: number[],
  opts?: AnkiRequestOptions,
): Promise<CardInfo[]> =>
  invoke<CardInfo[]>("cardsInfo", { cards: cardIds }, opts);

/**
 * Summary of one deck's review state for the sync UI. "Mature" follows
 * Anki's own definition (interval ≥ 21 days). "Buffer" is the count of
 * cards the user hasn't seen yet — that's what the auto-top-up watches.
 */
export interface DeckProgress {
  total: number;
  newBuffer: number;
  learning: number;
  review: number;
  mature: number;
}

/**
 * Pull a single deck's progress in one round trip. Issues 5 parallel
 * `findCards` queries against AnkiConnect, which is cheap; total deck
 * size is the only count we don't already get for free.
 */
export async function deckProgress(
  deckName: string,
  opts?: AnkiRequestOptions,
): Promise<DeckProgress> {
  const escaped = deckName.replaceAll('"', '\\"');
  const deckQuery = `deck:"${escaped}"`;
  const [total, newBuffer, learning, review, mature] = await Promise.all([
    findCards(deckQuery, opts).then((c) => c.length),
    findCards(`${deckQuery} is:new`, opts).then((c) => c.length),
    findCards(`${deckQuery} is:learn`, opts).then((c) => c.length),
    findCards(`${deckQuery} is:review`, opts).then((c) => c.length),
    findCards(`${deckQuery} prop:ivl>=21`, opts).then((c) => c.length),
  ]);
  return { learning, mature, newBuffer, review, total };
}

/* ============================================================
 * Media operations
 * ============================================================ */

export const storeMediaFile = (
  filename: string,
  data: string,
  opts?: AnkiRequestOptions,
): Promise<string> => invoke<string>("storeMediaFile", { data, filename }, opts);

/* ============================================================
 * Health check
 * ============================================================ */

export interface AnkiHealth {
  connected: boolean;
  version?: number;
  error?: string;
}

export async function checkHealth(opts?: AnkiRequestOptions): Promise<AnkiHealth> {
  try {
    const version = await invoke<number>("version", {}, opts);
    return { connected: true, version };
  } catch (err) {
    return { connected: false, error: (err as Error).message };
  }
}
