/**
 * Pinyin initials and finals as used by the Hanzi Movie Method (HMM),
 * per Mandarin Blueprint's canonical chart:
 * https://www.mandarinblueprint.com/blog/new-pinyin-chart/
 *
 * STANDARD pinyin: 21 initials × 36 finals — uneven (too many places
 * to memorise, too few faces). MB rebalances by moving the medials
 * "i", "u", "ü" out of finals and into initials, giving:
 *
 *   55 INITIALS (one actor each) × 13 FINALS (one set each) + Ø final
 *
 * Initial categories follow the suffix vowel:
 *   - bare consonant  → MAN          (b-, p-, m-, …)
 *   - +i              → WOMAN        (bi-, pi-, mi-, …)
 *   - +u              → FICTIONAL    (bu-, pu-, mu-, …)
 *   - +ü              → GOD/LEADER   (nü-, lü-, jü-, …)
 *
 * Not all 22 consonants × 4 vowel-suffixes exist in Mandarin (e.g. no
 * "fi-", no "zü-"). The chart's populated cells sum to exactly 55.
 *
 * Tones are mapped to rooms inside the chosen set: tone 1 = entrance,
 * tone 2 = kitchen, tone 3 = bedroom, tone 4 = bathroom, tone 5 (neutral)
 * = roof.
 */

// ----------------------------------------------------------------
// 55 INITIALS, ordered by category for the ActorsWizard UI.
// ----------------------------------------------------------------

/** Bare-consonant initials (no medial vowel) — MAN category. */
const BARE_INITIALS = [
  "∅", "b", "p", "m", "f", "d", "t", "n", "l",
  "z", "c", "s", "zh", "ch", "sh", "r",
  "g", "k", "h",
] as const;

/** Consonant + medial "i" — WOMAN category. */
const I_INITIALS = [
  "∅i", "bi", "pi", "mi", "di", "ti", "ni", "li",
  "ji", "qi", "xi",
] as const;

/** Consonant + medial "u" — FICTIONAL category. */
const U_INITIALS = [
  "∅u", "bu", "pu", "mu", "fu", "du", "tu", "nu", "lu",
  "zu", "cu", "su", "zhu", "chu", "shu", "ru",
  "gu", "ku", "hu",
] as const;

/** Consonant + medial "ü" — GOD/LEADER category. */
const Ü_INITIALS = [
  "∅ü", "nü", "lü", "jü", "qü", "xü",
] as const;

export const INITIALS = [
  ...BARE_INITIALS,
  ...I_INITIALS,
  ...U_INITIALS,
  ...Ü_INITIALS,
] as const;
export type Initial = (typeof INITIALS)[number];

/** Sanity-check: total must be exactly 55 per the MB chart. */
if (INITIALS.length !== 55) {
  throw new Error(`pinyin.ts: expected 55 initials, got ${INITIALS.length}`);
}

// ----------------------------------------------------------------
// Actor categories
// ----------------------------------------------------------------

export type ActorCategory = "man" | "woman" | "fictional" | "god-or-leader";

const BARE_SET = new Set<string>(BARE_INITIALS);
const I_SET = new Set<string>(I_INITIALS);
const U_SET = new Set<string>(U_INITIALS);
const Ü_SET = new Set<string>(Ü_INITIALS);

/** Suggested category for each initial. Users can override per slot. */
export const SUGGESTED_CATEGORY: Record<Initial, ActorCategory> = (() => {
  const out = {} as Record<Initial, ActorCategory>;
  for (const init of INITIALS) {
    if (BARE_SET.has(init)) out[init] = "man";
    else if (I_SET.has(init)) out[init] = "woman";
    else if (U_SET.has(init)) out[init] = "fictional";
    else if (Ü_SET.has(init)) out[init] = "god-or-leader";
  }
  return out;
})();

// ----------------------------------------------------------------
// 13 FINALS (including the null Ø — childhood home in HMM convention)
// ----------------------------------------------------------------

export const FINALS = [
  "ø",   // null final — syllables like bi, du, ni, ji where the only
         // vowel is consumed into the initial. Per MB convention this
         // is the learner's CHILDHOOD HOME (set #13, automatic).
  "a",
  "ai",
  "ao",
  "an",
  "ang",
  "e",
  "ei",
  "en",  // also covers "in" / "ün" via floating-e
  "eng", // also covers "ing" / "üng" via floating-e
  "o",
  "ong",
  "ou",
] as const;
export type Final = (typeof FINALS)[number];

