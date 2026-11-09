/**
 * Aoun (عون) one-click launcher (used by "Aoun.app" — no Terminal needed).
 *
 *  1. creates .env with random keys on first run
 *  2. starts a private, embedded PostgreSQL (data in .taree-data/, port 54329)
 *  3. creates the schema and loads the fictional demo data on first run
 *  4. builds the site if needed, starts it on http://localhost:3000 and opens the browser
 *  5. on SIGTERM/SIGINT ("Stop Aoun.app") shuts the site and the database down cleanly
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, ".taree-data");
const PIDFILE = path.join(DATA, "taree.pid");
const PG_PORT = Number(process.env.TAREE_PG_PORT || 54329);
const WEB_PORT = Number(process.env.TAREE_PORT || 3000);
const URL_HOME = `http://localhost:${WEB_PORT}/`;
const log = (...a) => console.log(new Date().toISOString(), "[taree]", ...a);
const node = process.execPath;
const bin = (p) => path.join(ROOT, "node_modules", p);

fs.mkdirSync(DATA, { recursive: true });

function openBrowser(url) {
  if (process.platform === "win32") return void spawn("cmd", ["/c", "start", '""', url], { stdio: "ignore", detached: true, windowsVerbatimArguments: true }).unref();
  spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { stdio: "ignore", detached: true }).unref();
}

function httpOk(url) {
  return new Promise((res) => {
    const r = http.get(url, (x) => { x.resume(); res(x.statusCode && x.statusCode < 500); });
    r.on("error", () => res(false));
    r.setTimeout(3000, () => { r.destroy(); res(false); });
  });
}

function notify(msg) {
  if (process.platform !== "darwin") return log(msg);
  spawnSync("osascript", ["-e", `display notification "${msg.replace(/"/g, "'")}" with title "عون Aoun"`]);
  log(msg);
}

function run(args, label) {
  log("running", label);
  const r = spawnSync(node, args, { cwd: ROOT, stdio: "inherit", env: process.env });
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status})`);
}

// Already running? Just open the browser.
if (fs.existsSync(PIDFILE)) {
  const pid = Number(fs.readFileSync(PIDFILE, "utf8"));
  let alive = false;
  try { process.kill(pid, 0); alive = true; } catch {}
  if (alive && (await httpOk(`http://localhost:${WEB_PORT}/`))) {
    log("already running (pid", pid, ") — opening browser");
    openBrowser(URL_HOME);
    process.exit(0);
  }
  fs.rmSync(PIDFILE, { force: true });
}
fs.writeFileSync(PIDFILE, String(process.pid));

// 1) .env
const envPath = path.join(ROOT, ".env");
if (!fs.existsSync(envPath)) {
  const k = () => crypto.randomBytes(32).toString("base64");
  fs.writeFileSync(
    envPath,
    [
      `DATABASE_URL="postgresql://taree:taree@localhost:${PG_PORT}/taree?schema=public"`,
      `APP_URL="http://localhost:${WEB_PORT}"`,
      `DEMO_MODE="true"`,
      `STORAGE_DIR="./storage"`,
      `STORAGE_ENCRYPTION_KEY="${k()}"`,
      `IDENTITY_PEPPER="${k()}"`,
      `SECRETS_ENCRYPTION_KEY="${k()}"`,
      `DEMO_SYNC_STAGE_DELAY_MS="900"`,
      `OTP_FIXED_CODE="123456"`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  log("created .env");
}
if (!/^OTP_FIXED_CODE=/m.test(fs.readFileSync(envPath, "utf8"))) fs.appendFileSync(envPath, `OTP_FIXED_CODE="123456"\n`);
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}
const usesEmbedded = (process.env.DATABASE_URL || "").includes(`:${PG_PORT}/`);

// 1b) Regenerate the database client when the schema changed in an update
{
  const schema = path.join(ROOT, "prisma", "schema.prisma");
  const mark = path.join(ROOT, "node_modules", ".taree-schema-hash");
  const want = crypto.createHash("sha256").update(fs.readFileSync(schema)).digest("hex");
  const have = fs.existsSync(mark) ? fs.readFileSync(mark, "utf8").trim() : "";
  if (want !== have) {
    run([bin("prisma/build/index.js"), "generate"], "prisma generate");
    fs.writeFileSync(mark, want);
  }
}

// 2) Embedded PostgreSQL
let pg = null;
if (usesEmbedded) {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const dbDir = path.join(DATA, "pgdata");
  const fresh = !fs.existsSync(path.join(dbDir, "PG_VERSION"));
  pg = new EmbeddedPostgres({ databaseDir: dbDir, user: "taree", password: "taree", port: PG_PORT, persistent: true, onLog: (m) => log("pg:", String(m).trim()), onError: (e) => log("pg:", String(e).trim()) });
  if (fresh) {
    notify("الإعداد الأول: تجهيز قاعدة البيانات… / First run: preparing the database…");
    fs.rmSync(dbDir, { recursive: true, force: true });
    await pg.initialise();
  }
  try {
    await pg.start();
  } catch (e) {
    // A previous run was killed without a clean shutdown: remove the stale lock and retry once.
    fs.rmSync(path.join(dbDir, "postmaster.pid"), { force: true });
    await pg.start();
  }
  if (fresh) await pg.createDatabase("taree");
  log("database ready on port", PG_PORT);
}

// 3) Schema + demo data
{
  const { default: pgLib } = await import("pg");
  const client = new pgLib.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  // Apply database migrations once each (tracked in _taree_migrations).
  await client.query(`CREATE TABLE IF NOT EXISTS "_taree_migrations" (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const appliedRows = await client.query(`SELECT name FROM "_taree_migrations"`);
  const applied = new Set(appliedRows.rows.map((r) => r.name));
  const { rows } = await client.query(`SELECT to_regclass('public."Hospital"') AS t`);
  const hadSchema = !!rows[0].t;
  const dir = path.join(ROOT, "prisma", "migrations");
  const migrations = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, "migration.sql"))).sort();
  for (const [i, m] of migrations.entries()) {
    if (applied.has(m)) continue;
    if (i === 0 && hadSchema) {
      // database created by an earlier version of the launcher (before tracking existed)
      await client.query(`INSERT INTO "_taree_migrations"(name) VALUES ($1)`, [m]);
      continue;
    }
    log("applying migration", m);
    await client.query(fs.readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
    await client.query(`INSERT INTO "_taree_migrations"(name) VALUES ($1)`, [m]);
  }
  // One-time rename Taree → Aoun (عون) for an existing database: demo password, admin e-mail, welcome text.
  {
    const mark = path.join(DATA, "renamed-aoun");
    if (hadSchema && !fs.existsSync(mark)) {
      try {
        const { default: bcrypt } = await import("bcryptjs");
        const staff = await client.query(`SELECT id, "passwordHash" FROM "User" WHERE role <> 'PATIENT'`);
        const newHash = await bcrypt.hash("Aoun@2026", 10);
        for (const u of staff.rows) if (await bcrypt.compare("Taree@2026", u.passwordHash)) await client.query(`UPDATE "User" SET "passwordHash" = $1 WHERE id = $2`, [newHash, u.id]);
        await client.query(`UPDATE "User" SET email = 'admin@aoun.med', "displayName" = 'مشرف منصة عون' WHERE email = 'admin@taree.med'`);
        await client.query(`UPDATE "Notification" SET "titleAr" = replace("titleAr", 'طارئ', 'عون'), "titleEn" = replace("titleEn", 'Taree', 'Aoun')`);
        fs.writeFileSync(mark, new Date().toISOString());
        log("renamed demo data to Aoun");
      } catch (e) { log("rename step skipped:", e?.message || e); }
    }
  }
  let seeded = false;
  if (hadSchema) {
    const c = await client.query(`SELECT count(*)::int AS n FROM "Hospital"`);
    seeded = c.rows[0].n > 0;
  }
  await client.end();
  // Re-seed when the bundled demo dataset version changes (e.g. after an update of the app).
  const verFile = path.join(ROOT, "prisma", "seed-version");
  const want = fs.existsSync(verFile) ? fs.readFileSync(verFile, "utf8").trim() : "1";
  const haveFile = path.join(DATA, "seed-version");
  const have = fs.existsSync(haveFile) ? fs.readFileSync(haveFile, "utf8").trim() : "1";
  if (seeded && want !== have) { log("demo data version", have, "→", want, "— reloading demo data"); seeded = false; }
  if (!seeded) {
    notify("تحميل البيانات التجريبية… / Loading demo data…");
    run([bin("tsx/dist/cli.mjs"), "prisma/seed.ts"], "demo seed");
    fs.writeFileSync(haveFile, want);
  }
}

// 4) Build (only if no build is present)
if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
  notify("تجهيز الموقع (مرة واحدة فقط)… / Building the site (one time)…");
  run([bin("next/dist/bin/next"), "build"], "next build");
}

// Remember which build is running (lets Aoun.app restart automatically after an update)
try { fs.writeFileSync(path.join(DATA, "running-build"), fs.readFileSync(path.join(ROOT, ".next", "BUILD_ID"), "utf8").trim()); } catch {}

// 5) Start the website
const web = spawn(node, [bin("next/dist/bin/next"), "start", "-p", String(WEB_PORT)], { cwd: ROOT, stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
// Database editor (http://localhost:3001, this computer only)
let dbAdmin = null;
try {
  const { startDbAdmin } = await import("./db-admin.mjs");
  dbAdmin = await startDbAdmin({ databaseUrl: process.env.DATABASE_URL, port: Number(process.env.TAREE_DB_PORT || 3001), log });
} catch (e) { log("database editor not started:", e.message); }

// 6) Database viewer on http://localhost:5555 (this computer only)
let dbViewer = null;
try {
  const { startDbViewer } = await import("./db-viewer.mjs");
  dbViewer = await startDbViewer({ connectionString: process.env.DATABASE_URL, port: Number(process.env.TAREE_DB_PORT || 5555), log });
} catch (e) { log("database viewer not started:", e?.message || e); }

let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  log("shutting down…");
  try { dbViewer?.close(); } catch {}
  try { dbAdmin?.close(); } catch {}
  try { web.kill("SIGTERM"); } catch {}
  try { if (pg) await pg.stop(); } catch (e) { log("pg stop:", e); }
  fs.rmSync(PIDFILE, { force: true });
  process.exit(code);
}
process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));
process.on("SIGHUP", () => shutdown(0));
web.on("exit", (c) => { if (!stopping) { log("website exited", c); shutdown(c ?? 1); } });

for (let i = 0; i < 120; i++) {
  if (await httpOk(`http://localhost:${WEB_PORT}/`)) {
    notify("عون يعمل الآن — http://localhost:3000");
    openBrowser(URL_HOME);
    break;
  }
  await new Promise((r) => setTimeout(r, 500));
}
