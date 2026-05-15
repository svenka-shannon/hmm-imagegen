/**
 * Pinyin initials and finals as used by the Hanzi Movie Method (HMM).
 *
 * Standard Mandarin has ~23 initials + ~37 finals if you count every
 * orthographic variant. Mandarin Blueprint's HMM consolidates these
 * into a smaller set that maps cleanly onto a learner's personal
 * actor library (initials) and set library (finals):
 *
 * - 21 INITIALS (one actor each) — the consonant onset.
 *   Plus a "∅" null-initial for syllables that start with a vowel.
 * - 13 FINALS (one set each) — the rime/nucleus+coda.
 *
 * Tones are encoded by which ROOM of the set the action happens in
 * (entrance / kitchen / bedroom / bathroom / roof for tones 1-5).
 *
 * Sources: mandarinblueprint.com/blog/new-pinyin-chart/
 */

/** All 21 standard Mandarin initials + a null-initial slot. */
export const INITIALS = [
  "b", "p", "m", "f",
  "d", "t", "n", "l",
  "g", "k", "h",
  "j", "q", "x",
  "zh", "ch", "sh", "r",
  "z", "c", "s",
  "∅", // null-initial (syllables starting with y/w/vowel)
] as const;
export type Initial = (typeof INITIALS)[number];

/**
 * The four Mandarin Blueprint "actor categories" used to organise the
 * 21 initials. Users pick people from their own life for each slot;
 * keeping the same category per slot helps memory consistency.
 *
 * Note: these are conventions, not enforcement. The tool lets the user
 * pick any person for any slot — we just suggest the conventional
 * category.
 */
export type ActorCategory = "man" | "woman" | "fictional" | "god-or-leader";

/**
 * 13 HMM finals. This collapses the standard 37 finals by treating
 * the orthographic y/w variants as the same final, and by grouping
 * close diphthongs that the learner can keep in the same set.
 *
 * The exact 13 used by Mandarin Blueprint are proprietary, so this is
 * our own consolidation following the same principles. We'll iterate
 * once a learner tests it.
 */
export const FINALS = [
  "a",     // a, ia, ua
  "ai",    // ai, uai
  "an",    // an, ian, uan
  "ang",   // ang, iang, uang
  "ao",    // ao, iao
  "e",     // e, ie, ue, üe
  "ei",    // ei, ui
  "en",    // en, in, un, ün
  "eng",   // eng, ing, ueng, ong, iong
  "er",    // er
  "i",     // i, -i (zhi/chi/shi/ri/zi/ci/si)
  "o",     // o, uo
  "u",     // u, ü
] as const;
export type Final = (typeof FINALS)[number];

/**
 * Tones are mapped to rooms in the user's chosen set per HMM convention.
 */
export const TONE_TO_ROOM: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "entrance",
  2: "kitchen",
  3: "bedroom",
  4: "bathroom",
  5: "roof", // neutral tone
};

/**
 * Parse a pinyin string like "lín", "ma1", "zhang3", or "ma" into
 * (initial, final, tone) for HMM mapping.
 *
 * Accepts either tone-mark form ("lín") or numeric form ("lin2").
 * Returns the consolidated HMM final (so "lin" → final "en", not "in").
 */
export interface PinyinParts {
  initial: Initial;
  final: Final;
  tone: 1 | 2 | 3 | 4 | 5;
  /** The raw final string before HMM consolidation, e.g. "in" for "lin". */
  rawFinal: string;
}

/** Tone-marked vowels → base vowel + tone number. */
const TONE_VOWELS: Record<string, [string, 1 | 2 | 3 | 4 | 5]> = {
  // a
  "ā": ["a", 1], "á": ["a", 2], "ǎ": ["a", 3], "à": ["a", 4],
  // e
  "ē": ["e", 1], "é": ["e", 2], "ě": ["e", 3], "è": ["e", 4],
  // i
  "ī": ["i", 1], "í": ["i", 2], "ǐ": ["i", 3], "ì": ["i", 4],
  // o
  "ō": ["o", 1], "ó": ["o", 2], "ǒ": ["o", 3], "ò": ["o", 4],
  // u
  "ū": ["u", 1], "ú": ["u", 2], "ǔ": ["u", 3], "ù": ["u", 4],
  // ü
  "ǖ": ["ü", 1], "ǘ": ["ü", 2], "ǚ": ["ü", 3], "ǜ": ["ü", 4],
};