if (FINALS.length !== 13) {
  throw new Error(`pinyin.ts: expected 13 finals, got ${FINALS.length}`);
}

// ----------------------------------------------------------------
// Tone → room
// ----------------------------------------------------------------

/**
 * Default tone-to-room mapping. Override per-learner via `useToneRooms`
 * — different memory palaces work best with different layouts.
 *
 * Defaults follow the admin's convention:
 *   1 (high/flat)   = OUTSIDE the place (yard, sidewalk, approach)
 *   2 (rising)      = ENTRANCE / threshold
 *   3 (falling-rise) = CORE of the place (bedroom of a home, desk of an office)
 *   4 (falling)     = UTILITY space (bathroom, garage, maintenance closet)
 *   5 (neutral)     = elsewhere / roof / liminal
 */
export const TONE_TO_ROOM: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "outside",
  2: "entrance",
  3: "core room",
  4: "utility room",
  5: "roof",
};

// ----------------------------------------------------------------
// Parser
// ----------------------------------------------------------------

export interface PinyinParts {
  initial: Initial;
  final: Final;
  tone: 1 | 2 | 3 | 4 | 5;
  /** Raw final string before consolidation, e.g. "n" for "bin". */
  rawFinal: string;
}

const TONE_VOWELS: Record<string, [string, 1 | 2 | 3 | 4 | 5]> = {
  "ā": ["a", 1], "á": ["a", 2], "ǎ": ["a", 3], "à": ["a", 4],
  "ē": ["e", 1], "é": ["e", 2], "ě": ["e", 3], "è": ["e", 4],
  "ī": ["i", 1], "í": ["i", 2], "ǐ": ["i", 3], "ì": ["i", 4],
  "ō": ["o", 1], "ó": ["o", 2], "ǒ": ["o", 3], "ò": ["o", 4],
  "ū": ["u", 1], "ú": ["u", 2], "ǔ": ["u", 3], "ù": ["u", 4],
  "ǖ": ["ü", 1], "ǘ": ["ü", 2], "ǚ": ["ü", 3], "ǜ": ["ü", 4],
};

function stripToneMarks(s: string): [string, 1 | 2 | 3 | 4 | 5] {
  let tone: 1 | 2 | 3 | 4 | 5 = 5;
  const bare = [...s].map((ch) => {
    const t = TONE_VOWELS[ch];
    if (t) { tone = t[1]; return t[0]; }
    return ch;
  }).join("");
  return [bare, tone];
}

const INITIAL_MATCH = /^(zh|ch|sh|b|p|m|f|d|t|n|l|g|k|h|j|q|x|r|z|c|s|y|w)/;

/**
 * Consonants that participate in i-extension (i.e. "bi-" / "di-" exist
 * as their own female-category initial, distinct from "b-" / "d-").
 * Consonants NOT in this set treat a following "i" as either an apical
 * placeholder vowel (zi/ci/si/zhi/chi/shi/ri → bare + Ø final) or as
 * the start of a real final (no such cases exist for g/k/h/f).
 */
const I_EXT_CONSONANTS = new Set(["∅", "b", "p", "m", "d", "t", "n", "l", "j", "q", "x"]);

/** Consonants where written "u" is actually "ü" (umlaut convention). */
const U_AS_Ü_CONSONANTS = new Set(["j", "q", "x"]);

/**
 * Parse "ma1" / "lín" / "biang" into (initial, final, tone). Returns
 * null on garbage input. Normalises tone marks + numeric forms +
 * applies the HMM phonetic rewrites (iu→i+ou, ui→u+ei, floating-e).
 */
