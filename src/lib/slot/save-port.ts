import { formatMoney } from "./format.ts";
import { readLocalSave, sanitizePlayerSave, writeLocalSave, type PlayerSave } from "./player-save.ts";
import { standing } from "./ranks.ts";

/** First line of an exported save. The rest is the save as base64, so chat apps do not eat quotes. */
export const SAVE_PORT_MARK = "PARKIZMUS1";
export const SAVE_PORT_FILE = "parkizmus-ulozene.txt";
export const NOTICE_KEY = "park-save-notice";

const MAX_CHARS = 80_000;

export type UnpackResult = { ok: true; save: PlayerSave } | { ok: false; error: string };

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64.replace(/\s+/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** Reject anything that is not an actual player save. sanitize() would otherwise invent a fresh start. */
function accept(raw: unknown): PlayerSave | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const body = rec.parkizmus === 1 ? rec.save : rec;
  const inner = asRecord(body);
  if (!inner) return null;
  if (typeof inner.balance !== "number" || !Number.isFinite(inner.balance)) return null;
  if (typeof inner.updatedAt !== "number" || !Number.isFinite(inner.updatedAt)) return null;
  if (typeof inner.playerId !== "string" || inner.playerId.length < 8 || inner.playerId.length > 64) return null;
  return sanitizePlayerSave(inner);
}

export function packSave(save: PlayerSave): string {
  return `${SAVE_PORT_MARK}\n${bytesToB64(new TextEncoder().encode(JSON.stringify(save)))}`;
}

export function unpackSave(text: string): UnpackResult {
  const raw = text.trim();
  if (!raw) return { ok: false, error: "Vlož kód alebo vyber súbor." };
  if (raw.length > MAX_CHARS) return { ok: false, error: "Súbor je priveľký. Toto nie je uloženie hry." };
  let json = raw;
  if (raw.startsWith(SAVE_PORT_MARK)) {
    const bytes = b64ToBytes(raw.slice(SAVE_PORT_MARK.length));
    if (!bytes) return { ok: false, error: "Kód je poškodený. Skopíruj ho znova celý." };
    json = new TextDecoder().decode(bytes);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "Toto nie je uloženie hry. Skopíruj celý kód z EXPORTU." };
  }
  const save = accept(parsed);
  if (!save) return { ok: false, error: "V kóde chýba kredit alebo hráč. Skopíruj EXPORT znova." };
  return { ok: true, save };
}

export function saveGlance(save: PlayerSave): string {
  const rank = standing(save.rp);
  const label = rank.roman ? `${rank.name} ${rank.roman}` : rank.name;
  const when =
    save.updatedAt > 0
      ? new Date(save.updatedAt).toLocaleString("sk-SK", {
          day: "numeric",
          month: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "ešte nehrané";
  const ticket = save.job?.title ? `lístok: ${save.job.title.slice(0, 28)}` : "bez lístka";
  const live = save.inFs || Boolean(save.bonusPending) || save.chaseSpin >= 0;
  return `Kredit ${formatMoney(save.balance)} · ${label} · ${ticket} · ${live ? "rozohratá hra" : "nič rozohraté"} · ${when}`;
}

/** Fill a missing player id from the running game so an export can be imported on the other link. */
export function saveForExport(playerId: string): PlayerSave | null {
  const save = readLocalSave();
  if (!save) return null;
  if (save.playerId.length >= 8) return save;
  const id = playerId.trim();
  if (id.length < 8 || id.length > 64) return null;
  const next = { ...save, playerId: id };
  writeLocalSave(next);
  return next;
}

export function noticeDismissed(): boolean {
  try {
    return localStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    return true;
  }
}

export function dismissNotice(): void {
  try {
    localStorage.setItem(NOTICE_KEY, "1");
  } catch {
    /* private mode */
  }
}