/** Strip tone marks, return [bare-string, tone]. */
function stripToneMarks(s: string): [string, 1 | 2 | 3 | 4 | 5] {
  let tone: 1 | 2 | 3 | 4 | 5 = 5;
  const bare = [...s].map((ch) => {
    const t = TONE_VOWELS[ch];
    if (t) {
      tone = t[1];
      return t[0];
    }
    return ch;
  }).join("");
  return [bare, tone];
}

/** Map a raw final (after initial is stripped) to the HMM consolidated final. */
function consolidateFinal(raw: string): Final {
  // Order matters — longer matches first.
  if (raw === "er") return "er";
  if (/^(iang|uang|ang)$/.test(raw)) return "ang";
  if (/^(eng|ing|ueng|ong|iong)$/.test(raw)) return "eng";
  if (/^(ian|uan|üan|van|an)$/.test(raw)) return "an";
  if (/^(in|un|ün|vn|en)$/.test(raw)) return "en";
  if (/^(iao|ao)$/.test(raw)) return "ao";
  if (/^(uai|ai)$/.test(raw)) return "ai";
  if (/^(ui|ei)$/.test(raw)) return "ei";
  if (/^(ia|ua|a)$/.test(raw)) return "a";
  if (/^(ie|üe|ue|ve|e)$/.test(raw)) return "e";
  if (/^(uo|o)$/.test(raw)) return "o";
  if (raw === "ü" || raw === "v" || raw === "u") return "u";
  if (raw === "i") return "i";
  // Fallback: best-effort
  return (raw as Final) ?? "a";
}

const INITIAL_MATCH = /^(zh|ch|sh|b|p|m|f|d|t|n|l|g|k|h|j|q|x|r|z|c|s|y|w)/;

export function parsePinyin(input: string): PinyinParts | null {
  if (!input) return null;
  // Numeric tone form ("ma1", "lin2")?
  let s = input.trim().toLowerCase().replace(/ü/g, "ü");
  let tone: 1 | 2 | 3 | 4 | 5;
  const numericMatch = /^([a-zü]+)([1-5])$/.exec(s);
  if (numericMatch) {
    s = numericMatch[1];
    tone = Number(numericMatch[2]) as 1 | 2 | 3 | 4 | 5;
  } else {
    [s, tone] = stripToneMarks(s);
  }
  if (!s) return null;

  // Split initial / rest. The regex may match "y" or "w" which are
  // orthographic-only — we fold them into ∅ + a final adjustment.
  const m = INITIAL_MATCH.exec(s);
  let initial: Initial;
  let rest: string;
  if (m) {
    const raw = m[0];
    rest = s.slice(raw.length);
    if (raw === "y") {
      initial = "∅";
      // yi → i, ya → ia, ye → ie, yao → iao, you → iou.
      // yu → ü, yuan → üan, yue → üe, yun → ün.
      if (rest.startsWith("u")) rest = "ü" + rest.slice(1);
      else if (rest === "" || rest === "i") rest = "i";
      else if (!rest.startsWith("i")) rest = "i" + rest;
    } else if (raw === "w") {
      initial = "∅";
      // wu → u, wa → ua, wo → uo, wei → uei.
      if (rest === "" || rest === "u") rest = "u";
      else if (!rest.startsWith("u")) rest = "u" + rest;
    } else {
      initial = raw as Initial;
    }
  } else {
    // Starts with a vowel directly.
    initial = "∅";
    rest = s;
  }

  const rawFinal = rest;
  const final = consolidateFinal(rest);
  return { initial, final, tone, rawFinal };
}

/** Tone → room name within the user's set. */
export function roomForTone(tone: 1 | 2 | 3 | 4 | 5): string {
  return TONE_TO_ROOM[tone];
}
