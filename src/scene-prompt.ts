/**
 * Scene prompt builder for the Hanzi Movie Method.
 *
 * Given a hanzi entry + the learner's actor/set assignments + (optionally)
 * the prop assignments for the character's components, produces:
 *   - a short scene description (1-2 sentences, for the Anki card)
 *   - a long-form image-gen prompt (richer, with style cues)
 *   - the list of reference-image data URLs to attach as conditioning
 */

import type { Initial, Final, PinyinParts } from "./pinyin";
import { TONE_TO_ROOM } from "./pinyin";

export interface ActorRef {
  name: string;
  imageDataUrl?: string;
}

export interface SetRef {
  name: string;
  exteriorDataUrl?: string;
  rooms?: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;
}

export interface PropAssignment {
  /** The original character component (e.g. "白"). */
  component: string;
  /** What the user wants the prop to be (e.g. "white bottle"). */
  prop: string;
  imageDataUrl?: string;
}

export interface SceneBuildOpts {
  pinyin: PinyinParts;
  meaning: string;
  /** Components of the character, from the decomposition data. */
  components?: string[];
  actor: ActorRef;
  set: SetRef;
  /** Prop assignments for each component, if known. */
  props?: PropAssignment[];
}

export interface SceneOutput {
  /** One-sentence summary, e.g. "Arnold in the kitchen of childhood home, chopping bananas". */
  short: string;
  /** Long-form prompt suitable for an image-gen model. */
  long: string;
  /** Reference image data URLs (actor, set room, prop sketches). */
  refs: { kind: "actor" | "room" | "exterior" | "prop"; dataUrl: string; tag: string }[];
}

/**
 * Build a scene description from the learner's mnemonic library.
 *
 * Stays neutral on the action verb — that's the learner's "script" and
 * comes from their personal connection to the character's meaning. We
 * just place the actor in the right room, with the right props, and
 * surface the meaning as a hint.
 */
export function buildScene(opts: SceneBuildOpts): SceneOutput {
  const { pinyin, meaning, components = [], actor, set, props = [] } = opts;
  const room = TONE_TO_ROOM[pinyin.tone];

  const propPhrase = props.length === 0
    ? null
    : `with ${joinList(props.map((p) => p.prop))}`;
  const short = [
    `${actor.name} in the ${room} of ${set.name}`,
    propPhrase ?? "",
    `— ${meaning}`,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  const long = [
    `Cinematic, vivid mnemonic scene.`,
    `Subject: ${actor.name}.`,
    `Location: the ${room} of ${set.name}.`,
    components.length > 0 ? `Visual props referencing the character components ${components.join(", ")}.` : "",
    props.length > 0 ? `Specific props: ${props.map((p) => `${p.component} → ${p.prop}`).join("; ")}.` : "",
    `Action should evoke the meaning: "${meaning}".`,
    `Mood: vivid, slightly surreal, dynamic. Camera at eye level. Sharp focus on subject.`,
  ].filter(Boolean).join(" ");

  const refs: SceneOutput["refs"] = [];
  if (actor.imageDataUrl) refs.push({ dataUrl: actor.imageDataUrl, kind: "actor", tag: `actor:${pinyin.initial}` });
  const roomUrl = set.rooms?.[pinyin.tone];
  if (roomUrl) refs.push({ dataUrl: roomUrl, kind: "room", tag: `room:${pinyin.tone}` });
  else if (set.exteriorDataUrl) refs.push({ dataUrl: set.exteriorDataUrl, kind: "exterior", tag: "exterior" });
  for (const p of props) {
    if (p.imageDataUrl) refs.push({ dataUrl: p.imageDataUrl, kind: "prop", tag: `prop:${p.component}` });
  }

  return { long, refs, short };
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/**
 * Helper: pick the actor + set from the user's library for a given pinyin.
 * Returns null if either slot is unfilled.
 */
export function resolveLibrary(
  pinyin: PinyinParts,
  actors: Partial<Record<Initial, ActorRef>>,
  sets: Partial<Record<Final, SetRef>>,
): { actor: ActorRef; set: SetRef } | null {
  const actor = actors[pinyin.initial];
  const set = sets[pinyin.final];
  if (!actor || !set) return null;
  return { actor, set };
}
