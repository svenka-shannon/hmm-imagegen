#!/usr/bin/env bun
/**
 * Parse data/rsh.xml (Remembering Simplified Hanzi via github.com/rouseabout/heisig)
 * into data/heisig.json — sorted by Heisig frame number, each entry has hanzi +
 * keyword + stroke count.
 *
 * Pinyin meanings are NOT in the XML (RTH deliberately omits pronunciation).
 * We hydrate pinyin + dictionary meaning from data/freq-top.json by hanzi key
 * where possible.
 *
 * Run: bun run scripts/build-heisig.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const XML_PATH = join(import.meta.dir, "../data/rsh.xml");
const FREQ_PATH = join(import.meta.dir, "../data/freq-top.json");
const OUT_PATH = join(import.meta.dir, "../data/heisig.json");

interface HeisigEntry {
  heisigNum: number;
  hanzi: string;
  keyword: string;
  strokes?: number;
  pinyin?: string;
  meaning?: string;
}

const xml = readFileSync(XML_PATH, "utf8");

// Match every <frame ... character="X" keyword="Y" number="N" ...> tag.
// Strokes appear in <strokes>N</strokes> immediately after.
const frameRe = /<frame[^>]*\bcharacter="([^"]+)"[^>]*\bkeyword="([^"]+)"[^>]*\bnumber="(\d+)"[^>]*>(?:\s*<strokes>(\d+)<\/strokes>)?/g;
// Also support attribute order with number first (xml file has number first).
const frameReAlt = /<frame[^>]*\bnumber="(\d+)"[^>]*\bcharacter="([^"]+)"[^>]*\bkeyword="([^"]+)"[^>]*>(?:\s*<strokes>(\d+)<\/strokes>)?/g;

const entries: HeisigEntry[] = [];
const seen = new Set<number>();

for (const m of xml.matchAll(frameReAlt)) {
  const n = Number(m[1]);
  const hanzi = m[2];
  const keyword = m[3];
  const strokes = m[4] ? Number(m[4]) : undefined;
  if (seen.has(n)) continue;
  seen.add(n);
  entries.push({ hanzi, heisigNum: n, keyword, ...(strokes ? { strokes } : {}) });
}

// Fallback for any frames the alt regex missed.
for (const m of xml.matchAll(frameRe)) {
  const n = Number(m[3]);
  if (seen.has(n)) continue;
  seen.add(n);
  entries.push({ hanzi: m[1], heisigNum: n, keyword: m[2], strokes: m[4] ? Number(m[4]) : undefined });
}

entries.sort((a, b) => a.heisigNum - b.heisigNum);

// Hydrate with pinyin/meaning from freq list (best-effort).
const freq = JSON.parse(readFileSync(FREQ_PATH, "utf8")) as Array<{ hanzi: string; pinyin: string; meaning: string }>;
const byHanzi = new Map(freq.map((e) => [e.hanzi, e]));
let hydrated = 0;
for (const e of entries) {
  const f = byHanzi.get(e.hanzi);
  if (f) {
    e.pinyin = f.pinyin;
    e.meaning = f.meaning;
    hydrated++;
  }
}

writeFileSync(OUT_PATH, JSON.stringify(entries, null, 2));
console.log(`wrote ${entries.length} entries (${hydrated} with pinyin/meaning) to ${OUT_PATH}`);