export function parsePinyin(input: string): PinyinParts | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  let tone: 1 | 2 | 3 | 4 | 5;
  const numericMatch = /^([a-zü]+)([1-5])$/.exec(s);
  if (numericMatch) {
    s = numericMatch[1];
    tone = Number(numericMatch[2]) as 1 | 2 | 3 | 4 | 5;
  } else {
    [s, tone] = stripToneMarks(s);
  }
  // Common "v" → "ü" convention (since ü is hard to type).
  s = s.replace(/v/g, "ü");
  if (!s) return null;

  // Extract consonant prefix (longest match first via the regex's order).
  let consonant = "";
  let rest = s;
  const m = INITIAL_MATCH.exec(s);
  if (m) {
    consonant = m[0];
    rest = s.slice(consonant.length);
  }

  // y- and w- are orthographic conventions for ∅ initial + i/u/ü medial.
  if (consonant === "y") {
    consonant = "∅";
    if (rest.startsWith("u")) {
      // yu, yue, yuan, yun all have "ü" not "u".
      rest = "ü" + rest.slice(1);
    } else if (rest === "" || rest === "i") {
      rest = "i";
    } else if (!rest.startsWith("i")) {
      rest = "i" + rest;
    }
  } else if (consonant === "w") {
    consonant = "∅";
    if (rest === "" || rest === "u") {
      rest = "u";
    } else if (!rest.startsWith("u")) {
      rest = "u" + rest;
    }
  } else if (consonant === "") {
    consonant = "∅";
  }

  // Extract the medial vowel (i/u/ü) into the initial cluster.
  let initialSuffix = "";
  if (rest.startsWith("ü")) {
    initialSuffix = "ü";
    rest = rest.slice(1);
  } else if (rest.startsWith("u")) {
    initialSuffix = U_AS_Ü_CONSONANTS.has(consonant) ? "ü" : "u";
    rest = rest.slice(1);
  } else if (rest.startsWith("i")) {
    if (I_EXT_CONSONANTS.has(consonant)) {
      initialSuffix = "i";
      rest = rest.slice(1);
    } else {
      // Apical-i placeholder (zi/ci/si/zhi/chi/shi/ri): consume the "i"
      // as a null vowel, NOT as a medial. The initial stays bare.
      if (rest === "i") rest = "";
    }
  }

  // MB phonetic rewrites:
  // - "iu" really = "iou" → after extracting the i-medial, the leftover
  //   "u" becomes "ou". (e.g. liu = li-ou, jiu = ji-ou)
  if (initialSuffix === "i" && rest === "u") rest = "ou";
  // - "ui" really = "uei" → after u-medial, "i" → "ei". (e.g. dui = du-ei)
  if (initialSuffix === "u" && rest === "i") rest = "ei";

  // Floating-e: bare "n" / "ng" coda gets an "e" in front so it lands
  // on the en/eng final slot. (bi+n = bin, but final is en; bi+ng = bing,
  // final is eng.)
  if (rest === "n") rest = "en";
  else if (rest === "ng") rest = "eng";

  // ü's umlaut never survives after j/q/x in writing (jue, juan, jun)
  // — but at this point we've already consumed it into initialSuffix,
  // so nothing more to do.

  const rawFinal = rest;
  const final = consolidateFinal(rest);
  const initial = (consonant + initialSuffix) as Initial;
  // Sanity guard: if we computed an initial that isn't in the 55, fail
  // loudly. Better to NULL out one entry than silently mis-tag a slot.
  if (!BARE_SET.has(initial) && !I_SET.has(initial) && !U_SET.has(initial) && !Ü_SET.has(initial)) {
    return null;
  }
  return { final, initial, rawFinal, tone };
}

/** Map the leftover final string to one of the canonical 13. */
function consolidateFinal(raw: string): Final {
  if (raw === "" ) return "ø";
  if (raw === "a") return "a";
  if (raw === "ai") return "ai";
  if (raw === "ao") return "ao";
  if (raw === "an") return "an";
  if (raw === "ang") return "ang";
  if (raw === "e") return "e";
  if (raw === "ei") return "ei";
  if (raw === "en") return "en";
  if (raw === "eng") return "eng";
  if (raw === "o") return "o";
  if (raw === "ong") return "ong";
  if (raw === "ou") return "ou";
  // "er" (儿/二/而) — rare. MB has no separate slot; fold to "e".
  if (raw === "er") return "e";
  // Best-effort fallbacks for any straggler shapes:
  if (raw === "n") return "en";
  if (raw === "ng") return "eng";
  return "ø";
}

export function roomForTone(tone: 1 | 2 | 3 | 4 | 5): string {
  return TONE_TO_ROOM[tone];
}
