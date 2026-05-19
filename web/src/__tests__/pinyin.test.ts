import { describe, it, expect } from "vitest";
import { INITIALS, FINALS, parsePinyin, TONE_TO_ROOM } from "../../../src/pinyin";

describe("INITIALS / FINALS shape", () => {
  it("has exactly 55 initials (Mandarin Blueprint canon)", () => {
    expect(INITIALS).toHaveLength(55);
  });
  it("has exactly 13 finals (including the null Ø)", () => {
    expect(FINALS).toHaveLength(13);
    expect(FINALS).toContain("ø");
  });
});

describe("parsePinyin — bare initials", () => {
  it("parses tone-marked form", () => {
    expect(parsePinyin("mā")).toMatchObject({ final: "a", initial: "m", tone: 1 });
    expect(parsePinyin("zhǎng")).toMatchObject({ final: "ang", initial: "zh", tone: 3 });
  });

  it("treats zi/ci/si/zhi/chi/shi/ri as bare-consonant + null final", () => {
    expect(parsePinyin("zhì")).toMatchObject({ final: "ø", initial: "zh", tone: 4 });
    expect(parsePinyin("shí")).toMatchObject({ final: "ø", initial: "sh", tone: 2 });
    expect(parsePinyin("rì")).toMatchObject({ final: "ø", initial: "r", tone: 4 });
    expect(parsePinyin("zǐ")).toMatchObject({ final: "ø", initial: "z", tone: 3 });
  });

  it("parses numeric form", () => {
    expect(parsePinyin("ma1")).toMatchObject({ final: "a", initial: "m", tone: 1 });
  });
});

describe("parsePinyin — i-extended (female) initials", () => {
  it("turns 'bi'/'pi'/etc into their own initial", () => {
    expect(parsePinyin("bī")).toMatchObject({ final: "ø", initial: "bi", tone: 1 });
    expect(parsePinyin("lín")).toMatchObject({ final: "en", initial: "li", tone: 2 });
    expect(parsePinyin("míng")).toMatchObject({ final: "eng", initial: "mi", tone: 2 });
    expect(parsePinyin("jiāng")).toMatchObject({ final: "ang", initial: "ji", tone: 1 });
  });

  it("applies the iu→i+ou rewrite", () => {
    expect(parsePinyin("liú")).toMatchObject({ final: "ou", initial: "li" });
    expect(parsePinyin("jiǔ")).toMatchObject({ final: "ou", initial: "ji" });
    expect(parsePinyin("qiú")).toMatchObject({ final: "ou", initial: "qi" });
    expect(parsePinyin("xiū")).toMatchObject({ final: "ou", initial: "xi" });
  });
});

describe("parsePinyin — u-extended (fictional) initials", () => {
  it("turns 'bu'/'du'/etc into their own initial", () => {
    expect(parsePinyin("bù")).toMatchObject({ final: "ø", initial: "bu", tone: 4 });
    expect(parsePinyin("dū")).toMatchObject({ final: "ø", initial: "du", tone: 1 });
    expect(parsePinyin("zhū")).toMatchObject({ final: "ø", initial: "zhu", tone: 1 });
  });

  it("applies the ui→u+ei rewrite", () => {
    expect(parsePinyin("duì")).toMatchObject({ final: "ei", initial: "du" });
    expect(parsePinyin("tuī")).toMatchObject({ final: "ei", initial: "tu" });
    expect(parsePinyin("guī")).toMatchObject({ final: "ei", initial: "gu" });
  });

  it("applies the floating-e (un→u+en)", () => {
    expect(parsePinyin("dùn")).toMatchObject({ final: "en", initial: "du" });
    expect(parsePinyin("sǔn")).toMatchObject({ final: "en", initial: "su" });
  });
});

describe("parsePinyin — ü-extended (god/leader) initials", () => {
  it("turns 'nü'/'lü' into their own initial", () => {
    expect(parsePinyin("nǚ")).toMatchObject({ final: "ø", initial: "nü", tone: 3 });
    expect(parsePinyin("lǜ")).toMatchObject({ final: "ø", initial: "lü", tone: 4 });
  });

  it("treats j/q/x + 'u' as ü-initial (umlaut elision)", () => {
    expect(parsePinyin("jū")).toMatchObject({ final: "ø", initial: "jü", tone: 1 });
    expect(parsePinyin("qù")).toMatchObject({ final: "ø", initial: "qü", tone: 4 });
    expect(parsePinyin("xué")).toMatchObject({ final: "e", initial: "xü", tone: 2 });
    expect(parsePinyin("juān")).toMatchObject({ final: "an", initial: "jü", tone: 1 });
  });
});

describe("parsePinyin — null-initial (y/w-words)", () => {
  it("folds y- into ∅i-", () => {
    expect(parsePinyin("yī")).toMatchObject({ final: "ø", initial: "∅i", tone: 1 });
    expect(parsePinyin("yīng")).toMatchObject({ final: "eng", initial: "∅i", tone: 1 });
    expect(parsePinyin("yǒu")).toMatchObject({ final: "ou", initial: "∅i" });
  });

  it("folds w- into ∅u-", () => {
    expect(parsePinyin("wǒ")).toMatchObject({ final: "o", initial: "∅u", tone: 3 });
    expect(parsePinyin("wǔ")).toMatchObject({ final: "ø", initial: "∅u", tone: 3 });
    expect(parsePinyin("wèi")).toMatchObject({ final: "ei", initial: "∅u", tone: 4 });
  });

  it("folds y+u into ∅ü- (yu/yue/yuan/yun)", () => {
    expect(parsePinyin("yú")).toMatchObject({ final: "ø", initial: "∅ü", tone: 2 });
    expect(parsePinyin("yuán")).toMatchObject({ final: "an", initial: "∅ü", tone: 2 });
    expect(parsePinyin("yùn")).toMatchObject({ final: "en", initial: "∅ü", tone: 4 });
  });

  it("treats vowel-start syllables (a, an, ai, ao, er) as bare ∅", () => {
    expect(parsePinyin("ā")).toMatchObject({ final: "a", initial: "∅", tone: 1 });
    expect(parsePinyin("ér")).toMatchObject({ final: "e", initial: "∅" });
  });
});

describe("parsePinyin — misc", () => {
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
