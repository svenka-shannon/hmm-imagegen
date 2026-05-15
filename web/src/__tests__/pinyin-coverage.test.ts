/**
 * Coverage audit — every entry in the freq-top + Heisig source lists
 * must parse to a (initial, final) pair where final is in our
 * canonical 13-element FINALS array.
 *
 * Surfaces any regressions where new orthographic variants leak through
 * unconsolidated (the bug that caused "ou" / "iu" / "iou" to ship as
 * not-a-canonical-final before iter 2026-05-15 audit).
 */
import { describe, expect, it } from "vitest";
import { FINALS, INITIALS, parsePinyin } from "../../../src/pinyin";
import freq from "../data/freq-top.json";
import heisig from "../data/heisig.json";

const FINALS_SET = new Set<string>(FINALS);
const INITIALS_SET = new Set<string>(INITIALS);

describe("pinyin coverage", () => {
  it("every freq-top entry parses to a canonical (initial, final)", () => {
    const bad: Array<{ hanzi: string; pinyin: string; reason: string }> = [];
    for (const e of freq as Array<{ hanzi: string; pinyin: string }>) {
      const p = parsePinyin(e.pinyin);
      if (!p) {
        bad.push({ hanzi: e.hanzi, pinyin: e.pinyin, reason: "no parse" });
        continue;
      }
      if (!FINALS_SET.has(p.final)) {
        bad.push({ hanzi: e.hanzi, pinyin: e.pinyin, reason: `final "${p.final}" not in FINALS` });
      }
      if (!INITIALS_SET.has(p.initial)) {
        bad.push({ hanzi: e.hanzi, pinyin: e.pinyin, reason: `initial "${p.initial}" not in INITIALS` });
      }
    }
    if (bad.length > 0) {
      console.error("Coverage failures:", bad.slice(0, 20));
    }
    expect(bad).toHaveLength(0);
  });

  it("every heisig entry that has pinyin parses to a canonical (initial, final)", () => {
    const bad: Array<{ hanzi: string; pinyin: string; reason: string }> = [];
    for (const e of heisig as Array<{ hanzi: string; pinyin?: string }>) {
      if (!e.pinyin) continue;
      const p = parsePinyin(e.pinyin);
      if (!p) {
        bad.push({ hanzi: e.hanzi, pinyin: e.pinyin, reason: "no parse" });
        continue;
      }
      if (!FINALS_SET.has(p.final)) {
        bad.push({ hanzi: e.hanzi, pinyin: e.pinyin, reason: `final "${p.final}" not in FINALS` });
      }
      if (!INITIALS_SET.has(p.initial)) {
        bad.push({ hanzi: e.hanzi, pinyin: e.pinyin, reason: `initial "${p.initial}" not in INITIALS` });
      }
    }
    if (bad.length > 0) {
      console.error("Coverage failures (heisig):", bad.slice(0, 20));
    }
    expect(bad).toHaveLength(0);
  });

  it("every canonical INITIAL appears in the freq-top sample", () => {
    const seen = new Set<string>();
    for (const e of freq as Array<{ pinyin: string }>) {
      const p = parsePinyin(e.pinyin);
      if (p) seen.add(p.initial);
    }
    const missing = INITIALS.filter((i) => !seen.has(i));
    expect(missing).toHaveLength(0);
  });

  it("every canonical FINAL appears in the freq-top sample", () => {
    const seen = new Set<string>();
    for (const e of freq as Array<{ pinyin: string }>) {
      const p = parsePinyin(e.pinyin);
      if (p) seen.add(p.final);
    }
    const missing = FINALS.filter((f) => !seen.has(f));
    expect(missing).toHaveLength(0);
  });
});
