/**
 * Source-list loaders. Two built-in sources for now:
 *   - "top-freq" — Jun Da's modern Chinese frequency list (top 3000)
 *   - "heisig-rth" — Remembering the Simplified Hanzi frame order
 *
 * In the SPA these are imported as static JSON. In the bun server they
 * are read off disk on request.
 */

export interface FreqEntry {
  freqRank: number;
  hanzi: string;
  pinyin: string;
  meaning: string;
  hsk?: number;
  strokeCount?: number;
  radical?: string;
}

export interface HeisigEntry {
  heisigNum: number;
  hanzi: string;
  keyword: string;
  strokes?: number;
  pinyin?: string;
  meaning?: string;
}

export type SourceList = "top-freq" | "heisig-rth";

export interface UnifiedEntry {
  hanzi: string;
  pinyin: string;
  meaning: string;
  /** Source-specific rank (1-based) within the originating list. */
  rank: number;
  /** Heisig RTH frame number, when sourced from Heisig. */
  heisigNum?: number;
  /** Frequency rank within Jun Da's list, when sourced from frequency. */
  freqRank?: number;
}

/**
 * Normalise a freq entry to the unified shape.
 */
export function fromFreq(e: FreqEntry): UnifiedEntry {
  return {
    freqRank: e.freqRank,
    hanzi: e.hanzi,
    meaning: e.meaning,
    pinyin: e.pinyin,
    rank: e.freqRank,
  };
}

/**
 * Normalise a Heisig entry. Skips entries without a hydrated pinyin/meaning.
 */
export function fromHeisig(e: HeisigEntry): UnifiedEntry | null {
  if (!e.pinyin || !e.meaning) return null;
  return {
    hanzi: e.hanzi,
    heisigNum: e.heisigNum,
    meaning: e.keyword || e.meaning,
    pinyin: e.pinyin,
    rank: e.heisigNum,
  };
}
