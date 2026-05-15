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
  /**
   * Optional system-style prefix that gets prepended to the long prompt.
   * Lets the user pin a global rendering style (e.g. "Studio Ghibli anime
   * style, hand-drawn line art with watercolor wash" or
   * "Pixar-style 3D animation, soft volumetric lighting").
   *
   * Kept as a single freeform string so the user has full creative control
   * — we just glue it on top of our base prompt.
   */
  stylePrefix?: string;
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
  const { pinyin, meaning, components: _components = [], actor, set, props = [], stylePrefix } = opts;
  void _components; // surfaced via the props mapping; kept on the type for downstream consumers
  const room = TONE_TO_ROOM[pinyin.tone];

  const propPhrase = props.length === 0
    ? null
    : `with ${joinList(props.map((p) => p.prop))}`;
  const short = [
    `${actor.name} in the ${room} of ${set.name}`,
    propPhrase ?? "",
    `— ${meaning}`,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  // Prompt engineering notes:
  //
  // - Gemini's image-gen LOVES to bake captions / titles / brand-like
  //   overlays into the scene unless you explicitly forbid them. We
  //   front-load a hard "no text" directive.
  // - Words like "cinematic" / "movie poster" / "vivid surreal" push the
  //   model toward stylised compositions with floating title cards. We
  //   keep the visual call more neutral ("photorealistic snapshot").
  // - Props need to be CONCRETE, not described meta-textually ("a brown
  //   horse" not "props referencing the component 馬"). We surface the
  //   user's literal prop strings + omit the component glyphs from the
  //   prompt text so the model doesn't try to render Chinese characters.
  // - The action / meaning is the most-important visual signal; we
  //   restate it twice (once as the moment the camera captures, once
  //   as the intended takeaway).
  const concreteProps = props.length > 0
    ? props.map((p) => p.prop).filter(Boolean)
    : [];
  const baseStyle = stylePrefix?.trim()
    ? `${stylePrefix.trim()}.`
    : `Photorealistic snapshot.`;
  const long = [
    `${baseStyle} No text, no captions, no labels, no logos, no overlays.`,
    `${actor.name} is in the ${room} of ${set.name}.`,
    concreteProps.length > 0
      ? `Visible objects in the scene: ${joinList(concreteProps)}.`
      : "",
    `Action: ${actor.name} is interacting with the scene in a way that vividly depicts "${meaning}".`,
    `The image should make a viewer immediately think "${meaning}" without any words on screen.`,
    `Natural lighting, eye-level camera, sharp focus on ${actor.name} and the key objects.`,
    `Avoid: text, captions, subtitles, brand logos, watermarks, motivational quotes, decorative writing on walls, infographic elements.`,
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
 * Per-image cost estimates ($USD), normalised to a 1024x1024 ("1K") output.
 * Numbers refreshed 2026-05 from Google's published pricing pages.
 * Batch-mode prices (50% off) listed separately.
 */
export const IMAGEGEN_COST_USD: Record<string, { realtime: number; batch: number; label: string }> = {
  "gemini-2.5-flash-image": { batch: 0.0335, label: "Gemini 2.5 Flash Image @ 1K", realtime: 0.067 },
  "gemini-3-pro-image-preview": { batch: 0.067, label: "Gemini 3 Pro Image @ 1K", realtime: 0.134 },
  mock: { batch: 0, label: "Mock (no API call)", realtime: 0 },
};

export function estimateCost(model: string, count: number, batch = false): { perImage: number; total: number; label: string } {
  const m = IMAGEGEN_COST_USD[model] ?? IMAGEGEN_COST_USD["gemini-2.5-flash-image"];
  const perImage = batch ? m.batch : m.realtime;
  return { label: m.label, perImage, total: perImage * count };
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
