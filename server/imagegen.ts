/**
 * Image generation client. Routes to one of a small set of providers
 * based on the user's chosen backend + API key. For v1 we ship just
 * "gemini" (Google's nano-banana / Imagen). Adapter shape allows
 * "fal-ai" / "openai" later without touching callers.
 *
 * The server proxies image-gen calls so the user's API key never lives
 * in browser localStorage / Vite bundle. The key is either:
 *   - in process.env.GEMINI_API_KEY at server boot
 *   - or POSTed as the `apiKey` field of the body (transient — not saved)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export type Backend = "gemini" | "mock";

export interface ImagegenRequest {
  backend: Backend;
  apiKey?: string;
  /** The scene description for the image. */
  prompt: string;
  /** Optional reference images (data: URLs or http(s) URLs). */
  refs?: string[];
  /** Model variant for the backend (e.g. "gemini-2.5-flash-image"). */
  model?: string;
}

export interface ImagegenResult {
  /** Local file path of the generated image (PNG). */
  path: string;
  /** Public URL to fetch the image from this server. */
  url: string;
}

const OUT_ROOT = join(tmpdir(), "hmm-imagegen-out");

/**
 * Calls the Gemini `generateContent` REST endpoint directly. Replaces the
 * previous shell-out to the mac-only nano-banana Python CLI so the server
 * runs on Windows + Linux without any python / uv / google-genai install.
 *
 * Multi-image conditioning: any data-URL refs are decoded and inlined as
 * `inline_data` parts so the model sees the actor portrait + room photo
 * alongside the scene prompt — same fidelity guarantee the wizard relied
 * on with the CLI path.
 *
 * Docs: https://ai.google.dev/api/generate-content
 */
async function gemini(req: ImagegenRequest, dir: string): Promise<string> {
  const apiKey = req.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const model = req.model ?? "gemini-2.5-flash-image";

  interface InlineData { inline_data: { data: string; mime_type: string } }
  interface TextPart { text: string }
  type Part = InlineData | TextPart;

  const parts: Part[] = [{ text: req.prompt }];
  for (const ref of req.refs ?? []) {
    if (!ref.startsWith("data:")) continue;
    const m = /^data:([^;]+);base64,(.+)$/i.exec(ref);
    if (!m) continue;
    parts.push({ inline_data: { data: m[2], mime_type: m[1] } });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    method: "POST",
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 500)}`);
  }
  interface GeminiResponse {
    candidates?: {
      content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] };
    }[];
  }
  const body = (await res.json()) as GeminiResponse;
  const imagePart = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!imagePart?.inlineData) {
    throw new Error("Gemini response contained no image data");
  }
  const outPath = join(dir, `${randomUUID()}.png`);
  await writeFile(outPath, Buffer.from(imagePart.inlineData.data, "base64"));
  return outPath;
}

async function mockBackend(_req: ImagegenRequest, dir: string): Promise<string> {
  // Write a tiny 1x1 transparent PNG so the rest of the pipeline can run
  // without network or an API key.
  const outPath = join(dir, `${randomUUID()}.png`);
  const blank = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  await writeFile(outPath, blank);
  return outPath;
}

export async function generate(req: ImagegenRequest): Promise<ImagegenResult> {
  const sessionDir = join(OUT_ROOT, randomUUID());
  await mkdir(sessionDir, { recursive: true });
  let outPath: string;
  switch (req.backend) {
    case "gemini":
      outPath = await gemini(req, sessionDir);
      break;
    case "mock":
      outPath = await mockBackend(req, sessionDir);
      break;
    default: {
      const _exhaustive: never = req.backend;
      throw new Error(`unknown backend: ${_exhaustive}`);
    }
  }
  // Use basename(), not split("/"): on Windows the separator is "\"
  // so split("/") would return the whole path as one segment.
  return { path: outPath, url: `/api/imagegen/file/${basename(outPath)}` };
}

export { OUT_ROOT };
