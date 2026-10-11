const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** fetch + JSON with timeout and retries (network on these sites is flaky). */
export async function fetchJson(url, { method = "GET", headers = {}, body, retries = 5, timeoutMs = 45000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: { "User-Agent": UA, Accept: "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Torob answers 490 with a "are you a robot?" captcha page: stop, don't hammer it
      if (res.status === 490) throw Object.assign(new Error("BLOCKED: the site is showing a captcha (too many requests)"), { fatal: true, blocked: true });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch {
        // e.g. a block/challenge page instead of the API answer
        throw new Error(`HTTP ${res.status}, not JSON: ${text.replace(/\s+/g, " ").slice(0, 300)}`);
      }
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`), { fatal: true });
      return json;
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e;
      if (attempt < retries) await sleep(1000 * 2 ** Math.min(attempt, 4));
    }
  }
  throw new Error(`request failed after ${retries + 1} tries: ${url}\n  ${lastErr?.cause?.code || lastErr?.message}`);
}

/** Run async fn over items with limited parallelism, preserving order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
