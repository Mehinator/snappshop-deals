// Decide whether a SnappShop discount is real, based on Torob market prices.

export const VERDICTS = {
  best: { key: "best", label: "ارزان‌ترین بازار", color: "#16a34a", rank: 0 },
  good: { key: "good", label: "ارزان‌تر از بازار", color: "#65a30d", rank: 1 },
  fake: { key: "fake", label: "تخفیف ساختگی", color: "#dc2626", rank: 3 },
  noprice: { key: "noprice", label: "قیمتی در ترب نیست", color: "#6b7280", rank: 4 },
  notfound: { key: "notfound", label: "در ترب پیدا نشد", color: "#6b7280", rank: 5 },
  unchecked: { key: "unchecked", label: "بررسی نشد", color: "#9ca3af", rank: 6 },
};

export function judge(item, torob, error) {
  if (error) return { verdict: VERDICTS.unchecked, notes: [error] };
  if (!torob) return { verdict: VERDICTS.notfound, notes: [] };
  if (!torob.median) return { verdict: VERDICTS.noprice, notes: [] };

  const notes = [];
  const realDiscount = Math.round((1 - item.finalPrice / torob.median) * 100);
  const inflation = item.price / torob.median;
  if (inflation >= 1.3) notes.push(`«قیمت قبل» ${inflation.toFixed(1)} برابر قیمت بازار است`);
  if (item.finalPrice < torob.median * 0.4) notes.push("خیلی ارزان‌تر از بازار؛ شاید کالا اصل نیست (تستر/طرح) یا با کالای ترب فرق دارد، دستی چک کنید");
  if (torob.shopCount < 2) notes.push("فقط یک فروشگاه در ترب");
  if (torob.score < 0.75) notes.push("تطبیق اسم تقریبی است");
  for (const o of torob.dropped || [])
    notes.push(`قیمت ${o.price.toLocaleString("fa-IR")} تومان (${o.shop}) در ترب خیلی پرت بود و حساب نشد`);

  const verdict = item.finalPrice <= torob.min ? VERDICTS.best : item.finalPrice < torob.median ? VERDICTS.good : VERDICTS.fake;
  return { verdict, realDiscount, inflation, notes };
}
