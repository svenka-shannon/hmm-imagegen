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
