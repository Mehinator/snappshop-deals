#!/usr/bin/env node
// Hosting mode: serves the latest report over HTTP and runs the check every hour.
// env: PORT (default 3000), RUN_EVERY_MIN (default 60), CHECK_ARGS (extra args for index.js)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const PORT = Number(process.env.PORT || 3000);
const EVERY_MIN = Number(process.env.RUN_EVERY_MIN || 60);
const EXTRA = (process.env.CHECK_ARGS || "").split(/\s+/).filter(Boolean);

const state = { running: false, lastStart: null, lastEnd: null, lastExit: null, log: [] };

function runCheck() {
  if (state.running) return;
  state.running = true;
  state.lastStart = new Date().toISOString();
  state.log = [];
  const child = spawn(process.execPath, [path.join(ROOT, "src", "index.js"), "--no-open", "--site", SITE, ...EXTRA], { cwd: ROOT });
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
  });
}

const WAITING = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60"><title>در حال ساخت گزارش</title></head>
<body style="font-family:Tahoma,sans-serif;text-align:center;padding:40px">اولین گزارش در حال ساخت است؛ چند دقیقه دیگر این صفحه را باز کنید.</body></html>`;

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/status") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify(state, null, 1));
  }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    const file = path.join(SITE, "index.html");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
    return res.end(fs.existsSync(file) ? fs.readFileSync(file) : WAITING);
  }
  res.writeHead(404).end("not found");
}).listen(PORT, () => console.log(`serving report on port ${PORT}, checking every ${EVERY_MIN} min`));

runCheck();
setInterval(runCheck, EVERY_MIN * 60e3);
