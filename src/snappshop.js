import { fetchJson } from "./http.js";

const API = "https://apix.snappshop.ir/search/v1";
const SITE = "https://snappshop.ir";
const SORT_MOST_DISCOUNT = "5DzQq4"; // «بیشترین تخفیف»
// the API refuses requests without a location; this is the site's own default (Tehran)
const LAT = 35.77331;
const LNG = 51.418591;

async function fetchPage(skip, limit) {
  const json = await fetchJson(`${API}?lat=${LAT}&lng=${LNG}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: SITE, Referer: SITE + "/" },
    body: { has_discount: true, is_available: true, sort: SORT_MOST_DISCOUNT, limit, skip },
  });
  const plp = json?.data?.structure?.find(s => s.section_type === "plp");
  return { items: plp?.items ?? [], totalPages: plp?.pagination?.total_pages ?? 0 };
}

/**
 * Discounted, in-stock SnappShop products with discount >= minDiscount.
 * The "most discount" sort is only roughly ordered, so we keep paging until
 * several pages in a row contain nothing above the threshold.
 */
export async function getDiscountedProducts({ minDiscount, maxPages = 100, pageSize = 100, log = () => {} }) {
  const byId = new Map();
  let emptyStreak = 0;
  for (let skip = 0; skip < maxPages; skip++) {
    const { items, totalPages } = await fetchPage(skip, pageSize);
    let hits = 0;
    for (const it of items) {
      const p = it.price ?? {};
      if (!p.discounted_price || !p.price || (p.discount ?? 0) < minDiscount || it.is_fake) continue;
      hits++;
      byId.set(it.id, {
        id: it.id,
        title: it.title.trim(),
        price: p.price,
        finalPrice: p.discounted_price,
        discount: p.discount,
        discountEnds: p.end_at || "",
        url: SITE + it.href,
        image: it.image?.src || "",
      });
    }
    log(`snappshop page ${skip + 1}: ${items.length} items, ${hits} with >= ${minDiscount}%`);
    emptyStreak = hits ? 0 : emptyStreak + 1;
    if (!items.length || skip + 1 >= totalPages || emptyStreak >= 5) break;
  }
  return [...byId.values()];
}
