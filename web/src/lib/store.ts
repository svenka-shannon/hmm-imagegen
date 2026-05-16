/**
 * Library store for the HMM wizard. Persistence is layered:
 *
 *   1. localStorage — instant reads + offline-safe edits
 *   2. server-side /api/library — survives browser clears + works
 *      cross-device. Best-effort sync; the wizard remains usable
 *      offline.
 *
 * Strategy on first load:
 *   - read localStorage immediately (no network blip)
 *   - kick off a GET /api/library; if server has newer data
 *     (newer updatedAt), overwrite localStorage with it
 *   - on every change, write to localStorage + POST to server
 *     (fire-and-forget; failures are logged not surfaced)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Final, Initial, ActorCategory } from "../../../src/pinyin";

export interface ActorAssignment {
  name: string;
  category: ActorCategory;
  imageDataUrl?: string;
}

export interface SetAssignment {
  name: string;
  exteriorDataUrl?: string;
  rooms?: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;
}

const ACTORS_KEY = "hmm.actors.v1";
const SETS_KEY = "hmm.sets.v1";
const LIBRARY_UPDATED_KEY = "hmm.library.updatedAt";

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // localStorage may be full (large dataURLs). Surface to the user.
    // eslint-disable-next-line no-console
    console.error("hmm.store: localStorage write failed", err);
  }
}

/**
 * Push the current library to the server. Debounced + fire-and-forget;
 * failures log to console but don't surface to the user.
 */
let pushTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePush(actors: unknown, sets: unknown): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    fetch("/api/library", {
      body: JSON.stringify({ actors, sets }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).catch((err: Error) => {
      // eslint-disable-next-line no-console
      console.warn("hmm.store: server sync failed (state is safe in localStorage):", err.message);
    });
  }, 500); // debounce so a flurry of edits doesn't spam the server
}

/**
 * Module-level "live" copies of the library so both useActors and useSets
 * can read the latest state for the debounced server push (POST sends
 * BOTH actors + sets together so a single sync covers any edit).
 */
let liveActors: Partial<Record<Initial, ActorAssignment>> = loadJSON(ACTORS_KEY, {});
let liveSets: Partial<Record<Final, SetAssignment>> = loadJSON(SETS_KEY, {});

/**
 * One-shot first-load server fetch. If the server has newer data than
 * localStorage, replace local state. Cross-tab/window subscribers get
 * notified via the `hmm.library.refreshed` storage event.
 */
let firstLoadStarted = false;
function tryServerLoad(
  refreshActors: (next: Partial<Record<Initial, ActorAssignment>>) => void,
  refreshSets: (next: Partial<Record<Final, SetAssignment>>) => void,
): void {
  if (firstLoadStarted) return;
  firstLoadStarted = true;
  fetch("/api/library").then(async (res) => {
    if (!res.ok) return;
    const body = await res.json() as { actors?: typeof liveActors; sets?: typeof liveSets; updatedAt?: string };
    if (!body.updatedAt) return; // server has no data — keep local
    const localAt = localStorage.getItem(LIBRARY_UPDATED_KEY);
    if (localAt && Date.parse(localAt) >= Date.parse(body.updatedAt)) return; // local is newer
    if (body.actors) { liveActors = body.actors; saveJSON(ACTORS_KEY, body.actors); refreshActors(body.actors); }
    if (body.sets) { liveSets = body.sets; saveJSON(SETS_KEY, body.sets); refreshSets(body.sets); }
    localStorage.setItem(LIBRARY_UPDATED_KEY, body.updatedAt);
  }).catch((err: Error) => {
    // eslint-disable-next-line no-console
    console.warn("hmm.store: server load failed (using local cache):", err.message);
  });
}

/**
 * Test-only: re-read localStorage into the module singletons and reset
 * the first-load latch. Call from `beforeEach` after `localStorage.clear()`
 * so a fresh test doesn't see stale state from a previous test.
 */
export function _resetStoreForTests(): void {
  liveActors = loadJSON(ACTORS_KEY, {});
  liveSets = loadJSON(SETS_KEY, {});
  firstLoadStarted = false;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}

export function useActors() {
  const [actors, setActors] = useState<Partial<Record<Initial, ActorAssignment>>>(
    () => liveActors,
  );
  const setsRef = useRef(setActors);
  setsRef.current = setActors;
  useEffect(() => tryServerLoad(setActors, () => {}), []);
  useEffect(() => {
    saveJSON(ACTORS_KEY, actors);
    liveActors = actors;
    localStorage.setItem(LIBRARY_UPDATED_KEY, new Date().toISOString());
    schedulePush(liveActors, liveSets);
  }, [actors]);
  const setActor = useCallback(
    (initial: Initial, assignment: ActorAssignment) =>
      setActors((prev) => ({ ...prev, [initial]: assignment })),
    [],
  );
  const clearActor = useCallback(
    (initial: Initial) =>
      setActors((prev) => {
        const next = { ...prev };
        delete next[initial];
        return next;
      }),
    [],
  );
  return { actors, clearActor, setActor };
}

export function useSets() {
  const [sets, setSets] = useState<Partial<Record<Final, SetAssignment>>>(
    () => liveSets,
  );
  useEffect(() => tryServerLoad(() => {}, setSets), []);
  useEffect(() => {
    saveJSON(SETS_KEY, sets);
    liveSets = sets;
    localStorage.setItem(LIBRARY_UPDATED_KEY, new Date().toISOString());
    schedulePush(liveActors, liveSets);
  }, [sets]);
  const setSet = useCallback(
    (final: Final, assignment: SetAssignment) =>
      setSets((prev) => ({ ...prev, [final]: assignment })),
    [],
  );
  const clearSet = useCallback(
    (final: Final) =>
      setSets((prev) => {
        const next = { ...prev };
        delete next[final];
        return next;
      }),
    [],
  );
  return { clearSet, sets, setSet };
}
