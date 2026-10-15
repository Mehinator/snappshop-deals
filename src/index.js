#!/usr/bin/env node
// SnappShop discounts, verified against Torob.
// usage: node src/index.js [--min 80] [--max 300] [--pages 100] [--torob-limit 20] [--torob-delay 8] [--cache-hours 24] [--no-open]
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { parseArgs } from "node:util";
import { getDiscountedProducts } from "./snappshop.js";
import { lookup, marketStats, setTorobDelay } from "./torob.js";
import { judge } from "./verdict.js";
import { buildReport } from "./report.js";
import { mapLimit } from "./http.js";
import { ROOT, openCache } from "./cache.js";

const { values: opt } = parseArgs({
  options: {
    min: { type: "string", default: "80" },
    max: { type: "string", default: "300" },
    pages: { type: "string", default: "100" },
    concurrency: { type: "string", default: "1" },
    "torob-delay": { type: "string", default: "8" },
    "torob-limit": { type: "string", default: "20" },
    "cache-hours": { type: "string", default: "24" },
    "no-open": { type: "boolean", default: false },
    site: { type: "string" },
  },
});
const minDiscount = Number(opt.min);
setTorobDelay(Number(opt["torob-delay"]) * 1000);
const log = msg => console.log(`[${new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Tehran" })}] ${msg}`);

// Torob answers are cached per title so re-runs are fast
const cache = openCache(Number(opt["cache-hours"]) * 3600e3);
const withStats = data => (data ? { ...data, ...marketStats(data.offers) } : null);
const freshHit = cache.fresh;

// Torob shows a captcha after a burst of requests, so each run asks it about only
// a limited number of new products; the rest come in later runs via the cache.
const torobLimit = Number(opt["torob-limit"]);
let newLookups = 0;

log(`Reading SnappShop products with discount >= ${minDiscount}% ...`);
let items = await getDiscountedProducts({ minDiscount, maxPages: Number(opt.pages), log });
items.sort((a, b) => b.discount - a.discount);
if (items.length > Number(opt.max)) {
  log(`${items.length} found, checking the top ${opt.max} (use --max to change)`);
  items = items.slice(0, Number(opt.max));
}
const cached = items.filter(i => freshHit(i.title)).length;
log(`${items.length} products: ${cached} already checked (cache), up to ${torobLimit} new ones will be asked from Torob this run`);

let blocked = false;
const rows = await mapLimit(items, Number(opt.concurrency), async item => {
  let torob = null;
  let error = null;
  const hit = freshHit(item.title);
  let needsTorob = !hit;
  if (hit) {
    torob = withStats(hit.data);
  } else if (blocked || newLookups >= torobLimit) {
    error = blocked ? "ترب موقتاً بلاک کرد؛ در اجرای بعدی بررسی می‌شود" : "در اجرای بعدی بررسی می‌شود";
    const stale = cache.any(item.title); // an older cached answer is better than nothing
    if (stale) { torob = withStats(stale.data); error = null; }
  } else {
    newLookups++;
    try {
      const data = await lookup(item.title);
      cache.put(item.title, data);
      torob = withStats(data);
      needsTorob = false;
    } catch (e) {
      error = e.blocked ? "ترب موقتاً بلاک کرد؛ در اجرای بعدی بررسی می‌شود" : "خطا در ترب: " + e.message.split("\n")[0];
      if (e.blocked) {
        blocked = true;
        log(`Torob is showing a captcha after ${newLookups} new lookups. Stopping Torob checks.`);
      }
    }
    if (newLookups % 5 === 0) { log(`Torob: ${newLookups} new lookups`); cache.save(); }
  }
  return { ...item, torob, needsTorob, ...judge(item, torob, error) };
});
// only write when we added something: on the server the PC sync may have
// merged newer entries into the file while this run was going
if (newLookups) cache.save();

rows.sort((a, b) => a.verdict.rank - b.verdict.rank || (b.realDiscount ?? -999) - (a.realDiscount ?? -999));

const stamp = new Date();
const name = `snappshop-${stamp.toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;
const outDir = path.join(ROOT, "reports");
fs.mkdirSync(outDir, { recursive: true });
const htmlPath = path.join(outDir, name + ".html");
const html = buildReport(rows, { minDiscount, createdAt: stamp.toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }) });
fs.writeFileSync(htmlPath, html);
fs.writeFileSync(path.join(outDir, name + ".json"), JSON.stringify(rows.map(r => ({ ...r, verdict: r.verdict.key })), null, 1));
if (opt.site) {
  // latest report as a static site, plus the products still waiting for a Torob check
  // (the PC sync asks the server for these)
  fs.mkdirSync(opt.site, { recursive: true });
  fs.writeFileSync(path.join(opt.site, "index.html"), html);
  const pending = items.filter(i => rows.find(r => r.id === i.id)?.needsTorob).map(i => ({ title: i.title, discount: i.discount }));
  fs.writeFileSync(path.join(opt.site, "pending.json"), JSON.stringify({ createdAt: stamp.toISOString(), pending }));
}

const count = k => rows.filter(r => r.verdict.key === k).length;
log(`Done. cheapest-in-market: ${count("best")}, cheaper-than-market: ${count("good")}, fake: ${count("fake")}, no Torob price: ${count("noprice")}, not found: ${count("notfound")}, unchecked: ${count("unchecked")}`);
if (count("unchecked")) log(`${count("unchecked")} items not checked yet. Run again later (e.g. in an hour); it continues where it stopped.`);
log(`Report: ${htmlPath}`);
if (!opt["no-open"]) exec(process.platform === "win32" ? `start "" "${htmlPath}"` : `xdg-open "${htmlPath}"`);
