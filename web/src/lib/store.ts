/**
 * Local-storage backed store for the HMM wizard state.
 *
 * Keeps the user's actor + set assignments persistent across reloads.
 * No backend required for the wizard — only when we push to Anki or
 * generate the hanzi deck do we hit any external service.
 */
import { useCallback, useEffect, useState } from "react";
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

export function useActors() {
  const [actors, setActors] = useState<Partial<Record<Initial, ActorAssignment>>>(
    () => loadJSON(ACTORS_KEY, {}),
  );
  useEffect(() => saveJSON(ACTORS_KEY, actors), [actors]);
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
    () => loadJSON(SETS_KEY, {}),
  );
  useEffect(() => saveJSON(SETS_KEY, sets), [sets]);
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
