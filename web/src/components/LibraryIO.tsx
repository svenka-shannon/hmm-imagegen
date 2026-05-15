/**
 * Library export / import controls.
 *
 * Lets the user download the full actor + set library as a JSON file
 * (including base64 image data URLs) and restore it elsewhere.
 *
 * Use cases:
 *   - Back up before making risky changes
 *   - Share the library across machines without running the server
 *   - Recover if the server's library.json is lost
 */
import { useRef, useState } from "react";
import { useActors, useSets, type ActorAssignment, type SetAssignment } from "../lib/store";
import type { Final, Initial } from "../../../src/pinyin";

export function LibraryIO() {
  const { actors, setActor } = useActors();
  const { sets, setSet } = useSets();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  function exportLibrary() {
    const payload = {
      actors,
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      sets,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hmm-library-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importLibrary(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const payload = JSON.parse(reader.result as string) as {
          schemaVersion?: number;
          actors?: Partial<Record<Initial, ActorAssignment>>;
          sets?: Partial<Record<Final, SetAssignment>>;
        };
        if (payload.schemaVersion !== 1) {
          throw new Error(`unsupported schemaVersion: ${payload.schemaVersion ?? "?"}`);
        }
        let actorCount = 0;
        let setCount = 0;
        for (const [initial, a] of Object.entries(payload.actors ?? {})) {
          if (a?.name) {
            setActor(initial as Initial, a);
            actorCount++;
          }
        }
        for (const [final, s] of Object.entries(payload.sets ?? {})) {
          if (s?.name) {
            setSet(final as Final, s);
            setCount++;
          }
        }
        setImportMsg(`Imported ${actorCount} actors + ${setCount} sets`);
      } catch (err) {
        setImportMsg(`Import failed: ${(err as Error).message}`);
      } finally {
        e.target.value = ""; // reset so re-selecting the same file fires onChange
      }
    });
    reader.readAsText(file);
  }

  return (
    <div className="library-io">
      <button onClick={exportLibrary} data-testid="library-export">
        Export library (JSON)
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        data-testid="library-import"
      >
        Import library (JSON)
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={importLibrary}
        style={{ display: "none" }}
        data-testid="library-import-input"
      />
      {importMsg && <span className="library-io-msg">{importMsg}</span>}
    </div>
  );
}
