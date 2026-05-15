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
