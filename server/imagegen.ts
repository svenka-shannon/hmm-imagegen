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
import { join } from "node:path";
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

/** Decode a `data:image/...;base64,...` URL to a temp file. Returns its path. */
async function dataUrlToFile(dataUrl: string, dir: string): Promise<string> {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error("not a base64 data URL");
  const mime = m[1];
  const ext = mime.split("/")[1] ?? "bin";
  const path = join(dir, `${randomUUID()}.${ext}`);
  await writeFile(path, Buffer.from(m[2], "base64"));
  return path;
}

async function gemini(req: ImagegenRequest, dir: string): Promise<string> {
  const apiKey = req.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  // Shell out to the local nano-banana CLI (uv-run python).
  // This keeps the dependency out of bun's package graph + matches the
  // existing dev-time path.
  const outPath = join(dir, `${randomUUID()}.png`);
  const cli = `${process.env.HOME}/.claude/skills/nano-banana/scripts/nano-banana`;
  const args: string[] = [req.prompt, "-o", outPath];
  if (req.model) args.push("--model", req.model);
  // Save refs as temp files and pass as -i flags.
  for (const ref of req.refs ?? []) {
    if (ref.startsWith("data:")) {
      const p = await dataUrlToFile(ref, dir);
      args.push("-i", p);
    } else if (/^https?:\/\//i.test(ref)) {
      // The CLI accepts file paths; web URLs aren't supported directly.
      // Skip silently for v1 — refs should be data URLs from the wizard.
    }
  }
  const proc = Bun.spawn([cli, ...args], {
    env: { ...process.env, GEMINI_API_KEY: apiKey },
    stderr: "pipe",
    stdout: "pipe",
  });
  const exit = await proc.exited;
  if (exit !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`nano-banana failed (${exit}): ${err}`);
  }
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
  const filename = outPath.split("/").pop()!;
  return { path: outPath, url: `/api/imagegen/file/${filename}` };
}

export { OUT_ROOT };
