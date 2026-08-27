// Vitest setup: integration services use the shared Prisma singleton
// (constructed from DATABASE_URL), while tests create + verify against
// DATABASE_URL_TEST. Vite injects .env into process.env only after setupFiles
// run, so we parse .env here directly and point DATABASE_URL at the test
// database BEFORE any service module constructs the singleton. This keeps
// service writes, test setup and test verification on the same disposable DB.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] && process.env[m[1]] === undefined) {
        process.env[m[1]] = (m[2] || "").replace(/^"(.*)"$/, "$1");
      }
    }
  } catch {
    // No .env file present; rely on real environment variables only.
  }
}

loadEnv();
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}