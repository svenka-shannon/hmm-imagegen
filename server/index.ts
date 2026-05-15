/**
 * hmm-imagegen backend stub.
 *
 * v0 of the wizard is fully client-side (localStorage + AnkiConnect to
 * localhost). This server exists for the deck-generation step which
 * will need to:
 *   1. proxy image-gen API calls so the user's API key never leaves
 *      their box (or simply: not bake the user's key into the SPA bundle)
 *   2. cache generated images on disk
 *   3. expose ready-made source lists (frequency / Heisig) at /api/source
 *
 * For now it just serves /health so the SPA can show "backend ok".
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { generate, OUT_ROOT, type ImagegenRequest } from "./imagegen";

const PORT = Number(process.env.PORT ?? 4400);

// Server-side library storage. Survives browser clears + provides
// cross-device sync. The image data URLs are large (~100KB each) so
// keeping them off localStorage is also a quota win.
const DATA_DIR = process.env.HMM_DATA_DIR ?? join(import.meta.dir, "../data/uploads");
const LIBRARY_PATH = join(DATA_DIR, "library.json");

interface Library {
  actors?: Record<string, unknown>;
  sets?: Record<string, unknown>;
  updatedAt?: string;
}

async function readLibrary(): Promise<Library> {
  try {
    const raw = await readFile(LIBRARY_PATH, "utf8");
    return JSON.parse(raw) as Library;
  } catch {
    return {};
  }
}
async function writeLibrary(lib: Library): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(LIBRARY_PATH, JSON.stringify({ ...lib, updatedAt: new Date().toISOString() }, null, 2));
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const server = Bun.serve({
  async fetch(req): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: CORS, status: 204 });
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", uptime: process.uptime() }, { headers: CORS });
    }

    // Library persistence (server-side mirror of the SPA's actor + set
    // library so it survives browser clears + works cross-device).
    if (url.pathname === "/api/library") {
      if (req.method === "GET") {
        const lib = await readLibrary();
        return Response.json(lib, { headers: CORS });
      }
      if (req.method === "POST" || req.method === "PUT") {
        try {
          const body = (await req.json()) as Library;
          await writeLibrary(body);
          return Response.json({ ok: true }, { headers: CORS });
        } catch (err) {
          return Response.json({ error: (err as Error).message }, { headers: CORS, status: 400 });
        }
      }
    }
    if (url.pathname === "/api/source/lists") {
      return Response.json(
        {
          lists: [
            { id: "top-freq", label: "Top-N by frequency", count: 3000 },
            { id: "heisig-rth", label: "Heisig RTH 1-3000", count: 3000 },
          ],
        },
        { headers: CORS },
      );
    }

    // POST /api/imagegen/scene — generate an image for a scene prompt.
    if (req.method === "POST" && url.pathname === "/api/imagegen/scene") {
      try {
        const body = (await req.json()) as ImagegenRequest;
        const result = await generate(body);
        return Response.json(result, { headers: CORS });
      } catch (err) {
        return Response.json(
          { error: (err as Error).message },
          { headers: CORS, status: 500 },
        );
      }
    }

    // GET /api/imagegen/file/<filename> — serve a generated image back.
    if (req.method === "GET" && url.pathname.startsWith("/api/imagegen/file/")) {
      // Walk OUT_ROOT to find the file (it's nested under a session UUID).
      const filename = url.pathname.replace("/api/imagegen/file/", "");
      // Defence: no path traversal.
      if (filename.includes("/") || filename.includes("..")) {
        return new Response("Bad request", { headers: CORS, status: 400 });
      }
      // Look up by walking session dirs.
      const fs = await import("node:fs/promises");
      const sessions = await fs.readdir(OUT_ROOT).catch(() => [] as string[]);
      for (const s of sessions) {
        const candidate = join(OUT_ROOT, s, filename);
        if (existsSync(candidate)) {
          const data = await readFile(candidate);
          return new Response(data, {
            headers: { ...CORS, "Cache-Control": "public, max-age=86400", "Content-Type": "image/png" },
          });
        }
      }
      return new Response("Not found", { headers: CORS, status: 404 });
    }

    return new Response("Not found", { headers: CORS, status: 404 });
  },
  port: PORT,
});

console.log(`[hmm-server] listening on http://localhost:${server.port}`);
