import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetStoreForTests, useActors, useSets } from "../lib/store";

describe("library store hooks", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetStoreForTests();
    // Stub fetch so the debounced server sync doesn't try to reach
    // the bun server during tests.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("useActors persists assignments to localStorage", () => {
    const { result } = renderHook(() => useActors());
    expect(result.current.actors).toEqual({});
    act(() => {
      result.current.setActor("b", { category: "man", name: "Beyoncé" });
    });
    expect(result.current.actors.b).toMatchObject({ name: "Beyoncé" });
    // Persisted
    const raw = localStorage.getItem("hmm.actors.v1");
    expect(raw).toContain("Beyoncé");
  });

  it("useActors clearActor removes the slot", () => {
    const { result } = renderHook(() => useActors());
    act(() => {
      result.current.setActor("b", { category: "man", name: "Bob" });
    });
    act(() => {
      result.current.clearActor("b");
    });
    expect(result.current.actors.b).toBeUndefined();
  });

  it("useSets persists assignments", () => {
    const { result } = renderHook(() => useSets());
    act(() => {
      result.current.setSet("a", { name: "Apartment" });
    });
    expect(result.current.sets.a).toMatchObject({ name: "Apartment" });
    expect(localStorage.getItem("hmm.sets.v1")).toContain("Apartment");
  });

  it("useSets supports per-tone room maps", () => {
    const { result } = renderHook(() => useSets());
    act(() => {
      result.current.setSet("a", {
        name: "Apartment",
        rooms: { 1: "data:image/jpeg;base64,AAA" },
      });
    });
    expect(result.current.sets.a?.rooms?.[1]).toBe("data:image/jpeg;base64,AAA");
  });
});
