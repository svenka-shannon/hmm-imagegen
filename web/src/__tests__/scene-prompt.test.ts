import { describe, it, expect } from "vitest";
import { parsePinyin } from "../../../src/pinyin";
import { buildScene, resolveLibrary } from "../../../src/scene-prompt";

describe("buildScene", () => {
  it("renders the canonical Mandarin Blueprint forest example", () => {
    const pinyin = parsePinyin("lín")!;
    const scene = buildScene({
      actor: { name: "Arnold Schwarzenegger" },
      components: ["木", "木"],
      meaning: "forest",
      pinyin,
      set: { name: "my childhood home" },
    });
    expect(scene.short).toBe(
      "Arnold Schwarzenegger in the kitchen of my childhood home — forest",
    );
    expect(scene.long).toContain("kitchen");
    expect(scene.long).toContain("childhood home");
    expect(scene.long).toContain("forest");
  });

  it("includes props when assigned", () => {
    const pinyin = parsePinyin("mā")!;
    const scene = buildScene({
      actor: { name: "Mom" },
      components: ["女", "马"],
      meaning: "mother",
      pinyin,
      props: [
        { component: "女", prop: "doll" },
        { component: "马", prop: "horse" },
      ],
      set: { name: "Oracle Park" },
    });
    expect(scene.short).toContain("with doll and horse");
    expect(scene.short).toContain("mother");
  });

  it("attaches reference images to refs[]", () => {
    const pinyin = parsePinyin("shān")!;
    const scene = buildScene({
      actor: { imageDataUrl: "data:image/jpeg;base64,AAA", name: "Sherpa" },
      meaning: "mountain",
      pinyin,
      set: {
        name: "high school",
        rooms: { 1: "data:image/jpeg;base64,BBB" },
      },
    });
    expect(scene.refs).toHaveLength(2);
    expect(scene.refs[0]).toMatchObject({ kind: "actor" });
    expect(scene.refs[1]).toMatchObject({ kind: "room" });
  });
});

describe("resolveLibrary", () => {
  it("returns null if either slot is unfilled", () => {
    const pinyin = parsePinyin("mā")!;
    expect(resolveLibrary(pinyin, {}, {})).toBeNull();
    expect(resolveLibrary(pinyin, { m: { name: "Mom" } }, {})).toBeNull();
    expect(resolveLibrary(pinyin, {}, { a: { name: "Park" } })).toBeNull();
  });

  it("returns both when both are filled", () => {
    const pinyin = parsePinyin("mā")!;
    const r = resolveLibrary(
      pinyin,
      { m: { name: "Mom" } },
      { a: { name: "Park" } },
    );
    expect(r).toMatchObject({ actor: { name: "Mom" }, set: { name: "Park" } });
  });
});
