// Fuzzy matching of a SnappShop product title against Torob product names.

const CHAR_MAP = { "ي": "ی", "ى": "ی", "ئ": "ی", "ك": "ک", "ة": "ه", "ۀ": "ه", "أ": "ا", "إ": "ا", "ٱ": "ا", "ؤ": "و" };

export function normalize(s) {
  return String(s || "")
    .replace(/[يىئكةۀأإٱؤ]/g, c => CHAR_MAP[c])
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
    .replace(/[ً-ٰٟـ]/g, "") // diacritics, tatweel
    .replace(/٫/g, ".")
    .replace(/[٬,]/g, " ")
    .replace(/‌|‏|‎/g, " ") // ZWNJ & direction marks
    .replace(/[%٪]/g, " درصد ")
    .toLowerCase();
}

const STOP = new Set([
  "و", "با", "در", "از", "به", "برای", "مدل", "طرح", "کد", "سری", "نوع", "رنگ", "وزن", "حجم", "بسته", "مجموعه", "سایز",
  "اورجینال", "اصل", "اصلی", "جدید", "ظرفیت", "the", "and", "with", "for", "model", "-", "+", "/",
]);

// unit word -> [dimension, multiplier]
const UNITS = {
  "گرم": ["g", 1], "گرمی": ["g", 1], "گ": ["g", 1], "gr": ["g", 1], "g": ["g", 1],
  "کیلوگرم": ["g", 1000], "کیلوگرمی": ["g", 1000], "کیلو": ["g", 1000], "kg": ["g", 1000],
  "میلیلیتر": ["ml", 1], "میلیلیتری": ["ml", 1], "ml": ["ml", 1], "سیسی": ["ml", 1], "cc": ["ml", 1],
  "لیتر": ["ml", 1000], "لیتری": ["ml", 1000], "l": ["ml", 1000],
  "عدد": ["n", 1], "عددی": ["n", 1], "تایی": ["n", 1], "پارچه": ["piece", 1], "تکه": ["piece", 1],
  "اینچ": ["inch", 1], "inch": ["inch", 1],
  "گیگابایت": ["gb", 1], "gb": ["gb", 1], "ترابایت": ["gb", 1024], "tb": ["gb", 1024], "مگابایت": ["mb", 1], "mb": ["mb", 1],
  "وات": ["w", 1], "w": ["w", 1], "میلیآمپر": ["mah", 1], "mah": ["mah", 1],
  "متر": ["m", 1], "متری": ["m", 1], "سانتیمتر": ["m", 0.01], "سانتی": ["m", 0.01], "cm": ["m", 0.01],
  "عیار": ["karat", 1], "نفره": ["person", 1], "شعله": ["flame", 1], "پله": ["step", 1],
};

/** Parse a normalized title into word tokens, numeric quantities, and model codes. */
export function analyze(title) {
  let s = normalize(title)
    .replace(/میلی\s*لیتر/g, "میلیلیتر")
    .replace(/سی\s*سی/g, "سیسی")
    .replace(/میلی\s*آمپر/g, "میلیآمپر")
    .replace(/سانتی\s*متر/g, "سانتیمتر")
    .replace(/کیلو\s*گرم/g, "کیلوگرم");

  // model codes like ME-ECM2049, VG279QM1A, GA-2100: latin letters mixed with digits
  const codes = new Set();
  for (const m of s.matchAll(/[a-z0-9]+(?:[-_./][a-z0-9]+)*/g)) {
    const c = m[0].replace(/[-_./]/g, "");
    if (/[a-z]/.test(c) && /\d/.test(c) && c.length >= 3) codes.add(c);
  }

  s = s.replace(/(\d)([^\d\s.])/g, "$1 $2").replace(/([^\d\s.])(\d)/g, "$1 $2");
  const raw = s.split(/[^\p{L}\p{N}.]+/u).map(t => t.replace(/^\.+|\.+$/g, "")).filter(Boolean);

  const quantities = [];
  const tokens = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (/^\d+(\.\d+)?$/.test(t) && UNITS[raw[i + 1]]) {
      const [dim, mult] = UNITS[raw[i + 1]];
      quantities.push({ dim, value: +(parseFloat(t) * mult).toFixed(3) });
      i++;
      continue;
    }
    if (UNITS[t] || STOP.has(t)) continue;
    if (t.length < 2 && !/\d/.test(t)) continue;
    tokens.push(t);
  }
  return { tokens: [...new Set(tokens)], quantities, codes: [...codes], compact: normalize(title).replace(/[^a-z0-9]/g, "") };
}

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function tokenMatches(t, set, compact) {
  if (set.has(t)) return true;
  if (t.length >= 3 && compact.includes(t)) return true; // ادوتویلت vs «ادو تویلت»
  for (const u of set) {
    if (t.length >= 4 && u.length >= 4 && (u.startsWith(t) || t.startsWith(u))) return true;
    if (t.length >= 4 && lev(t, u) <= 1) return true; // چسبدار/چسپدار
  }
  return false;
}

/**
 * Score how well a Torob name matches the SnappShop title (0..1), or 0 when
 * a model code or a quantity (weight, volume, count, size...) contradicts.
 */
export function matchScore(snapp, torobName) {
  const a = typeof snapp === "string" ? analyze(snapp) : snapp;
  const b = analyze(torobName);

  for (const code of a.codes) if (!b.compact.includes(code)) return 0;

  for (const q of a.quantities) {
    const same = b.quantities.filter(x => x.dim === q.dim);
    if (same.length && !same.some(x => Math.abs(x.value - q.value) <= q.value * 0.01)) return 0;
  }

  if (!a.tokens.length) return 0;
  const aset = new Set(a.tokens);
  const bset = new Set(b.tokens);
  const aCompact = a.tokens.join("");
  const bCompact = b.tokens.join("");
  const missingInB = a.tokens.filter(t => !tokenMatches(t, bset, bCompact));
  const extraInB = b.tokens.filter(t => !tokenMatches(t, aset, aCompact));
  const recall = (a.tokens.length - missingInB.length) / a.tokens.length;
  const precision = b.tokens.length ? (b.tokens.length - extraInB.length) / b.tokens.length : 0;
  let score = 0.8 * recall + 0.2 * precision;
  // a word on each side that the other lacks usually means a swapped brand/model (فلورمار vs آلپین)
  const isWord = t => t.length >= 3 && !/^\d+(\.\d+)?$/.test(t);
  if (missingInB.some(isWord) && extraInB.some(isWord)) score -= 0.35;
  return Math.max(0, score);
}
