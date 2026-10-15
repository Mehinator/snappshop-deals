#!/usr/bin/env node
// Hosting mode: serves the latest report over HTTP and reads SnappShop every hour.
// Torob rejects datacenter IPs, so Torob answers come from a home PC (torob-sync.js)
// through POST /torob, authorized with the SYNC_TOKEN env variable.
// env: PORT (default 3000), RUN_EVERY_MIN (default 60), SYNC_TOKEN, CHECK_ARGS (extra args for index.js)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { ROOT, openCache } from "./cache.js";

const SITE = path.join(ROOT, "site");
const PORT = Number(process.env.PORT || 3000);
const EVERY_MIN = Number(process.env.RUN_EVERY_MIN || 60);
const SYNC_TOKEN = process.env.SYNC_TOKEN || "";
const EXTRA = (process.env.CHECK_ARGS || "").split(/\s+/).filter(Boolean);
const MAX_BODY = 20 * 1024 * 1024;

const state = { running: false, rerun: false, lastStart: null, lastEnd: null, lastExit: null, lastSync: null, log: [] };

function runCheck() {
  if (state.running) { state.rerun = true; return; }
  state.running = true;
  state.rerun = false;
  state.lastStart = new Date().toISOString();
  state.log = [];
  const args = [path.join(ROOT, "src", "index.js"), "--no-open", "--site", SITE, "--torob-limit", "0", ...EXTRA];
  const child = spawn(process.execPath, args, { cwd: ROOT });
  const onData = d => {
    process.stdout.write(d);
    state.log.push(...String(d).split("\n").filter(Boolean));
    state.log = state.log.slice(-40);
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("close", code => {
    state.running = false;
    state.lastEnd = new Date().toISOString();
    state.lastExit = code;
    if (state.rerun) runCheck(); // Torob results arrived while running
  });
}

const authorized = req => {
  const got = Buffer.from(String(req.headers.authorization || "").replace(/^Bearer /, ""));
  const want = Buffer.from(SYNC_TOKEN);
  return SYNC_TOKEN.length >= 16 && got.length === want.length && crypto.timingSafeEqual(got, want);
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("too large")); req.destroy(); } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const json = (res, code, obj) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(JSON.stringify(obj, null, 1));
};

const WAITING = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60"><title>در حال ساخت گزارش</title></head>
<body style="font-family:Tahoma,sans-serif;text-align:center;padding:40px">اولین گزارش در حال ساخت است؛ چند دقیقه دیگر این صفحه را باز کنید.</body></html>`;

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "GET" && url.pathname === "/status") return json(res, 200, state);

    if (req.method === "GET" && url.pathname === "/pending.json") {
      const file = path.join(SITE, "pending.json");
      return json(res, 200, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { pending: [] });
    }

    if (req.method === "POST" && url.pathname === "/torob") {
      if (!authorized(req)) return json(res, 403, { error: "forbidden" });
      const body = JSON.parse(await readBody(req));
      const cache = openCache(0);
      const merged = cache.merge(body.entries);
      if (merged) cache.save();
      state.lastSync = { at: new Date().toISOString(), received: Object.keys(body.entries || {}).length, merged };
      if (merged) runCheck();
      return json(res, 200, { merged });
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const file = path.join(SITE, "index.html");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
      return res.end(fs.existsSync(file) ? fs.readFileSync(file) : WAITING);
    }

    res.writeHead(404).end("not found");
  } catch (e) {
    json(res, 400, { error: e.message });
  }
}).listen(PORT, () => console.log(`serving report on port ${PORT}, reading SnappShop every ${EVERY_MIN} min, sync ${SYNC_TOKEN ? "enabled" : "DISABLED (set SYNC_TOKEN)"}`));

runCheck();
setInterval(runCheck, EVERY_MIN * 60e3);
