// Cache of raw Torob answers (offers, not computed stats), keyed by product title.
// Shared by the checker (index.js), the hosting server and the PC sync script.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = 2; // v1 stored already-filtered stats and wrongly dropped real prices
const FILE = path.join(ROOT, "cache", "torob.json");

// entries arriving over HTTP must look like real Torob answers
const validEntry = e =>
  e && e.v === VERSION && Number.isFinite(e.at) && (e.data === null ||
    (typeof e.data === "object" && typeof e.data.name === "string" && /^https:\/\/torob\.com\//.test(e.data.url) &&
      Array.isArray(e.data.offers) && e.data.offers.every(o => Number.isFinite(o?.price) && typeof o.shop === "string")));

export function openCache(ttlMs) {
  let entries = {};
  try { entries = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}
  for (const k of Object.keys(entries)) if (entries[k]?.v !== VERSION) delete entries[k];
  return {
    entries,
    fresh: title => { const e = entries[title]; return e && Date.now() - e.at < ttlMs ? e : null; },
    any: title => entries[title] ?? null,
    put: (title, data) => { entries[title] = { v: VERSION, at: Date.now(), data }; },
    /** Add newer entries from elsewhere (the PC sync); returns how many were taken. */
    merge(incoming) {
      let n = 0;
      for (const [title, e] of Object.entries(incoming || {})) {
        if (!validEntry(e) || (entries[title] && entries[title].at >= e.at)) continue;
        entries[title] = e;
        n++;
      }
      return n;
    },
    save() {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(entries));
    },
  };
}
