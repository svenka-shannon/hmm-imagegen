import { describe, it, expect } from "vitest";
import { parsePinyin, TONE_TO_ROOM } from "../../../src/pinyin";

describe("parsePinyin", () => {
  it("parses tone-marked form", () => {
    expect(parsePinyin("mā")).toMatchObject({ final: "a", initial: "m", tone: 1 });
    expect(parsePinyin("lín")).toMatchObject({ final: "en", initial: "l", tone: 2 });
    expect(parsePinyin("zhǎng")).toMatchObject({ final: "ang", initial: "zh", tone: 3 });
    expect(parsePinyin("shì")).toMatchObject({ final: "i", initial: "sh", tone: 4 });
  });

  it("parses numeric form", () => {
    expect(parsePinyin("ma1")).toMatchObject({ final: "a", initial: "m", tone: 1 });
    expect(parsePinyin("lin2")).toMatchObject({ final: "en", initial: "l", tone: 2 });
  });

  it("treats y/w as null-initial + folded final", () => {
    expect(parsePinyin("yī")).toMatchObject({ initial: "∅", tone: 1, rawFinal: "i" });
    expect(parsePinyin("wǒ")).toMatchObject({ initial: "∅", tone: 3, rawFinal: "uo" });
    expect(parsePinyin("yuán")).toMatchObject({ initial: "∅", tone: 2 });
  });

  it("defaults to tone 5 (neutral) when no tone mark", () => {
    expect(parsePinyin("ma")).toMatchObject({ tone: 5 });
  });

  it("returns null for empty input", () => {
    expect(parsePinyin("")).toBeNull();
  });
});

describe("TONE_TO_ROOM", () => {
  it("maps the 5 tones to expected rooms", () => {
    expect(TONE_TO_ROOM[1]).toBe("entrance");
    expect(TONE_TO_ROOM[2]).toBe("kitchen");
    expect(TONE_TO_ROOM[3]).toBe("bedroom");
    expect(TONE_TO_ROOM[4]).toBe("bathroom");
    expect(TONE_TO_ROOM[5]).toBe("roof");
  });
});
