/**
 * Unit tests for the deck-progress helpers added for the Sync flow.
 *
 * `deckProgress` issues 5 `findCards` queries in parallel and aggregates
 * counts. Each query string must escape `"` inside the deck name so
 * a deck like `My "Special" Deck` doesn't break the AnkiConnect query.
 *
 * These tests stub fetch to capture every outgoing AnkiConnect request,
 * assert the correct queries are issued, and verify the aggregate
 * shape matches what the GenerateDeck Sync UI reads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deckProgress } from "../../../src/anki-connect";

interface AnkiConnectRequest {
  action: string;
  params: Record<string, unknown>;
}

function stubFetch(responses: Map<string, number[]>) {
  const requests: AnkiConnectRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as AnkiConnectRequest;
      requests.push(body);
      const queryKey = (body.params.query as string) ?? body.action;
      const result = responses.get(queryKey) ?? [];
      return {
        json: async () => ({ error: null, result }),
        ok: true,
      } as Response;
    }),
  );
  return requests;
}

describe("deckProgress", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("aggregates new / learning / review / mature / total in one go", async () => {
    const responses = new Map<string, number[]>([
      ['deck:"HMM"', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
      ['deck:"HMM" is:new', [3, 4, 5]],
      ['deck:"HMM" is:learn', [6]],
      ['deck:"HMM" is:review', [7, 8]],
      ['deck:"HMM" prop:ivl>=21', [9, 10]],
    ]);
    stubFetch(responses);

    const p = await deckProgress("HMM");

    expect(p).toEqual({
      learning: 1,
      mature: 2,
      newBuffer: 3,
      review: 2,
      total: 10,
    });
  });

  it("returns all zeros for an empty deck", async () => {
    const responses = new Map<string, number[]>();
    stubFetch(responses);

    const p = await deckProgress("Empty");

    expect(p).toEqual({
      learning: 0,
      mature: 0,
      newBuffer: 0,
      review: 0,
      total: 0,
    });
  });

  it("escapes double-quotes in the deck name to keep the query valid", async () => {
    const responses = new Map<string, number[]>([
      ['deck:"My \\"Special\\" Deck"', [1, 2]],
    ]);
    const requests = stubFetch(responses);

    await deckProgress('My "Special" Deck');

    const queries = requests.map((r) => r.params.query as string);
    // All 5 queries should target the escaped deck name.
    for (const q of queries) {
      expect(q).toContain('deck:"My \\"Special\\" Deck"');
    }
  });

  it("issues the 5 expected queries in parallel", async () => {
    const responses = new Map<string, number[]>();
    const requests = stubFetch(responses);

    await deckProgress("HMM Generated Hanzi");

    const queries = requests.map((r) => r.params.query as string).sort();
    expect(queries).toEqual([
      'deck:"HMM Generated Hanzi"',
      'deck:"HMM Generated Hanzi" is:learn',
      'deck:"HMM Generated Hanzi" is:new',
      'deck:"HMM Generated Hanzi" is:review',
      'deck:"HMM Generated Hanzi" prop:ivl>=21',
    ]);
    // All 5 actions should be `findCards` — we don't want any extra
    // round-trips sneaking in.
    expect(requests.every((r) => r.action === "findCards")).toBe(true);
  });
});
