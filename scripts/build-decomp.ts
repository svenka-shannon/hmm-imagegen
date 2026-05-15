#!/usr/bin/env bun
/**
 * Parse data/ids.txt (CHISE IDS Database, via github.com/cjkvi/cjkvi-ids,
 * public domain) into data/decomp.json — a flat map of every hanzi we
 * care about to its list of immediate components.
 *
 * IDS strings use Unicode "Ideographic Description Characters" (U+2FF0..U+2FFF)
 * as operators followed by component chars. Examples:
 *   林 = ⿰木木        (left-right: 木 + 木)
 *   的 = ⿰白勺
 *   家 = ⿱宀豕        (top-bottom: 宀 + 豕)
 *   森 = ⿱木⿰木木    (top: 木, bottom: ⿰木木 which is itself 木 + 木 = 森's bottom row)
 *
 * For HMM prop-mapping we want the LEAF components (the actual radical-like
 * sub-pieces), so we recursively descend through IDS operators and emit only
 * the non-operator chars.
 *
 * We restrict output to chars present in freq-top.json + heisig.json so the
 * resulting JSON stays small (~3500 chars × short lists).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const IDS_PATH = join(import.meta.dir, "../data/ids.txt");
const FREQ_PATH = join(import.meta.dir, "../data/freq-top.json");
const HEISIG_PATH = join(import.meta.dir, "../data/heisig.json");
const OUT_PATH = join(import.meta.dir, "../data/decomp.json");

// Unicode "Ideographic Description Characters" — the IDS operators.
// Each takes a fixed arity:
//   ⿰⿱⿴⿵⿶⿷⿸⿹⿺⿻ → 2 operands
//   ⿲⿳ → 3 operands
const IDC_2 = "⿰⿱⿴⿵⿶⿷⿸⿹⿺⿻";
const IDC_3 = "⿲⿳";

function isIDC(ch: string): boolean {
  return IDC_2.includes(ch) || IDC_3.includes(ch);
}
function arity(ch: string): number {
  if (IDC_3.includes(ch)) return 3;
  if (IDC_2.includes(ch)) return 2;
  return 0;
}

/** Parse the IDS expression and return only the leaf component chars. */
function parseIDS(s: string): string[] {
  // Tokenise codepoint-by-codepoint (chars may be 2 UTF-16 units each).
  const tokens = [...s];
  const out: string[] = [];
  let i = 0;
  function step(): void {
    if (i >= tokens.length) return;
    const t = tokens[i++];
    if (isIDC(t)) {
      const n = arity(t);
      for (let k = 0; k < n; k++) step();
    } else {
      // Leaf component (or sometimes a `[…]` variant tag — strip those).
      if (t === "[") {
        while (i < tokens.length && tokens[i] !== "]") i++;
        i++; // consume the ']'
        return;
      }
      out.push(t);
    }
  }
  while (i < tokens.length) step();
  return out;
}

// Build the IDS lookup table.
const raw = readFileSync(IDS_PATH, "utf8");
const idsMap = new Map<string, string>();
for (const line of raw.split("\n")) {
  if (!line || line.startsWith("#")) continue;
  // Columns: U+xxxx \t char \t IDS [variants…]
  const parts = line.split("\t");
  if (parts.length < 3) continue;
  const ch = parts[1];
  // Take the first IDS expression (some chars have variants for J/G/T/V/K
  // listed in later columns with `^…$` markers — first column is usually
  // the canonical one).
  let ids = parts[2];
  // Strip leading region markers like "^GJ" if present
  ids = ids.replace(/^\^[A-Z]+/, "");
  // Strip trailing `$N` arity markers if present
  ids = ids.replace(/\$\d+$/, "");
  idsMap.set(ch, ids);
}

// Load char lists we care about.
const freq = JSON.parse(readFileSync(FREQ_PATH, "utf8")) as { hanzi: string }[];
const heisig = JSON.parse(readFileSync(HEISIG_PATH, "utf8")) as { hanzi: string }[];
const wanted = new Set([...freq.map((e) => e.hanzi), ...heisig.map((e) => e.hanzi)]);

const decomp: Record<string, string[]> = {};
let resolved = 0;
for (const hanzi of wanted) {
  const ids = idsMap.get(hanzi);
  if (!ids) continue;
  // If the IDS just IS the char itself (atomic), record an empty list.
  if (ids === hanzi || [...ids].length === 1) {
    decomp[hanzi] = [];
    continue;
  }
  decomp[hanzi] = parseIDS(ids);
  resolved++;
}

writeFileSync(OUT_PATH, JSON.stringify(decomp, null, 2));
console.log(`wrote decomp for ${Object.keys(decomp).length} chars (${resolved} non-atomic) to ${OUT_PATH}`);
