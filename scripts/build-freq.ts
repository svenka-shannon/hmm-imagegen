#!/usr/bin/env bun
/**
 * Convert data/hanziDB.csv (Jun Da's freq list, via ruddfawcett/hanziDB.csv,
 * CC-BY-SA 4.0) into data/freq-top.json — top 3000 characters with pinyin,
 * meaning, and frequency rank.
 *
 * Run: bun run scripts/build-freq.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CSV_PATH = join(import.meta.dir, "../data/hanziDB.csv");
const OUT_PATH = join(import.meta.dir, "../data/freq-top.json");
const TOP_N = 3000;

interface Entry {
  hanzi: string;
  pinyin: string;
  meaning: string;
  freqRank: number;
  hsk?: number;
  strokeCount?: number;
  radical?: string;
}

function parseCSVLine(line: string): string[] {
  // hanziDB.csv has quoted fields with commas inside.
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const csv = readFileSync(CSV_PATH, "utf8");
const lines = csv.split(/\r?\n/);
const header = parseCSVLine(lines[0]);
// frequency_rank, charcter (sic), pinyin, definition, radical, radical_code, stroke_count, hsk_level, general_standard_num
const col = {
  hanzi: header.indexOf("charcter"),
  hsk: header.indexOf("hsk_level"),
  meaning: header.indexOf("definition"),
  pinyin: header.indexOf("pinyin"),
  radical: header.indexOf("radical"),
  rank: header.indexOf("frequency_rank"),
  strokeCount: header.indexOf("stroke_count"),
};

const entries: Entry[] = [];
for (let i = 1; i < lines.length && entries.length < TOP_N; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  const parts = parseCSVLine(line);
  const hanzi = parts[col.hanzi];
  const pinyin = parts[col.pinyin];
  if (!hanzi || !pinyin) continue;
  const entry: Entry = {
    freqRank: Number(parts[col.rank]),
    hanzi,
    meaning: parts[col.meaning].replace(/^"|"$/g, ""),
    pinyin,
  };
  const hsk = Number(parts[col.hsk]);
  if (Number.isFinite(hsk) && hsk > 0) entry.hsk = hsk;
  const sc = Number(parts[col.strokeCount]);
  if (Number.isFinite(sc) && sc > 0) entry.strokeCount = sc;
  if (parts[col.radical]) entry.radical = parts[col.radical];
  entries.push(entry);
}

writeFileSync(OUT_PATH, JSON.stringify(entries, null, 2));
console.log(`wrote ${entries.length} entries to ${OUT_PATH}`);
