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
      // Pin the room label so the test isn't coupled to whatever the
      // current per-user default happens to be.
      toneRooms: { 2: "kitchen" },
    });
    expect(scene.short).toBe(
      "Arnold Schwarzenegger in the kitchen of my childhood home — forest",
    );
    expect(scene.long).toContain("kitchen");
    expect(scene.long).toContain("childhood home");
    expect(scene.long).toContain("forest");
    // The prompt must explicitly forbid text overlays.
    expect(scene.long.toLowerCase()).toContain("no text");
    expect(scene.long.toLowerCase()).toContain("no captions");
    expect(scene.long.toLowerCase()).toContain("no logos");
  });

  it("includes props when assigned (short and long)", () => {
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
    // Long prompt names props concretely without leaking component glyphs.
    expect(scene.long).toContain("doll");
    expect(scene.long).toContain("horse");
    expect(scene.long).not.toContain("女");
    expect(scene.long).not.toContain("马");
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
    // Fidelity citation by index in the long prompt
    expect(scene.long).toContain("reference image 1");
    expect(scene.long).toContain("reference image 2");
    expect(scene.long).toContain("must match");
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
