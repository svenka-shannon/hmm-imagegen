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

/**
 * Generate a canonical portrait for a description-only actor (or set),
 * and return it as a `data:image/...;base64,...` URL ready to drop into
 * the slot's imageDataUrls / exteriorDataUrl.
 *
 * Why: text-only descriptions don't pin appearance — Gemini will draw
 * a slightly different "Zack" every card. Generating ONE canonical
 * portrait up front, then passing it as a reference for every scene,
 * gives the same fidelity guarantee a real photo would.
 */
export async function generatePortrait(opts: {
  name: string;
  description: string;
  kind: "actor" | "set";
  model?: string;
}): Promise<string> {
  const portraitPrompt = opts.kind === "actor"
    ? `Photorealistic portrait of ${opts.name}. ${opts.description}. Eye-level camera, sharp focus on the face, neutral indoor background, natural lighting. No text, no captions, no labels, no logos.`
    : `Photorealistic exterior shot of ${opts.name}. ${opts.description}. Wide-angle daytime view of the building or location. No text, no captions, no labels, no logos.`;
  const gen = await generateScene({
    backend: "gemini",
    model: opts.model ?? "gemini-2.5-flash-image",
    prompt: portraitPrompt,
  });
  // /api/imagegen/file/<name> returns a PNG; fetch + dataurl-ify so we
  // can drop it straight into the actor/set slot.
  const res = await fetch(gen.url);
  if (!res.ok) throw new Error(`portrait fetch failed: ${res.status}`);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result as string));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
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
