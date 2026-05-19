/**
 * Client-side helper for the hmm-imagegen server's /api/imagegen/scene endpoint.
 *
 * Browsers can't shell out to nano-banana directly (no python env in
 * a tab), so the SPA calls the local bun server which proxies to
 * the Gemini API. The server also serves the resulting PNGs.
 */

export interface SceneRequest {
  backend: "gemini" | "mock";
  prompt: string;
  refs?: string[];
  model?: string;
}

export interface SceneResponse {
  url: string;
  path: string;
}

const BASE = "/api/imagegen";

export async function generateScene(req: SceneRequest): Promise<SceneResponse> {
  const res = await fetch(`${BASE}/scene`, {
    body: JSON.stringify(req),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`scene gen failed (${res.status}): ${text}`);
  }
  return (await res.json()) as SceneResponse;
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result as string));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

/**
 * Generate a SET of canonical portraits for a description-only actor or
 * location. Returns N data URLs ready to drop into imageDataUrls (or
 * exteriorDataUrl + variants).
 *
 * Why a set, not one: text-only generations of the same description
 * produce different-looking faces each time → no consistency across
 * cards. Strategy:
 *   1. Generate ONE canonical photo from the description (text → image)
 *   2. Generate each subsequent variant with the canonical as a
 *      reference image (-i), prompted for a different pose / angle /
 *      framing of the SAME person.
 *
 * Step-2 image-to-image keeps facial features locked while varying
 * pose, so the multi-ref pipeline downstream gets multiple ANGLES of
 * one person rather than multiple PEOPLE who match the same vibe.
 */
export async function generatePortrait(opts: {
  name: string;
  description: string;
  kind: "actor" | "set";
  model?: string;
  /** How many references to produce. Default 3 (canonical + 2 angles). */
  count?: number;
}): Promise<string[]> {
  const count = Math.max(1, opts.count ?? 3);
  const model = opts.model ?? "gemini-2.5-flash-image";

  // Step 1: canonical, from text only.
  const canonicalPrompt = opts.kind === "actor"
    ? `Photorealistic portrait of ${opts.name}. ${opts.description}. Head-on, neutral expression, eye-level camera, sharp focus on the face, neutral indoor background, natural lighting. No text, no captions, no labels, no logos.`
    : `Photorealistic exterior shot of ${opts.name}. ${opts.description}. Wide-angle daytime view of the building or location, no people, sharp focus. No text, no captions, no labels, no logos.`;
  const first = await generateScene({ backend: "gemini", model, prompt: canonicalPrompt });
  const firstDataUrl = await urlToDataUrl(first.url);
  if (count === 1) return [firstDataUrl];

  // Step 2: variants conditioned on the canonical so the face / building
  // appearance is pinned and only the pose / angle varies.
  const actorVariantPrompts = [
    `Same person as the reference image — same face, same hair, same body type, same age. Three-quarter profile, slight smile, same clothing style. Sharp focus on the face, natural lighting. No text, no captions, no logos.`,
    `Same person as the reference image — same face, same hair, same body type. Full-body shot showing posture, casual pose, ambient setting consistent with their description. Sharp focus, natural lighting. No text, no captions, no logos.`,
    `Same person as the reference image — same face, same hair. Close-up candid expression, slightly different mood, same identity. Sharp focus, natural lighting. No text, no captions, no logos.`,
  ];
  const setVariantPrompts = [
    `Same location as the reference image — same architectural style, same colors, same surroundings. Different angle: closer view of the entrance. Sharp focus, natural lighting. No text, no captions, no logos.`,
    `Same location as the reference image — same architecture, same surroundings. Different angle: looking from the side, showing the building's profile. Sharp focus, natural lighting. No text, no captions, no logos.`,
    `Same location as the reference image — same architecture. Different time of day: late afternoon golden light. Same camera angle, same composition. Sharp focus. No text, no captions, no logos.`,
  ];
  const variantPrompts = opts.kind === "actor" ? actorVariantPrompts : setVariantPrompts;
  const needed = variantPrompts.slice(0, count - 1);
  const variants = await Promise.all(
    needed.map(async (p) => {
      const g = await generateScene({
        backend: "gemini",
        model,
        prompt: p,
        refs: [firstDataUrl],
      });
      return urlToDataUrl(g.url);
    }),
  );
  return [firstDataUrl, ...variants];
}

/** Fetch an already-generated image and return its base64-encoded body. */
export async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const data = reader.result as string;
      // strip "data:image/png;base64," prefix
      const idx = data.indexOf(",");
      resolve(data.slice(idx + 1));
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}
