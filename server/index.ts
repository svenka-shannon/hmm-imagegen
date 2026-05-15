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

const PORT = Number(process.env.PORT ?? 4400);

const server = Bun.serve({
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", uptime: process.uptime() });
    }
    if (url.pathname === "/api/source/lists") {
      return Response.json({
        lists: [
          { id: "top-freq", label: "Top-N by frequency", count: 3000 },
          { id: "heisig-rth", label: "Heisig RTH 1-3000", count: 3000 },
        ],
      });
    }
    return new Response("Not found", { status: 404 });
  },
  port: PORT,
});

console.log(`[hmm-server] listening on http://localhost:${server.port}`);
