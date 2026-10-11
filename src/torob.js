import { fetchJson } from "./http.js";
import { analyze, matchScore } from "./match.js";

const SEARCH = "https://api.torob.com/v4/base-product/search/";
const SNAPPSHOP_SHOP_ID = 32263; // «اسنپ شاپ» on Torob — excluded from the market reference
const MIN_SCORE = 0.6;

// be gentle with Torob: one request at a time with a pause in between
// (2.5s still got a captcha after ~50 requests)
let gapMs = 8000;
export const setTorobDelay = ms => { gapMs = ms; };
let lastCall = 0;
async function torobGet(url) {
  const wait = lastCall + gapMs - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCall = Date.now();
  return fetchJson(url, { retries: 2 });
}

const median = a => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/**
 * Market numbers from raw Torob offers. Only absurd listings (accessories,
 * deposits, typos — e.g. 185,000 for a 67M printer) are left out, and they are
 * reported back; ordinary price spread between shops (880k vs 3M) is kept.
 */
export function marketStats(offers) {
  const all = offers.map(o => o.price);
  const ref = all.length > 2 ? median(all) : Math.max(...all, 0);
  const kept = offers.filter(o => o.price >= ref * 0.15 && o.price <= ref * 7);
  const dropped = offers.filter(o => !kept.includes(o));
  const prices = kept.map(o => o.price);
  return {
    shopCount: kept.length,
    min: prices.length ? Math.min(...prices) : null,
    median: prices.length ? median(prices) : null,
    cheapestShop: prices.length ? [...kept].sort((x, y) => x.price - y.price)[0].shop : null,
    dropped,
  };
}

/**
 * Find the SnappShop product on Torob and collect other shops' current prices
 * (raw offers; see marketStats). Returns null when no confident match exists.
 */
export async function lookup(title) {
  const u = new URL(SEARCH);
  for (const [k, v] of Object.entries({ page: 0, size: 24, sort: "popularity", q: title, source: "next_desktop" })) u.searchParams.set(k, v);
  const res = await torobGet(u);

  const a = analyze(title);
  const ranked = (res.results || [])
    .map(r => ({ r, score: matchScore(a, `${r.name1} ${r.name2 || ""}`) }))
    .filter(x => x.score >= MIN_SCORE)
    .sort((x, y) => y.score - x.score);
  if (!ranked.length) return null;

  const best = ranked.slice(0, 1);
  const offers = new Map();
  let snappOffer = null;
  for (const { r } of best) {
    const d = await torobGet(r.more_info_url);
    for (const o of d.products_info?.result || []) {
      if (!o.availability || !(o.price > 0) || o.is_price_unreliable) continue;
      if (o.shop_id === SNAPPSHOP_SHOP_ID) { snappOffer ??= o.price; continue; }
      offers.set(`${o.shop_id}:${o.price}`, { shop: o.shop_name, city: o.shop_name2, price: o.price });
    }
  }

  const top = best[0];
  return {
    name: top.r.name1,
    url: "https://torob.com" + top.r.web_client_absolute_url,
    score: +top.score.toFixed(2),
    offers: [...offers.values()],
    snappOnTorob: snappOffer,
  };
}
