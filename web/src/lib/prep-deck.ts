/**
 * HMM Prep deck builder.
 *
 * The "prep deck" is the user's actor + set library, exposed as Anki
 * cards so they can actively practice the mnemonic mapping itself —
 * "b- → Beyoncé", "-ang → Childhood Home", etc. — before sitting
 * down with the auto-generated hanzi deck.
 *
 * One card per filled slot:
 *   - INITIAL: front "<initial>-" + category hint, back actor name +
 *     portrait
 *   - FINAL: front "-<final>", back set name + exterior + per-tone room
 *     thumbnails
 */
import {
  addNotes,
  createDeck,
  deckFieldValues,
  storeMediaFile,
  type AnkiNote,
} from "../../../src/anki-connect";
import {
  FINALS,
  INITIALS,
  TONE_TO_ROOM,
  type Final,
  type Initial,
} from "../../../src/pinyin";
import type { ActorAssignment, SetAssignment } from "./store";

const PREP_DECK_NAME = "HMM Prep";

/**
 * Decode a `data:image/...;base64,...` URL into just the base64 body
 * (no prefix), which is what storeMediaFile expects.
 */
function dataUrlBase64(dataUrl: string): string | null {
  const m = /^data:[^;]+;base64,(.+)$/i.exec(dataUrl);
  return m ? m[1] : null;
}

async function uploadIfNeeded(
  filename: string,
  dataUrl: string | undefined,
): Promise<string | null> {
  if (!dataUrl) return null;
  const b64 = dataUrlBase64(dataUrl);
  if (!b64) return null;
  await storeMediaFile(filename, b64);
  return filename;
}

export interface PrepSyncResult {
  ok: boolean;
  added: number;
  skipped: number;
  errors: string[];
  log: string[];
}

interface SyncOpts {
  actors: Partial<Record<Initial, ActorAssignment>>;
  sets: Partial<Record<Final, SetAssignment>>;
  /**
   * When true, re-uploads media + re-creates the note for every slot
   * (used for forced refresh after the user changes images). When
   * false (default), only NEW slots get added — existing notes are
   * untouched so review schedules stay intact.
   */
  forceUpdate?: boolean;
}

export async function syncPrepDeck({ actors, sets, forceUpdate = false }: SyncOpts): Promise<PrepSyncResult> {
  const out: PrepSyncResult = { added: 0, errors: [], log: [], ok: false, skipped: 0 };

  try {
    await createDeck(PREP_DECK_NAME);
    out.log.push(`deck created/ensured: ${PREP_DECK_NAME}`);
  } catch (err) {
    out.errors.push(`createDeck failed: ${(err as Error).message}`);
    return out;
  }

  // Existing prep-card identifiers — the front field "HmmKey" doubles
  // as the dedup key. We store both initials and finals there with
  // a prefix so they can't collide.
  const existing = new Set<string>(
    await deckFieldValues(PREP_DECK_NAME, "HmmKey").catch(() => []),
  );
  out.log.push(`${existing.size} existing prep notes — will skip those`);

  const notes: AnkiNote[] = [];

  // Initials → one note each.
  for (const initial of INITIALS) {
    const a = actors[initial];
    if (!a?.name) continue;
    const key = `initial:${initial}`;
    if (existing.has(key) && !forceUpdate) { out.skipped++; continue; }
    // Multi-ref: show all photos on the prep card. Falls back to the
    // legacy singular `imageDataUrl` for older state that hasn't been
    // re-saved through the multi-ref dialog yet.
    const urls = (a.imageDataUrls && a.imageDataUrls.length > 0)
      ? a.imageDataUrls
      : (a.imageDataUrl ? [a.imageDataUrl] : []);
    const imageTags = await Promise.all(
      urls.map(async (url, idx) => {
        const filename = urls.length === 1
          ? `hmm-prep-actor-${initial}.jpg`
          : `hmm-prep-actor-${initial}-${idx + 1}.jpg`;
        return `<img src="${await uploadIfNeeded(filename, url)}" style="max-width: 320px">`;
      }),
    );
    const imageTag = imageTags.join("");
    notes.push({
      deckName: PREP_DECK_NAME,
      fields: {
        Back: `<div class="prep-actor"><strong>${a.name}</strong><div class="muted">${a.category}</div>${imageTag}</div>`,
        Category: a.category,
        Front: `${initial}-`,
        HmmKey: key,
        Name: a.name,
        SlotType: "actor",
      },
      modelName: "Basic",
      options: { allowDuplicate: false },
      tags: ["hmm-prep", "hmm-prep-actor", `initial:${initial}`],
    });
  }

  // Finals → one note each.
  for (const final of FINALS) {
    const s = sets[final];
    if (!s?.name) continue;
    const key = `final:${final}`;
    if (existing.has(key) && !forceUpdate) { out.skipped++; continue; }
    const exterior = s.exteriorDataUrl
      ? `<img src="${await uploadIfNeeded(`hmm-prep-set-${final}-exterior.jpg`, s.exteriorDataUrl)}" style="max-width: 320px">`
      : "";
    const roomsHtml: string[] = [];
    for (const t of [1, 2, 3, 4, 5] as const) {
      const roomUrl = s.rooms?.[t];
      if (roomUrl) {
        const fn = await uploadIfNeeded(`hmm-prep-set-${final}-tone${t}.jpg`, roomUrl);
        roomsHtml.push(
          `<div class="prep-room"><strong>Tone ${t}</strong> · ${TONE_TO_ROOM[t]}<br><img src="${fn}" style="max-width: 200px"></div>`,
        );
      } else {
        roomsHtml.push(
          `<div class="prep-room muted"><strong>Tone ${t}</strong> · ${TONE_TO_ROOM[t]} <em>(no photo)</em></div>`,
        );
      }
    }
    notes.push({
      deckName: PREP_DECK_NAME,
      fields: {
        Back: `<div class="prep-set"><strong>${s.name}</strong>${exterior}<div class="prep-rooms">${roomsHtml.join("")}</div></div>`,
        Front: `-${final}`,
        HmmKey: key,
        Name: s.name,
        SlotType: "set",
      },
      modelName: "Basic",
      options: { allowDuplicate: false },
      tags: ["hmm-prep", "hmm-prep-set", `final:${final}`],
    });
  }

  if (notes.length === 0) {
    out.log.push("no new slots to push");
    out.ok = true;
    return out;
  }

  try {
    const result = await addNotes(notes);
    for (const id of result) {
      if (id !== null) out.added++;
      else out.skipped++;
    }
    out.log.push(`pushed ${out.added} new prep notes (${out.skipped} skipped)`);
    out.ok = true;
  } catch (err) {
    out.errors.push(`addNotes failed: ${(err as Error).message}`);
  }

  return out;
}
