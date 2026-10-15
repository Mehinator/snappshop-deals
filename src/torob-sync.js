#!/usr/bin/env node
// PC side of the hosted setup. Torob rejects datacenter IPs, so this runs on a home
// connection: it asks the server which products still need a Torob check, looks up
// a few of them (gently) and sends the answers to the server.
// Settings come from sync-config.json next to package.json: {"server": "https://...", "token": "..."}
// usage: node src/torob-sync.js [--torob-limit 20] [--torob-delay 8] [--cache-hours 24]
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fetchJson } from "./http.js";
import { lookup, setTorobDelay } from "./torob.js";
import { ROOT, openCache } from "./cache.js";

const { values: opt } = parseArgs({
  options: {
    "torob-limit": { type: "string", default: "20" },
    "torob-delay": { type: "string", default: "8" },
    "cache-hours": { type: "string", default: "24" },
  },
});

const logFile = path.join(ROOT, "logs", "torob-sync.log");
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const log = msg => {
  const line = `[${new Date().toLocaleString("en-GB", { timeZone: "Asia/Tehran" })}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logFile, line + "\n");
};

const { server, token } = JSON.parse(fs.readFileSync(path.join(ROOT, "sync-config.json"), "utf8"));
setTorobDelay(Number(opt["torob-delay"]) * 1000);
const limit = Number(opt["torob-limit"]);
const cache = openCache(Number(opt["cache-hours"]) * 3600e3);

try {
  const { pending = [] } = await fetchJson(new URL("/pending.json", server));
  log(`server has ${pending.length} products waiting for a Torob check`);

  const upload = {};
  let looked = 0;
  for (const { title } of pending) {
    let entry = cache.fresh(title);
    if (!entry && looked < limit) {
      looked++;
      try {
        cache.put(title, await lookup(title));
        entry = cache.any(title);
      } catch (e) {
        if (e.blocked) { log(`Torob is showing a captcha after ${looked} lookups; stopping until next run`); break; }
        log(`Torob error for "${title}": ${e.message.split("\n")[0]}`);
      }
    }
    if (entry) upload[title] = entry;
  }
  cache.save();

  if (Object.keys(upload).length) {
    const res = await fetchJson(new URL("/torob", server), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: { entries: upload },
    });
    log(`looked up ${looked} on Torob, sent ${Object.keys(upload).length}, server took ${res.merged}`);
  } else {
    log(`looked up ${looked} on Torob, nothing to send`);
  }
} catch (e) {
  log(`sync failed: ${e.message.split("\n")[0]}`);
  process.exitCode = 1;
}
