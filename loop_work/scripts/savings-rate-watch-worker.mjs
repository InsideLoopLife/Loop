import cron from "node-cron";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(__dirname, "run-savings-rate-watch.mjs");
const timezone = process.env.SAVINGS_WATCH_TIMEZONE || "Europe/London";
const schedule = process.env.SAVINGS_WATCH_CRON || "0 8 * * *";
let running = false;

function run() {
  if (running) {
    console.warn(`[savings-rate-watch] ${new Date().toISOString()} skipped: previous run still active`);
    return;
  }
  running = true;
  console.log(`[savings-rate-watch] ${new Date().toISOString()} starting`);
  const child = spawn(process.execPath, [runner], { stdio: "inherit", env: process.env });
  child.on("exit", (code, signal) => {
    running = false;
    console.log(`[savings-rate-watch] ${new Date().toISOString()} finished code=${code ?? "null"} signal=${signal ?? "none"}`);
  });
  child.on("error", (error) => {
    running = false;
    console.error(`[savings-rate-watch] failed to start: ${error.message}`);
  });
}

if (!cron.validate(schedule)) {
  console.error(`[savings-rate-watch] invalid SAVINGS_WATCH_CRON: ${schedule}`);
  process.exit(1);
}

cron.schedule(schedule, run, { timezone });
console.log(`[savings-rate-watch] scheduled '${schedule}' in ${timezone}; target ${process.env.APP_BASE_URL || "http://localhost:3000"}`);

if (String(process.env.RUN_ON_START || "").toLowerCase() === "true") run();
