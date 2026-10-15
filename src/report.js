import { VERDICTS } from "./verdict.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = n => (n == null ? "—" : Number(n).toLocaleString("fa-IR"));
const pct = n => (n == null ? "—" : `${n.toLocaleString("fa-IR")}٪`);

export function buildReport(rows, { minDiscount, createdAt }) {
  const counts = Object.fromEntries(Object.keys(VERDICTS).map(k => [k, rows.filter(r => r.verdict.key === k).length]));

  const trs = rows.map(r => `
    <tr data-v="${r.verdict.key}" data-claimed="${r.discount}" data-real="${r.realDiscount ?? -999}" data-final="${r.finalPrice}">
      <td class="img">${r.image ? `<img loading="lazy" src="${esc(r.image)}" alt="">` : ""}</td>
      <td class="title"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>
        <div class="sub">${r.torob ? `ترب: <a href="${esc(r.torob.url)}" target="_blank" rel="noopener">${esc(r.torob.name)}</a> · ` : ""}<a href="https://torob.com/search/?query=${encodeURIComponent(r.title)}" target="_blank" rel="noopener">جستجو در ترب</a></div>
        ${r.notes?.length ? `<div class="notes">${r.notes.map(esc).join(" · ")}</div>` : ""}</td>
      <td><span class="badge" style="background:${r.verdict.color}">${r.verdict.label}</span></td>
      <td class="num">${pct(r.discount)}</td>
      <td class="num strong ${r.realDiscount > 0 ? "pos" : r.realDiscount != null ? "neg" : ""}">${pct(r.realDiscount)}</td>
      <td class="num"><s>${fmt(r.price)}</s><br><b>${fmt(r.finalPrice)}</b></td>
      <td class="num">${fmt(r.torob?.min)}${r.torob?.cheapestShop ? `<div class="sub">${esc(r.torob.cheapestShop)}</div>` : ""}</td>
      <td class="num">${fmt(r.torob?.median)}${r.torob ? `<div class="sub">${fmt(r.torob.shopCount)} فروشگاه</div>` : ""}</td>
    </tr>`).join("");

  const chips = Object.values(VERDICTS)
    .map(v => `<label class="chip"><input type="checkbox" value="${v.key}" ${["notfound", "noprice"].includes(v.key) ? "" : "checked"}> <span class="dot" style="background:${v.color}"></span>${v.label} (${fmt(counts[v.key])})</label>`)
    .join("");

  return `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>تخفیف‌های اسنپ‌شاپ</title>
<style>
  :root{--bg:#f8fafc;--card:#fff;--fg:#0f172a;--muted:#64748b;--line:#e2e8f0;--link:#2563eb}
  @media (prefers-color-scheme:dark){:root{--bg:#0b1120;--card:#111827;--fg:#e5e7eb;--muted:#94a3b8;--line:#1f2937;--link:#60a5fa}}
  body{margin:0;font-family:Vazirmatn,Tahoma,"Segoe UI",sans-serif;background:var(--bg);color:var(--fg);font-size:14px}
  header{padding:16px;max-width:1300px;margin:auto}
  h1{font-size:20px;margin:0 0 6px} .muted{color:var(--muted)}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .chip{background:var(--card);border:1px solid var(--line);border-radius:99px;padding:4px 10px;cursor:pointer;user-select:none}
  .dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-inline:4px}
  .wrap{max-width:1300px;margin:auto;padding:0 16px 32px;overflow-x:auto}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:8px}
  th,td{padding:8px;border-bottom:1px solid var(--line);vertical-align:middle;text-align:right}
  th{position:sticky;top:0;background:var(--card);cursor:pointer;white-space:nowrap;font-size:13px}
  th[data-sort]:hover{color:var(--link)}
  td.img img{width:56px;height:56px;object-fit:contain;background:#fff;border-radius:6px}
  td.title{min-width:260px} a{color:var(--link);text-decoration:none} a:hover{text-decoration:underline}
  .sub{color:var(--muted);font-size:12px;margin-top:3px} .notes{color:#d97706;font-size:12px;margin-top:3px}
  .num{white-space:nowrap;font-variant-numeric:tabular-nums} .strong{font-weight:700;font-size:15px}
  .pos{color:#16a34a} .neg{color:#dc2626} s{color:var(--muted)}
  .badge{color:#fff;border-radius:6px;padding:3px 8px;white-space:nowrap;font-size:12px}
  .help{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin-top:12px;line-height:1.9}
</style></head><body>
<header>
  <h1>تخفیف‌های بالای ${pct(minDiscount)} اسنپ‌شاپ، مقایسه‌شده با ترب</h1>
  <div class="muted">${esc(createdAt)} · ${fmt(rows.length)} کالا · قیمت‌ها به تومان</div>
  <div class="help">
    <b>تخفیف واقعی</b> = چقدر قیمت نهایی اسنپ‌شاپ از <b>میانه‌ی قیمت فروشگاه‌های دیگر در ترب</b> ارزان‌تر است (منفی یعنی گران‌تر).
    «ارزان‌ترین بازار» یعنی از همه‌ی فروشگاه‌های ترب ارزان‌تر است. «تخفیف ساختگی» یعنی با وجود تخفیف، از میانه‌ی بازار ارزان‌تر نیست.
  </div>
  <div class="chips" id="chips">${chips}</div>
</header>
<div class="wrap"><table>
  <thead><tr><th></th><th>کالا</th><th>وضعیت</th><th data-sort="claimed">تخفیف اسنپ</th><th data-sort="real">تخفیف واقعی ▼</th>
  <th data-sort="final">قیمت اسنپ‌شاپ</th><th>کمترین ترب</th><th>میانه ترب</th></tr></thead>
  <tbody id="rows">${trs}</tbody>
</table></div>
<script>
  const tbody=document.getElementById("rows");
  function applyFilter(){const on=new Set([...document.querySelectorAll("#chips input:checked")].map(i=>i.value));
    for(const tr of tbody.rows) tr.style.display=on.has(tr.dataset.v)?"":"none";}
  document.getElementById("chips").addEventListener("change",applyFilter); applyFilter();
  let dir={};
  for(const th of document.querySelectorAll("th[data-sort]")) th.addEventListener("click",()=>{
    const k=th.dataset.sort; dir[k]=!dir[k];
    [...tbody.rows].sort((a,b)=>(+b.dataset[k]-+a.dataset[k])*(dir[k]?1:-1)).forEach(r=>tbody.appendChild(r));
    document.querySelectorAll("th[data-sort]").forEach(h=>h.textContent=h.textContent.replace(/ [▲▼]$/,""));
    th.textContent+=dir[k]?" ▼":" ▲";
  });
</script></body></html>`;
}
