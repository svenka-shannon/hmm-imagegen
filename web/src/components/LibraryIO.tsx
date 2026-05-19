/**
 * Library export / import controls.
 *
 * The on-wire format is a **zip bundle** ("hmm-library.zip"):
 *   manifest.json         — schemaVersion + actor/set shape with image
 *                           fields replaced by filename pointers
 *   images/<filename>.png — the actual image bytes (binary, not base64)
 *
 * Why zip instead of inlined-base64 JSON: ~95 images × ~100KB each
 * blows up to ~13MB when base64-encoded inside JSON. The same images
 * binary inside a zip are ~9MB and parse instantly. Also lets you peek
 * at individual images without unpacking 13MB of base64.
 *
 * Back-compat: import auto-detects .json (legacy v1 schema with
 * inlined data URLs) vs .zip (v2 bundle). Export always writes v2.
 */
import JSZip from "jszip";
import { useRef, useState } from "react";
import { useActors, useSets, type ActorAssignment, type SetAssignment } from "../lib/store";
import type { Final, Initial } from "../../../src/pinyin";

interface ManifestActor {
  category?: ActorAssignment["category"];
  name?: string;
  /** Path inside the zip, e.g. "images/actor-b.png". Empty if no image. */
  imageFile?: string;
}
interface ManifestSet {
  name?: string;
  rooms?: Partial<Record<1 | 2 | 3 | 4 | 5, string>>; // tone → path
  exteriorFile?: string;
}
interface Manifest {
  schemaVersion: 2;
  exportedAt: string;
  actors: Partial<Record<Initial, ManifestActor>>;
  sets: Partial<Record<Final, ManifestSet>>;
}

/** "data:image/png;base64,..." → bytes + extension for the zip. */
function dataUrlToBlob(dataUrl: string): { bytes: Uint8Array; ext: string } | null {
  const m = /^data:image\/([a-z0-9+]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, ext: m[1] === "jpeg" ? "jpg" : m[1] };
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export function LibraryIO() {
  const { actors, setActor } = useActors();
  const { sets, setSet } = useSets();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportLibrary() {
    setBusy(true);
    try {
      const zip = new JSZip();
      const images = zip.folder("images")!;

      const manifest: Manifest = {
        actors: {},
        exportedAt: new Date().toISOString(),
        schemaVersion: 2,
        sets: {},
      };

      for (const [initial, a] of Object.entries(actors)) {
        if (!a?.name) continue;
        const m: ManifestActor = { category: a.category, name: a.name };
        if (a.imageDataUrl) {
          const blob = dataUrlToBlob(a.imageDataUrl);
          if (blob) {
            const path = `images/actor-${initial}.${blob.ext}`;
            images.file(path.replace(/^images\//, ""), blob.bytes);
            m.imageFile = path;
          }
        }
        manifest.actors[initial as Initial] = m;
      }
      for (const [final, s] of Object.entries(sets)) {
        if (!s?.name) continue;
        const m: ManifestSet = { name: s.name, rooms: {} };
        if (s.exteriorDataUrl) {
          const blob = dataUrlToBlob(s.exteriorDataUrl);
          if (blob) {
            const path = `images/set-${final}-ext.${blob.ext}`;
            images.file(path.replace(/^images\//, ""), blob.bytes);
            m.exteriorFile = path;
          }
        }
        for (const [tone, url] of Object.entries(s.rooms ?? {})) {
          if (!url) continue;
          const blob = dataUrlToBlob(url);
          if (!blob) continue;
          const path = `images/set-${final}-tone${tone}.${blob.ext}`;
          images.file(path.replace(/^images\//, ""), blob.bytes);
          m.rooms![Number(tone) as 1 | 2 | 3 | 4 | 5] = path;
        }
        manifest.sets[final as Final] = m;
      }
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));

      const blob = await zip.generateAsync({ compression: "DEFLATE", type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hmm-library-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  async function importLibrary(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      let actorCount = 0;
      let setCount = 0;
      if (file.name.toLowerCase().endsWith(".zip")) {
        const zip = await JSZip.loadAsync(file);
        const manifestFile = zip.file("manifest.json");
        if (!manifestFile) throw new Error("zip missing manifest.json");
        const manifest = JSON.parse(await manifestFile.async("string")) as Manifest;
        if (manifest.schemaVersion !== 2) {
          throw new Error(`unsupported schemaVersion: ${manifest.schemaVersion}`);
        }
        async function readImage(path: string | undefined): Promise<string | undefined> {
          if (!path) return undefined;
          const f = zip.file(path);
          if (!f) return undefined;
          const blob = await f.async("blob");
          return blobToDataUrl(blob);
        }
        for (const [initial, m] of Object.entries(manifest.actors)) {
          if (!m?.name) continue;
          const imageDataUrl = await readImage(m.imageFile);
          setActor(initial as Initial, {
            category: m.category ?? "man",
            imageDataUrl,
            name: m.name,
          });
          actorCount++;
        }
        for (const [final, m] of Object.entries(manifest.sets)) {
          if (!m?.name) continue;
          const exteriorDataUrl = await readImage(m.exteriorFile);
          const rooms: Partial<Record<1 | 2 | 3 | 4 | 5, string>> = {};
          for (const [tone, path] of Object.entries(m.rooms ?? {})) {
            const url = await readImage(path);
            if (url) rooms[Number(tone) as 1 | 2 | 3 | 4 | 5] = url;
          }
          setSet(final as Final, { exteriorDataUrl, name: m.name, rooms });
          setCount++;
        }
      } else {
        // Legacy v1 (inlined-base64) — keep importable for older backups.
        const text = await file.text();
        const payload = JSON.parse(text) as {
          schemaVersion?: number;
          actors?: Partial<Record<Initial, ActorAssignment>>;
          sets?: Partial<Record<Final, SetAssignment>>;
        };
        if (payload.schemaVersion !== 1) {
          throw new Error(`unsupported schemaVersion: ${payload.schemaVersion ?? "?"}`);
        }
        for (const [initial, a] of Object.entries(payload.actors ?? {})) {
          if (a?.name) { setActor(initial as Initial, a); actorCount++; }
        }
        for (const [final, s] of Object.entries(payload.sets ?? {})) {
          if (s?.name) { setSet(final as Final, s); setCount++; }
        }
      }
      setImportMsg(`Imported ${actorCount} actors + ${setCount} sets`);
    } catch (err) {
      setImportMsg(`Import failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      e.target.value = ""; // reset so re-selecting the same file fires onChange
    }
  }

  return (
    <div className="library-io">
      <button onClick={() => void exportLibrary()} disabled={busy} data-testid="library-export">
        Export library (.zip)
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        data-testid="library-import"
      >
        Import library (.zip or .json)
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip,application/json,.json"
        onChange={(e) => void importLibrary(e)}
        style={{ display: "none" }}
        data-testid="library-import-input"
      />
      {importMsg && <span className="library-io-msg">{importMsg}</span>}
    </div>
  );
}
