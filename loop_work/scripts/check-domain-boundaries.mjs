import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const ignored = new Set(["node_modules", ".next", ".git", "db"]);

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full));
    else if (sourceExtensions.has(path.extname(entry.name))) results.push(full);
  }
  return results;
}

const violations = [];
function flag(file, message) {
  violations.push(`${path.relative(root, file)}: ${message}`);
}

for (const file of walk(root)) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const text = fs.readFileSync(file, "utf8");

  if (relative.startsWith("domains/health/")) {
    if (text.includes("@/domains/wealth/")) {
      flag(file, "Health cannot import wealth internals; use an approved summary contract.");
    }
    if (
      text.includes("@/platform/database/admin-client") ||
      text.includes("@/lib/supabase/admin")
    ) {
      flag(file, "Health UI/domain code cannot import a privileged database client.");
    }
  }

  if (
    relative.startsWith("domains/wealth/") &&
    text.includes("@/domains/health/")
  ) {
    flag(file, "Wealth cannot import health internals; use a cross-domain summary contract.");
  }

  if (
    relative.startsWith("domains/market/") &&
    (text.includes("@/domains/health/") || text.includes("@/domains/identity/"))
  ) {
    flag(file, "Shared market modules cannot depend on user identity or health modules.");
  }

  const header = text.slice(0, 250);
  if (
    /["']use client["']/.test(header) &&
    (text.includes("@/platform/database/admin-client") ||
      text.includes("@/lib/supabase/admin") ||
      text.includes("@/platform/database/worker-client"))
  ) {
    flag(file, "Client component imports a privileged server database client.");
  }
}

if (violations.length) {
  console.error("LOOP domain-boundary check failed:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("LOOP domain-boundary check passed.");
