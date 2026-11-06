/**
 * Aoun database viewer — a small local web page (http://localhost:5555) to browse and edit
 * the tables of Aoun's database. Started by the launcher together with the website; it listens
 * on 127.0.0.1 only, so it is reachable from this computer and never from the network.
 */
import http from "node:http";
import crypto from "node:crypto";

const PAGE_SIZE = 50;

/* ---- identity helpers (same scheme as src/lib/crypto.ts) ---- */
const normalizeId = (id) => String(id).replace(/\D/g, "");
const idTypeFor = (id) => (normalizeId(id).startsWith("2") ? "IQAMA" : "NATIONAL_ID");
const hashIdentifier = (idType, value, scope = "GLOBAL") =>
  crypto.createHmac("sha256", process.env.IDENTITY_PEPPER || "").update(`${idType}:${scope}:${normalizeId(value)}`).digest("hex");
function maskId(id) { const d = normalizeId(id); return d[0] + "•".repeat(d.length - 5) + d.slice(-4); }
function encryptSecret(s) {
  const key = Buffer.from(process.env.SECRETS_ENCRYPTION_KEY || "", "base64");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(Buffer.from(s, "utf8")), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}
const newId = () => "c" + crypto.randomBytes(12).toString("hex");
async function insertRow(db, table, obj) {
  const keys = Object.keys(obj);
  await db.query(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`, keys.map((k) => obj[k]));
}
class UserError extends Error {}

/**
 * The request handler on its own, so the same page can also be served online by the website
 * (/manage, behind an admin sign-in) — see src/app/manage.
 */
export async function createDbViewerListener({ connectionString, port = 5555, log = console.log, checkOrigin = true, poolMax = 3 }) {
  const { default: pgLib } = await import("pg");
  const pool = new pgLib.Pool({ connectionString, max: poolMax, idleTimeoutMillis: 10_000 });

  async function tables() {
    const { rows } = await pool.query(
      `SELECT c.relname AS name, c.reltuples::bigint AS approx
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname NOT LIKE '\\_%'
        ORDER BY c.relname`,
    );
    const out = [];
    for (const r of rows) {
      const c = await pool.query(`SELECT count(*)::int AS n FROM "${r.name}"`);
      out.push({ name: r.name, count: c.rows[0].n });
    }
    return out;
  }

  async function columns(table) {
    const { rows } = await pool.query(
      `SELECT column_name AS name, data_type AS type, udt_name AS udt, is_nullable = 'YES' AS nullable, column_default AS def
         FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [table],
    );
    for (const c of rows) {
      if (c.type === "USER-DEFINED") {
        const e = await pool.query(`SELECT e.enumlabel AS v FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = $1 ORDER BY e.enumsortorder`, [c.udt]);
        if (e.rows.length) c.options = e.rows.map((x) => x.v);
      }
    }
    return rows;
  }

  async function checkTable(t) {
    const list = await tables();
    if (!list.some((x) => x.name === t)) throw new Error("Unknown table");
    const cols = await columns(t);
    if (!cols.some((c) => c.name === "id")) throw new Error("Table has no id column");
    return cols;
  }

  function toDb(col, value, isNull) {
    if (isNull) return null;
    if (col.type === "ARRAY") {
      const v = String(value).trim();
      if (!v) return [];
      try { const a = JSON.parse(v); if (Array.isArray(a)) return a; } catch {}
      return v.split(/\s*[,،]\s*/).filter(Boolean);
    }
    return value;
  }

  function show(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    if (Buffer.isBuffer(v)) return `[${v.length} bytes]`;
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  function plain(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    if (Buffer.isBuffer(v)) return null;
    if (Array.isArray(v)) return v.map(plain);
    if (typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !/Hash$|Enc$/.test(k)).map(([k, x]) => [k, plain(x)]));
    return v;
  }

  async function body(req) {
    let s = "";
    for await (const c of req) { s += c; if (s.length > 2_000_000) throw new Error("Too large"); }
    return s ? JSON.parse(s) : {};
  }

  const listener = async (req, res) => {
    const send = (code, obj, type = "application/json; charset=utf-8") => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
      res.end(type.startsWith("application/json") ? JSON.stringify(obj) : obj);
    };
    try {
      const url = new URL(req.url, "http://localhost");
      // Only same-origin browser requests may change data.
      if (req.method !== "GET") {
        const origin = req.headers.origin;
        if (checkOrigin && origin && origin !== `http://localhost:${port}` && origin !== `http://127.0.0.1:${port}`) return send(403, { error: "Forbidden" });
      }
      if (req.method === "GET" && url.pathname === "/") return send(200, PAGE, "text/html; charset=utf-8");
      if (req.method === "GET" && url.pathname === "/api/tables") return send(200, await tables());
      if (req.method === "GET" && url.pathname === "/api/columns") return send(200, await checkTable(url.searchParams.get("t") || ""));
      if (req.method === "GET" && url.pathname === "/api/hospitals") {
        return send(200, (await pool.query(`SELECT id, "nameAr", "nameEn" FROM "Hospital" WHERE "isActive" ORDER BY "nameAr"`)).rows);
      }
      if (req.method === "POST" && url.pathname === "/api/patients/add") {
        const b = await body(req);
        const nid = normalizeId(b.nationalId || "");
        if (!/^[12]\d{9}$/.test(nid)) throw new UserError("رقم الهوية / الإقامة يجب أن يكون 10 أرقام ويبدأ بـ 1 أو 2 | ID must be 10 digits starting with 1 or 2");
        if (!/^05\d{8}$/.test(b.phone || "")) throw new UserError("رقم الجوال بصيغة 05XXXXXXXX | Mobile must be 05XXXXXXXX");
        if (!b.fullNameAr?.trim() || !b.fullNameEn?.trim()) throw new UserError("الاسم مطلوب بالعربي والإنجليزي | Name is required in Arabic and English");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dateOfBirth || "")) throw new UserError("تاريخ الميلاد مطلوب | Date of birth is required");
        if (!["MALE", "FEMALE"].includes(b.sex)) throw new UserError("اختر الجنس | Choose the sex");
        const idType = idTypeFor(nid), hash = hashIdentifier(idType, nid);
        const exists = await pool.query(`SELECT 1 FROM "DevIdentityRecord" WHERE "identifierHash" = $1 UNION SELECT 1 FROM "User" WHERE username = $1`, [hash]);
        if (exists.rowCount) throw new UserError("رقم الهوية مسجّل مسبقاً | This ID is already registered");
        const db = await pool.connect();
        const now = new Date(), pid = newId(), uid = newId();
        try {
          await db.query("BEGIN");
          const base = { fullNameAr: b.fullNameAr.trim(), fullNameEn: b.fullNameEn.trim(), dateOfBirth: b.dateOfBirth, sex: b.sex };
          await insertRow(db, "DevIdentityRecord", { id: newId(), idType, identifierHash: hash, maskedId: maskId(nid), ...base, phone: b.phone });
          const { default: bcrypt } = await import("bcryptjs");
          await insertRow(db, "User", { id: uid, role: "PATIENT", username: hash, passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10), displayName: base.fullNameAr, phone: b.phone, updatedAt: now });
          await insertRow(db, "Patient", { id: pid, userId: uid, ...base, maskedId: maskId(nid), identityVerified: true, identityVerifiedAt: now, identitySource: "DEV_IDENTITY_PROVIDER", updatedAt: now });
          await insertRow(db, "IdentityMapping", { id: newId(), patientId: pid, idType, identifierHash: hash, verified: true, verificationMethod: "ADMIN" });
          await insertRow(db, "MedicalProfile", { id: newId(), patientId: pid, bloodType: b.bloodType || null, emergencyContactName: b.emergencyContactName || null, emergencyContactRel: b.emergencyContactRel || null, emergencyContactPhone: b.emergencyContactPhone || null, updatedAt: now });
          // Register the patient in every hospital's own index so any hospital can upload imaging for them
          for (const h of (await db.query(`SELECT id FROM "Hospital"`)).rows) {
            const hh = hashIdentifier("HOSP_LOCAL", nid, h.id);
            const has = await db.query(`SELECT 1 FROM "HospitalPatientIndex" WHERE "hospitalId" = $1 AND "nationalIdHash" = $2`, [h.id, hh]);
            if (!has.rowCount) await insertRow(db, "HospitalPatientIndex", { id: newId(), hospitalId: h.id, mrn: `MRN-${crypto.randomInt(100000, 999999)}`, idType, nationalIdEnc: encryptSecret(nid), nationalIdHash: hh, ...base });
          }
          await db.query("COMMIT");
        } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
        log("db-viewer: patient added", pid);
        return send(200, { ok: true, id: pid });
      }
      if (req.method === "POST" && url.pathname === "/api/staff/add") {
        const b = await body(req);
        const email = String(b.email || "").trim().toLowerCase();
        if (!b.fullNameAr?.trim() || !b.fullNameEn?.trim()) throw new UserError("الاسم مطلوب بالعربي والإنجليزي | Name is required in Arabic and English");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new UserError("البريد غير صحيح | Invalid email");
        if (String(b.password || "").length < 8) throw new UserError("كلمة المرور 8 أحرف على الأقل | Password must be at least 8 characters");
        if (!["DOCTOR", "RADIOLOGIST"].includes(b.role)) throw new UserError("اختر الدور | Choose the role");
        if (!b.hospitalId) throw new UserError("اختر المستشفى | Choose the hospital");
        if ((await pool.query(`SELECT 1 FROM "User" WHERE lower(email) = $1`, [email])).rowCount) throw new UserError("البريد مستخدم مسبقاً | Email already in use");
        const db = await pool.connect();
        const now = new Date(), uid = newId(), hid = newId();
        try {
          await db.query("BEGIN");
          const { default: bcrypt } = await import("bcryptjs");
          await insertRow(db, "User", { id: uid, role: b.role, email, passwordHash: await bcrypt.hash(b.password, 10), displayName: b.fullNameAr.trim(), updatedAt: now });
          await insertRow(db, "HealthcareProfessional", { id: hid, userId: uid, fullNameAr: b.fullNameAr.trim(), fullNameEn: b.fullNameEn.trim(), licenseNumber: b.licenseNumber?.trim() || `LIC-${crypto.randomInt(100000, 999999)}`, profession: b.role === "RADIOLOGIST" ? "RADIOLOGIST" : "PHYSICIAN", specialty: b.specialty?.trim() || null, licenseVerified: true, licenseVerifiedAt: now });
          await insertRow(db, "ProfessionalAffiliation", { id: newId(), professionalId: hid, hospitalId: b.hospitalId, department: b.role === "RADIOLOGIST" ? "RADIOLOGY" : (b.department || "EMERGENCY"), status: "ACTIVE", verifiedAt: now, verifiedBy: "admin" });
          await db.query("COMMIT");
        } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
        log("db-viewer: staff added", hid);
        return send(200, { ok: true, id: hid });
      }
      if (req.method === "POST" && url.pathname === "/api/patient-phone") {
        const b = await body(req);
        if (!/^05\d{8}$/.test(b.phone || "")) throw new UserError("رقم الجوال بصيغة 05XXXXXXXX | Mobile must be 05XXXXXXXX");
        const p = (await pool.query(`SELECT "userId" FROM "Patient" WHERE id = $1`, [b.patientId])).rows[0];
        if (!p) throw new UserError("Not found");
        await pool.query(`UPDATE "DevIdentityRecord" SET phone = $1 WHERE "identifierHash" IN (SELECT "identifierHash" FROM "IdentityMapping" WHERE "patientId" = $2 AND scope = 'GLOBAL')`, [b.phone, b.patientId]);
        if (p.userId) await pool.query(`UPDATE "User" SET phone = $1, "updatedAt" = now() WHERE id = $2`, [b.phone, p.userId]);
        return send(200, { ok: true });
      }
      if (req.method === "GET" && url.pathname === "/api/patients") {
        const q = (url.searchParams.get("q") || "").trim();
        const { rows } = await pool.query(
          `SELECT p.id, p."fullNameAr", p."fullNameEn", p."maskedId", p.sex, p."dateOfBirth", coalesce((SELECT r.phone FROM "DevIdentityRecord" r JOIN "IdentityMapping" m ON m."identifierHash" = r."identifierHash" WHERE m."patientId" = p.id AND m.scope = 'GLOBAL' LIMIT 1), u.phone) AS phone, mp."bloodType",
                  (SELECT count(*)::int FROM "ImagingStudy" s WHERE s."patientId" = p.id) AS studies
             FROM "Patient" p LEFT JOIN "User" u ON u.id = p."userId" LEFT JOIN "MedicalProfile" mp ON mp."patientId" = p.id
            WHERE $1 = '' OR p."fullNameAr" ILIKE '%'||$1||'%' OR p."fullNameEn" ILIKE '%'||$1||'%' OR coalesce(u.phone,'') LIKE '%'||$1||'%' OR p."maskedId" LIKE '%'||$1||'%'
            ORDER BY p."createdAt" DESC`, [q]);
        return send(200, rows.map(plain));
      }
      if (req.method === "GET" && url.pathname === "/api/patient") {
        const id = url.searchParams.get("id");
        const one = async (sql, p = [id]) => (await pool.query(sql, p)).rows[0] || null;
        const many = async (sql, p = [id]) => (await pool.query(sql, p)).rows;
        const patient = await one(`SELECT * FROM "Patient" WHERE id = $1`);
        if (!patient) return send(404, { error: "Not found" });
        return send(200, plain({
          patient,
          user: patient.userId ? await one(`SELECT id, role, phone, email, "displayName", "isActive", locale, "createdAt" FROM "User" WHERE id = $1`, [patient.userId]) : null,
          profile: await one(`SELECT * FROM "MedicalProfile" WHERE "patientId" = $1`),
          loginPhone: (await one(`SELECT r.phone FROM "DevIdentityRecord" r JOIN "IdentityMapping" m ON m."identifierHash" = r."identifierHash" WHERE m."patientId" = $1 AND m.scope = 'GLOBAL' LIMIT 1`))?.phone ?? null,
          conditions: await many(`SELECT * FROM "ChronicCondition" WHERE "patientId" = $1 ORDER BY "createdAt"`),
          allergies: await many(`SELECT * FROM "Allergy" WHERE "patientId" = $1 ORDER BY "createdAt"`),
          studies: await many(`SELECT s.id, s."referenceNumber", s.modality, s."bodyRegion", s."examDate", s.status, s."radiologistName", h."nameAr" AS hospital, h."nameEn" AS "hospitalEn",
                                      r.id AS "reportId", r.text AS report, (SELECT string_agg(f."fileName", '، ') FROM "ImagingFile" f WHERE f."studyId" = s.id) AS files
                                 FROM "ImagingStudy" s LEFT JOIN "Hospital" h ON h.id = s."sourceHospitalId" LEFT JOIN "RadiologyReport" r ON r."studyId" = s.id
                                WHERE s."patientId" = $1 ORDER BY s."examDate" DESC NULLS LAST, s."createdAt" DESC`),
          access: await many(`SELECT g."createdAt", g."expiresAt", g."revokedAt", hp."fullNameAr" AS doctor, hp."fullNameEn" AS "doctorEn", h."nameAr" AS hospital, h."nameEn" AS "hospitalEn"
                                FROM "AccessGrant" g LEFT JOIN "HealthcareProfessional" hp ON hp.id = g."professionalId" LEFT JOIN "Hospital" h ON h.id = g."hospitalId"
                               WHERE g."patientId" = $1 ORDER BY g."createdAt" DESC LIMIT 20`),
        }));
      }
      if (req.method === "GET" && url.pathname === "/api/staff") {
        const { rows } = await pool.query(
          `SELECT hp.id, hp."fullNameAr", hp."fullNameEn", hp.profession, hp.specialty, hp."licenseVerified", u.email, u.role, u."isActive",
                  (SELECT string_agg(h."nameAr", '، ') FROM "ProfessionalAffiliation" a JOIN "Hospital" h ON h.id = a."hospitalId" WHERE a."professionalId" = hp.id) AS hospitals,
                  (SELECT string_agg(h."nameEn", ', ') FROM "ProfessionalAffiliation" a JOIN "Hospital" h ON h.id = a."hospitalId" WHERE a."professionalId" = hp.id) AS "hospitalsEn"
             FROM "HealthcareProfessional" hp JOIN "User" u ON u.id = hp."userId" WHERE u.role IN ('DOCTOR', 'RADIOLOGIST', 'ADMIN') ORDER BY hp."fullNameAr"`);
        return send(200, rows.map(plain));
      }
      if (req.method === "GET" && url.pathname === "/api/staff-one") {
        const id = url.searchParams.get("id");
        const pro = (await pool.query(`SELECT * FROM "HealthcareProfessional" WHERE id = $1`, [id])).rows[0];
        if (!pro) return send(404, { error: "Not found" });
        return send(200, plain({
          pro,
          user: (await pool.query(`SELECT id, role, email, username, phone, "displayName", "isActive", "createdAt" FROM "User" WHERE id = $1`, [pro.userId])).rows[0] || null,
          affiliations: (await pool.query(`SELECT a.*, h."nameAr" AS hospital, h."nameEn" AS "hospitalEn" FROM "ProfessionalAffiliation" a LEFT JOIN "Hospital" h ON h.id = a."hospitalId" WHERE a."professionalId" = $1`, [id])).rows,
          access: (await pool.query(`SELECT g."createdAt", p."fullNameAr" AS patient, p."fullNameEn" AS "patientEn", h."nameAr" AS hospital FROM "AccessGrant" g LEFT JOIN "Patient" p ON p.id = g."patientId" LEFT JOIN "Hospital" h ON h.id = g."hospitalId" WHERE g."professionalId" = $1 ORDER BY g."createdAt" DESC LIMIT 20`, [id])).rows,
        }));
      }
      if (req.method === "POST" && url.pathname === "/api/password") {
        const b = await body(req);
        if (typeof b.password !== "string" || b.password.length < 8) throw new Error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
        const { default: bcrypt } = await import("bcryptjs");
        const r = await pool.query(`UPDATE "User" SET "passwordHash" = $1 WHERE id = $2 AND role <> 'PATIENT'`, [await bcrypt.hash(b.password, 10), b.userId]);
        log("db-viewer: password changed for user", b.userId);
        return send(200, { ok: true, changed: r.rowCount });
      }
      if (req.method === "GET" && url.pathname === "/api/rows") {
        const t = url.searchParams.get("t") || "";
        const cols = await checkTable(t);
        const page = Math.max(0, Number(url.searchParams.get("page") || 0));
        const q = (url.searchParams.get("q") || "").trim();
        const order = cols.some((c) => c.name === "createdAt") ? `"createdAt" DESC` : `"id"`;
        const where = q ? `WHERE x::text ILIKE $1` : "";
        const params = q ? [`%${q}%`] : [];
        const total = (await pool.query(`SELECT count(*)::int AS n FROM "${t}" x ${where}`, params)).rows[0].n;
        const { rows } = await pool.query(
          `SELECT * FROM "${t}" x ${where} ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${page * PAGE_SIZE}`,
          params,
        );
        // Readable names in place of internal ids (patient, hospital, study)
        const lookups = {};
        const names = async (sql, ids) => {
          const uniq = [...new Set(ids.filter(Boolean))];
          if (!uniq.length) return {};
          const r = await pool.query(sql, [uniq]);
          return Object.fromEntries(r.rows.map((x) => [x.id, x.label]));
        };
        for (const c of cols) {
          const ids = rows.map((r) => r[c.name]);
          if (c.name === "patientId") lookups[c.name] = await names(`SELECT id, "fullNameAr" AS label FROM "Patient" WHERE id = ANY($1)`, ids);
          else if (/hospitalId$/i.test(c.name)) lookups[c.name] = await names(`SELECT id, "nameAr" AS label FROM "Hospital" WHERE id = ANY($1)`, ids);
          else if (c.name === "studyId") lookups[c.name] = await names(`SELECT id, "referenceNumber" AS label FROM "ImagingStudy" WHERE id = ANY($1)`, ids);
          else if (c.name === "userId" && t !== "User") lookups[c.name] = await names(`SELECT id, coalesce("displayName", email, username) AS label FROM "User" WHERE id = ANY($1)`, ids);
        }
        return send(200, {
          columns: cols,
          total,
          page,
          pageSize: PAGE_SIZE,
          rows: rows.map((r) => Object.fromEntries(cols.map((c) => [c.name, show(r[c.name])]))),
          labels: rows.map((r) => Object.fromEntries(Object.keys(lookups).map((k) => [k, lookups[k][r[k]] ?? null]))),
        });
      }
      if (req.method === "POST" && url.pathname === "/api/update") {
        const b = await body(req);
        const cols = await checkTable(b.t);
        const col = cols.find((c) => c.name === b.col);
        if (!col || col.name === "id") throw new Error("This field cannot be edited");
        const touch = cols.some((c) => c.name === "updatedAt") && col.name !== "updatedAt" ? `, "updatedAt" = now()` : "";
        const r = await pool.query(`UPDATE "${b.t}" SET "${col.name}" = $1${touch} WHERE "id" = $2`, [toDb(col, b.value, b.isNull), b.id]);
        log("db-viewer: updated", b.t, b.id, col.name);
        return send(200, { ok: true, changed: r.rowCount });
      }
      if (req.method === "POST" && url.pathname === "/api/insert") {
        const b = await body(req);
        const cols = await checkTable(b.t);
        const names = [], vals = [];
        for (const c of cols) {
          if (!(c.name in (b.values || {}))) continue;
          const v = b.values[c.name];
          if (v === "" && (c.def || c.nullable)) continue; // empty → database default / NULL
          names.push(`"${c.name}"`);
          vals.push(toDb(c, v, false));
        }
        for (const c of cols) {
          if (/^(createdAt|updatedAt)$/.test(c.name) && !c.def && !c.nullable && !names.includes(`"${c.name}"`)) { names.push(`"${c.name}"`); vals.push(new Date()); }
        }
        if (!names.some((n) => n === `"id"`) && cols.find((c) => c.name === "id" && !c.def)) {
          names.push(`"id"`);
          vals.push(crypto.randomUUID());
        }
        const ph = vals.map((_, i) => `$${i + 1}`).join(", ");
        await pool.query(`INSERT INTO "${b.t}" (${names.join(", ")}) VALUES (${ph})`, vals);
        log("db-viewer: inserted into", b.t);
        return send(200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/delete") {
        const b = await body(req);
        await checkTable(b.t);
        const r = await pool.query(`DELETE FROM "${b.t}" WHERE "id" = $1`, [b.id]);
        log("db-viewer: deleted", b.t, b.id);
        return send(200, { ok: true, changed: r.rowCount });
      }
      send(404, { error: "Not found" });
    } catch (e) {
      send(400, { error: String(e?.message || e) });
    }
  };
  return { listener, pool };
}

export async function startDbViewer({ connectionString, port = 5555, log = console.log }) {
  const { listener, pool } = await createDbViewerListener({ connectionString, port, log });
  const server = http.createServer(listener);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  log(`database viewer ready on http://localhost:${port}`);
  return { close: () => { server.close(); pool.end().catch(() => {}); } };
}

const PAGE = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aoun Users</title>
<style>
  :root { --teal:#087F8C; --teal-50:#E6F4F5; --navy:#0F2A43; --muted:#64748B; --bg:#F5F7FA; --line:#E5E9F0; --red:#C53030; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--navy); font-family:-apple-system,"SF Arabic","Segoe UI",Tahoma,sans-serif; font-size:14px; }
  .wrap { display:grid; grid-template-columns: 250px 1fr; min-height:100vh; }
  aside { background:#fff; border-inline-end:1px solid var(--line); padding:18px 14px; position:sticky; top:0; height:100vh; }
  .brand { display:flex; align-items:center; gap:10px; margin-bottom:16px; }
  .logo { width:36px; height:36px; border-radius:10px; background:var(--teal); display:grid; place-items:center; flex:none; }
  .brand b { font-size:16px; display:block; } .brand small { color:var(--muted); font-size:12px; }
  .lang { display:grid; grid-template-columns:1fr 1fr; background:#F1F5F9; border-radius:10px; padding:3px; margin-bottom:20px; }
  .lang button { border:0; background:none; padding:7px; border-radius:8px; cursor:pointer; font:inherit; color:var(--muted); }
  .lang button.on { background:#fff; color:var(--navy); font-weight:600; box-shadow:0 1px 3px rgba(0,0,0,.08); }
  .item { display:flex; align-items:center; gap:10px; width:100%; border:0; background:none; padding:11px 12px; border-radius:10px; cursor:pointer; color:var(--navy); font:inherit; text-align:start; margin-bottom:4px; font-size:15px; }
  .item:hover { background:#F1F5F9; }
  .item.on { background:var(--teal-50); color:#04434A; font-weight:600; }
  .item .n { margin-inline-start:auto; min-width:26px; text-align:center; font-size:12px; padding:1px 8px; border-radius:99px; background:#F1F5F9; color:var(--muted); }
  .item.on .n { background:#fff; color:var(--teal); }
  main { padding:28px 32px; min-width:0; }
  .title { display:flex; align-items:center; gap:12px; margin-bottom:4px; }
  .title h2 { margin:0; font-size:24px; }
  .desc { color:var(--muted); margin:0 0 18px; font-size:13px; }
  .bar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:14px; }
  .search { position:relative; flex:1; max-width:380px; }
  .search input { width:100%; padding-inline-start:34px; }
  .search svg { position:absolute; inset-inline-start:10px; top:50%; transform:translateY(-50%); }
  input, textarea, select { font:inherit; padding:9px 12px; border:1px solid var(--line); border-radius:9px; background:#fff; color:var(--navy); outline:none; width:100%; }
  .search input { width:100%; }
  input:focus, textarea:focus, select:focus { border-color:var(--teal); box-shadow:0 0 0 3px var(--teal-50); }
  .btn { font:inherit; padding:9px 16px; border-radius:9px; border:1px solid var(--line); background:#fff; cursor:pointer; color:var(--navy); white-space:nowrap; }
  .btn:hover { background:#F8FAFC; }
  .btn.primary { background:var(--teal); color:#fff; border-color:var(--teal); }
  .btn.primary:hover { background:#066b76; }
  .count { color:var(--muted); font-size:13px; margin-inline-start:auto; }
  .card { background:#fff; border:1px solid var(--line); border-radius:14px; overflow:auto; }
  table { border-collapse:collapse; width:100%; }
  th, td { padding:12px 16px; text-align:start; white-space:nowrap; border-bottom:1px solid var(--line); }
  th { background:#F8FAFC; font-size:12px; font-weight:600; color:var(--muted); }
  tbody tr { cursor:pointer; } tbody tr:hover td { background:#F7FBFB; }
  tbody tr:last-child td { border-bottom:0; }
  .sub { color:var(--muted); font-size:12px; }
  .pill { display:inline-block; padding:2px 10px; border-radius:99px; font-size:12px; background:#F1F5F9; }
  .pill.yes { background:#E6F6EC; color:#1F7A3F; } .pill.no { background:#FDECEC; color:#B42318; }
  .empty { padding:56px; text-align:center; color:var(--muted); }
  .back { border:0; background:none; color:var(--teal); cursor:pointer; font:inherit; padding:0; margin-bottom:12px; }
  .hero { display:flex; align-items:center; gap:16px; background:var(--navy); color:#fff; border-radius:16px; padding:20px 22px; margin-bottom:18px; }
  .avatar { width:54px; height:54px; border-radius:50%; background:rgba(255,255,255,.15); display:grid; place-items:center; font-size:22px; font-weight:700; flex:none; }
  .hero h2 { margin:0; font-size:22px; } .hero p { margin:4px 0 0; opacity:.8; font-size:13px; }
  .grid2 { display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:16px; margin-bottom:16px; }
  .sec { background:#fff; border:1px solid var(--line); border-radius:14px; padding:16px 18px; }
  .sec h3 { margin:0 0 10px; font-size:15px; display:flex; align-items:center; gap:8px; }
  .sec h3 .btn { margin-inline-start:auto; padding:5px 12px; font-size:12px; }
  .kv { display:grid; grid-template-columns: 140px 1fr; border-top:1px solid var(--line); align-items:center; }
  .kv:first-of-type { border-top:0; }
  .kv > div { padding:9px 2px; }
  .kv .k { color:var(--muted); font-size:13px; }
  .kv .v.edit { cursor:pointer; border-radius:8px; padding-inline:8px; }
  .kv .v.edit:hover { background:var(--teal-50); }
  .kv .v.edit::after { content:" ✎"; color:#B8C2CF; font-size:12px; }
  .ltr { direction:ltr; unicode-bidi:isolate; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; }
  .chip { display:inline-flex; align-items:center; gap:6px; padding:5px 6px; padding-inline-start:12px; border-radius:99px; background:#F1F5F9; font-size:13px; }
  .chip small { color:var(--muted); }
  .chip > span, .kv .v { unicode-bidi:plaintext; }
  .x { border:0; background:none; color:#A0AEC0; cursor:pointer; padding:2px 6px; border-radius:6px; font-size:12px; }
  .x:hover { color:var(--red); background:#FFF5F5; }
  .study { border-top:1px solid var(--line); padding:12px 0; }
  .study:first-of-type { border-top:0; padding-top:0; }
  .study .top { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .study .rep { margin-top:6px; color:#334155; font-size:13px; line-height:1.7; cursor:pointer; border-radius:8px; padding:4px 6px; unicode-bidi:plaintext; }
  .study .rep:hover { background:var(--teal-50); }
  .muted { color:var(--muted); }
  dialog { border:0; border-radius:16px; padding:0; width:min(520px, 94vw); box-shadow:0 24px 64px rgba(15,42,67,.25); }
  dialog::backdrop { background:rgba(15,42,67,.35); }
  dialog form { padding:22px; display:grid; gap:12px; }
  dialog h3 { margin:0; font-size:17px; }
  dialog textarea { min-height:90px; unicode-bidi:plaintext; }
  dialog .row { display:flex; gap:8px; justify-content:flex-end; align-items:center; margin-top:4px; }
  .fields { display:grid; grid-template-columns:1fr 1fr; gap:12px; max-height:64vh; overflow:auto; padding:2px; }
  .fields label { display:grid; gap:5px; font-size:13px; font-weight:600; }
  .fields label.full { grid-column:1 / -1; }
  .err { color:var(--red); font-size:13px; min-height:18px; }
  .toggle { display:flex; align-items:center; gap:6px; color:var(--muted); font-size:13px; }
  .toggle input { width:auto; }
  .toast { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:var(--navy); color:#fff; padding:10px 18px; border-radius:10px; display:none; z-index:10; }
  @media (max-width: 820px) { .wrap { grid-template-columns: 1fr; } aside { position:static; height:auto; } main { padding:18px; } .fields { grid-template-columns:1fr; } }
</style>
</head>
<body>
<div class="wrap">
  <aside>
    <div class="brand"><div class="logo"><svg width="22" height="22" viewBox="0 0 64 64"><path d="M10 34h11l5-12 8 22 6-14 3 4h11" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div><b id="brandT"></b><small id="brandS"></small></div></div>
    <div class="lang"><button data-l="ar">عربي</button><button data-l="en">English</button></div>
    <nav id="nav"></nav>
  </aside>
  <main id="main"></main>
</div>
<dialog id="dlg"><form method="dialog" id="dlgForm">
  <h3 id="dlgTitle"></h3>
  <div id="dlgBody"></div>
  <div class="err" id="dlgErr"></div>
  <div class="row"><button class="btn" value="cancel" id="dlgCancel"></button><button class="btn primary" value="save" id="dlgSave"></button></div>
</form></dialog>
<div class="toast" id="toast"></div>
<script>
let lang = "ar";
try { lang = localStorage.getItem("taree-db-lang") || "ar"; } catch {}
const L = (ar, en) => lang === "ar" ? ar : en;
const V = {
  FEMALE: ["أنثى", "Female"], MALE: ["ذكر", "Male"], SEVERE: ["شديدة", "Severe"], MODERATE: ["متوسطة", "Moderate"], MILD: ["خفيفة", "Mild"], LIFE_THREATENING: ["خطيرة جداً", "Life-threatening"],
  MRI: ["رنين مغناطيسي", "MRI"], CT: ["أشعة مقطعية", "CT"], XRAY: ["أشعة سينية", "X-ray"], ULTRASOUND: ["موجات فوق صوتية", "Ultrasound"], OTHER: ["أخرى", "Other"],
  PATIENT: ["مريض", "Patient"], DOCTOR: ["طبيب", "Doctor"], RADIOLOGIST: ["أخصائي أشعة", "Radiologist"], ADMIN: ["مشرف", "Admin"],
  AVAILABLE: ["متاحة", "Available"], QUARANTINED: ["معزولة للمراجعة", "Quarantined"], REJECTED: ["مرفوضة", "Rejected"],
  ACTIVE: ["فعّال", "Active"], PENDING: ["بانتظار التوثيق", "Pending"], SUSPENDED: ["موقوف", "Suspended"], REVOKED: ["ملغى", "Revoked"],
  EMERGENCY: ["الطوارئ", "Emergency"], RADIOLOGY: ["الأشعة", "Radiology"], PHYSICIAN: ["طبيب", "Physician"],
};
const tr = (v) => V[v] ? V[v][lang === "ar" ? 0 : 1] : v;
const msg = (m) => { const p = String(m).split(" | "); return p.length === 2 ? (lang === "ar" ? p[0] : p[1]) : m; };
let view = { kind: "patients" }, counts = {};
const colsCache = {};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const day = (v) => v ? new Date(v).toLocaleDateString("en-CA") : "";
const dt = (v) => v ? day(v) + "  " + new Date(v).toTimeString().slice(0, 5) : "";
const age = (d) => d ? Math.floor((Date.now() - new Date(d)) / 31557600000) : "";
const dash = '<span class="muted">—</span>';
const yesno = (b) => b ? '<span class="pill yes">' + L("نعم", "Yes") + '</span>' : '<span class="pill no">' + L("لا", "No") + '</span>';
function toast(m) { const t = $("toast"); t.textContent = m; t.style.display = "block"; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = "none", 2200); }
// Served at "/" on this computer, or under "/manage" on the website.
const BASE = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname;
async function api(path, payload) {
  const r = await fetch(BASE + path, payload ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) } : undefined);
  const j = await r.json(); if (!r.ok) throw new Error(msg(j.error || "Error")); return j;
}
async function cols(t) { return colsCache[t] ||= await api("/api/columns?t=" + t); }

/* ---------- frame ---------- */
function setLang(l) {
  lang = l; try { localStorage.setItem("taree-db-lang", l); } catch {}
  document.documentElement.lang = l; document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
  document.title = L("مستخدمو عون", "Aoun users");
  $("brandT").textContent = L("عون", "Aoun"); $("brandS").textContent = L("إدارة المستخدمين", "User management");
  $("dlgCancel").textContent = L("إلغاء", "Cancel");
  for (const b of document.querySelectorAll(".lang button")) b.classList.toggle("on", b.dataset.l === l);
  nav(); render();
}
for (const b of document.querySelectorAll(".lang button")) b.onclick = () => setLang(b.dataset.l);
async function nav() {
  const t = await api("/api/tables");
  counts = Object.fromEntries(t.map((x) => [x.name, x.count]));
  const staffN = (await api("/api/staff")).length;
  const it = (k, label, icon, n) => '<button class="item' + ((view.kind === k || view.kind === (k === "patients" ? "patient" : "pro")) ? " on" : "") + '" data-k="' + k + '"><span>' + icon + '</span><span>' + label + '</span><span class="n">' + n + '</span></button>';
  $("nav").innerHTML = it("patients", L("المرضى", "Patients"), "👤", counts.Patient ?? 0) + it("staff", L("الأطباء", "Doctors"), "🩺", staffN);
  for (const b of $("nav").querySelectorAll(".item")) b.onclick = () => go({ kind: b.dataset.k });
}
function go(v) { view = v; nav(); render(); window.scrollTo(0, 0); }
function render() {
  if (view.kind === "patients") return patients();
  if (view.kind === "patient") return patient(view.id);
  if (view.kind === "staff") return staff();
  return pro(view.id);
}

/* ---------- dialogs ---------- */
function dialog(title, bodyHtml, saveLabel, onSave) {
  $("dlgTitle").textContent = title; $("dlgBody").innerHTML = bodyHtml; $("dlgErr").textContent = ""; $("dlgSave").textContent = saveLabel;
  const d = $("dlg");
  $("dlgSave").onclick = async (e) => {
    e.preventDefault();
    try { await onSave(); d.close(); } catch (err) { $("dlgErr").textContent = err.message; }
  };
  d.showModal();
  setTimeout(() => d.querySelector("input,textarea,select")?.focus(), 50);
}
function field(label, t, id, col, value, shown, cls = "") {
  const disp = shown ?? (value === null || value === undefined || value === "" ? dash : esc(tr(value)));
  return '<div class="kv"><div class="k">' + label + '</div><div class="v edit ' + cls + '" data-t="' + t + '" data-id="' + esc(id) + '" data-c="' + col + '" data-v="' + esc(value ?? "") + '" data-l="' + esc(label) + '">' + disp + '</div></div>';
}
const ro = (label, value) => '<div class="kv"><div class="k">' + label + '</div><div class="v">' + (value === null || value === undefined || value === "" ? dash : value) + '</div></div>';
function wireEdits() { for (const el of $("main").querySelectorAll(".edit[data-t]")) el.onclick = () => edit(el.dataset.t, el.dataset.id, el.dataset.c, el.dataset.v, el.dataset.l); }
async function edit(t, id, col, value, label) {
  if (t === "PHONE") return dialog(label, '<input id="ev" class="ltr" value="' + esc(value) + '" placeholder="05XXXXXXXX">', L("حفظ", "Save"), async () => {
    await api("/api/patient-phone", { patientId: id, phone: $("ev").value.trim() }); toast(L("تم الحفظ ✓", "Saved ✓")); render();
  });
  const c = (await cols(t)).find((x) => x.name === col);
  let inp;
  if (c.type === "boolean") inp = '<select id="ev"><option value="true"' + (value === "true" ? " selected" : "") + '>' + L("نعم", "Yes") + '</option><option value="false"' + (value !== "true" ? " selected" : "") + '>' + L("لا", "No") + '</option></select>';
  else if (c.options) inp = '<select id="ev">' + c.options.map((o) => '<option value="' + esc(o) + '"' + (o === value ? " selected" : "") + '>' + esc(tr(o)) + '</option>').join("") + '</select>';
  else if (c.type === "date" || /^timestamp/.test(c.type)) inp = '<input id="ev" type="date" value="' + esc(value ? String(value).slice(0, 10) : "") + '">';
  else inp = '<textarea id="ev">' + esc(value ?? "") + '</textarea>';
  dialog(label, inp, L("حفظ", "Save"), async () => {
    await api("/api/update", { t, id, col, value: $("ev").value, isNull: false }); toast(L("تم الحفظ ✓", "Saved ✓")); render();
  });
}
async function removeRow(t, id) {
  if (!confirm(L("هل تريد الحذف نهائياً؟", "Delete permanently?"))) return;
  try { await api("/api/delete", { t, id }); toast(L("تم الحذف", "Deleted")); render(); } catch (e) { alert(e.message); }
}
const inp = (name, label, attrs = "", cls = "") => '<label class="' + cls + '">' + label + '<input name="' + name + '" ' + attrs + '></label>';
const sel = (name, label, opts, cls = "") => '<label class="' + cls + '">' + label + '<select name="' + name + '">' + opts.map(([v, t]) => '<option value="' + esc(v) + '">' + esc(t) + '</option>').join("") + '</select></label>';
const formVals = () => Object.fromEntries([...$("dlgBody").querySelectorAll("[name]")].map((e) => [e.name, e.value.trim()]));
const searchBox = (val, ph) => '<div class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" placeholder="' + ph + '" value="' + esc(val) + '"></div>';

/* ---------- patients ---------- */
async function patients(q = view.q || "") {
  view.q = q;
  const list = await api("/api/patients?q=" + encodeURIComponent(q));
  let h = '<div class="title"><h2>' + L("المرضى", "Patients") + '</h2></div><p class="desc">' + L("اضغط على أي مريض لعرض كل معلوماته وتعديلها.", "Click a patient to see and edit all their information.") + '</p>';
  h += '<div class="bar">' + searchBox(q, L("بحث بالاسم أو الجوال…", "Search by name or mobile…")) + '<button class="btn primary" id="add">+ ' + L("إضافة مريض", "Add patient") + '</button><span class="count">' + list.length + '</span></div>';
  if (!list.length) h += '<div class="card"><div class="empty">' + L("لا يوجد مرضى", "No patients") + '</div></div>';
  else h += '<div class="card"><table><thead><tr><th>' + L("الاسم", "Name") + '</th><th>' + L("رقم الهوية", "ID") + '</th><th>' + L("الجوال", "Mobile") + '</th><th>' + L("العمر", "Age") + '</th><th>' + L("الجنس", "Sex") + '</th><th>' + L("فصيلة الدم", "Blood") + '</th><th>' + L("الأشعة", "Imaging") + '</th></tr></thead><tbody>' +
    list.map((p) => '<tr data-id="' + p.id + '"><td><b>' + esc(lang === "ar" ? p.fullNameAr : p.fullNameEn) + '</b><div class="sub">' + esc(lang === "ar" ? p.fullNameEn : p.fullNameAr) + '</div></td><td class="ltr">' + esc(p.maskedId) + '</td><td class="ltr">' + esc(p.phone || "—") + '</td><td>' + age(p.dateOfBirth) + '</td><td>' + esc(tr(p.sex)) + '</td><td class="ltr">' + esc(p.bloodType || "—") + '</td><td><span class="pill">' + p.studies + '</span></td></tr>').join("") + '</tbody></table></div>';
  $("main").innerHTML = h;
  let tm; $("q").oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => patients(e.target.value).then(() => { const x = $("q"); x.focus(); x.setSelectionRange(9e9, 9e9); }), 300); };
  for (const r of $("main").querySelectorAll("tr[data-id]")) r.onclick = () => go({ kind: "patient", id: r.dataset.id });
  $("add").onclick = () => dialog(L("إضافة مريض", "Add patient"), '<div class="fields">' +
    inp("fullNameAr", L("الاسم بالعربي *", "Name in Arabic *")) + inp("fullNameEn", L("الاسم بالإنجليزي *", "Name in English *"), 'class="ltr"') +
    inp("nationalId", L("رقم الهوية / الإقامة *", "National ID / Iqama *"), 'class="ltr" maxlength="10" placeholder="1XXXXXXXXX"') + inp("phone", L("رقم الجوال *", "Mobile *"), 'class="ltr" maxlength="10" placeholder="05XXXXXXXX"') +
    inp("dateOfBirth", L("تاريخ الميلاد *", "Date of birth *"), 'type="date"') + sel("sex", L("الجنس *", "Sex *"), [["FEMALE", tr("FEMALE")], ["MALE", tr("MALE")]]) +
    sel("bloodType", L("فصيلة الدم", "Blood type"), [["", "—"], ...["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => [b, b])]) + '<span></span>' +
    inp("emergencyContactName", L("جهة الاتصال للطوارئ", "Emergency contact")) + inp("emergencyContactRel", L("صلة القرابة", "Relation")) +
    inp("emergencyContactPhone", L("جوال جهة الاتصال", "Contact mobile"), 'class="ltr" placeholder="05XXXXXXXX"', "full") + '</div>',
    L("إضافة", "Add"), async () => { const r = await api("/api/patients/add", formVals()); toast(L("تمت إضافة المريض ✓", "Patient added ✓")); go({ kind: "patient", id: r.id }); });
}
async function patient(id) {
  const d = await api("/api/patient?id=" + encodeURIComponent(id));
  const p = d.patient, u = d.user, m = d.profile;
  const name = lang === "ar" ? p.fullNameAr : p.fullNameEn;
  let h = '<button class="back" id="back">' + L("→ رجوع إلى المرضى", "← Back to patients") + '</button>';
  h += '<div class="hero"><div class="avatar">' + esc((name || "?").trim()[0]) + '</div><div><h2>' + esc(name) + '</h2><p><span class="ltr">' + esc(p.maskedId) + '</span> · ' + esc(tr(p.sex)) + ' · ' + L("العمر", "Age") + ' ' + age(p.dateOfBirth) + (m?.bloodType ? ' · ' + L("فصيلة الدم", "Blood") + ' <span class="ltr">' + esc(m.bloodType) + '</span>' : "") + '</p></div></div>';
  h += '<div class="grid2"><div class="sec"><h3>👤 ' + L("البيانات الشخصية", "Personal information") + '</h3>' +
    field(L("الاسم بالعربي", "Name (Arabic)"), "Patient", p.id, "fullNameAr", p.fullNameAr) + field(L("الاسم بالإنجليزي", "Name (English)"), "Patient", p.id, "fullNameEn", p.fullNameEn) +
    field(L("تاريخ الميلاد", "Date of birth"), "Patient", p.id, "dateOfBirth", p.dateOfBirth, esc(day(p.dateOfBirth))) + field(L("الجنس", "Sex"), "Patient", p.id, "sex", p.sex) +
    ro(L("رقم الهوية", "National ID"), '<span class="ltr">' + esc(p.maskedId) + '</span> <span class="sub">' + L("(محفوظ مشفّراً)", "(stored encrypted)") + '</span>') + ro(L("تاريخ التسجيل", "Registered"), esc(dt(p.createdAt))) + '</div>';
  h += '<div class="sec"><h3>🔐 ' + L("حساب الدخول", "Login account") + '</h3>' +
    ro(L("طريقة الدخول", "Sign-in"), L("رقم الهوية + الجوال + رمز التحقق", "National ID + mobile + verification code")) +
    field(L("جوال الدخول", "Login mobile"), "PHONE", p.id, "phone", d.loginPhone || u?.phone, null, "ltr") +
    ro(L("رمز التحقق", "Verification code"), '<span class="ltr">123456</span>') +
    (u ? field(L("الحساب مفعّل", "Account active"), "User", u.id, "isActive", String(u.isActive), yesno(u.isActive)) + ro(L("تاريخ إنشاء الحساب", "Account created"), esc(dt(u.createdAt))) : ro(L("الحساب", "Account"), L("يُنشأ عند أول دخول", "Created on first sign-in"))) + '</div></div>';
  h += '<div class="grid2"><div class="sec"><h3>🩸 ' + L("الملف الطبي والطوارئ", "Medical & emergency") + '</h3>' + (m ?
    field(L("فصيلة الدم", "Blood type"), "MedicalProfile", m.id, "bloodType", m.bloodType, null, "ltr") +
    field(L("جهة الاتصال", "Emergency contact"), "MedicalProfile", m.id, "emergencyContactName", m.emergencyContactName) +
    field(L("صلة القرابة", "Relation"), "MedicalProfile", m.id, "emergencyContactRel", m.emergencyContactRel) +
    field(L("جوال جهة الاتصال", "Contact mobile"), "MedicalProfile", m.id, "emergencyContactPhone", m.emergencyContactPhone, null, "ltr") : '<p class="muted">—</p>') + '</div>';
  h += '<div class="sec"><h3>💗 ' + L("الأمراض المزمنة", "Chronic diseases") + ' <button class="btn" id="addCond">+ ' + L("إضافة", "Add") + '</button></h3><div class="chips">' +
    (d.conditions.length ? d.conditions.map((c) => '<span class="chip"><span>' + esc(c.name) + '</span>' + '<button class="x" data-del-t="ChronicCondition" data-del="' + c.id + '">✕</button></span>').join("") : '<span class="muted">' + L("لا توجد", "None") + '</span>') + '</div>';
  h += '<h3 style="margin-top:18px">⚠️ ' + L("الحساسية", "Allergies") + ' <button class="btn" id="addAll">+ ' + L("إضافة", "Add") + '</button></h3><div class="chips">' +
    (d.allergies.length ? d.allergies.map((a) => '<span class="chip"><span>' + esc(a.substance) + '</span>' + (a.severity ? ' <small>' + esc(tr(a.severity)) + '</small>' : "") + '<button class="x" data-del-t="Allergy" data-del="' + a.id + '">✕</button></span>').join("") : '<span class="muted">' + L("لا توجد", "None") + '</span>') + '</div></div></div>';
  h += '<div class="sec" style="margin-bottom:16px"><h3>🩻 ' + L("الأشعة", "Imaging") + ' (' + d.studies.length + ')</h3>' + (d.studies.length ? d.studies.map((s) =>
    '<div class="study"><div class="top"><b>' + esc(tr(s.modality)) + '</b><span class="pill">' + esc(tr(s.status)) + '</span><span class="muted">' + esc(L(s.hospital, s.hospitalEn) || "") + ' · ' + esc(day(s.examDate)) + ' · <span class="ltr">' + esc(s.referenceNumber) + '</span></span></div>' +
    (s.files ? '<div class="sub" style="margin-top:4px">📎 ' + esc(s.files) + '</div>' : "") +
    (s.reportId ? '<div class="rep edit" data-t="RadiologyReport" data-id="' + s.reportId + '" data-c="text" data-v="' + esc(s.report) + '" data-l="' + L("التقرير", "Report") + '">📝 ' + esc(s.report) + '</div>' : "") + '</div>').join("")
    : '<p class="muted">' + L("لا توجد أشعة.", "No imaging yet.") + '</p>') + '</div>';
  if (d.access.length) h += '<div class="sec"><h3>👁️ ' + L("من فتح السجل", "Who opened the record") + '</h3>' + d.access.map((a) => ro(esc(day(a.createdAt)), esc(L(a.doctor, a.doctorEn) || "") + ' <span class="muted">· ' + esc(L(a.hospital, a.hospitalEn) || "") + '</span>')).join("") + '</div>';
  $("main").innerHTML = h;
  $("back").onclick = () => go({ kind: "patients" });
  wireEdits();
  for (const b of $("main").querySelectorAll("[data-del]")) b.onclick = () => removeRow(b.dataset.delT, b.dataset.del);
  $("addCond").onclick = () => dialog(L("إضافة مرض مزمن", "Add chronic disease"), '<div class="fields">' + inp("name", L("اسم المرض", "Disease"), "", "full") + '</div>', L("إضافة", "Add"), async () => {
    const v = formVals(); if (!v.name) throw new Error(L("اكتب اسم المرض", "Enter the disease"));
    await api("/api/insert", { t: "ChronicCondition", values: { patientId: p.id, source: "SELF_REPORTED", name: v.name } }); toast(L("تمت الإضافة ✓", "Added ✓")); render();
  });
  $("addAll").onclick = () => dialog(L("إضافة حساسية", "Add allergy"), '<div class="fields">' + inp("substance", L("الحساسية", "Allergy")) + sel("severity", L("الشدة", "Severity"), ["MILD", "MODERATE", "SEVERE", "LIFE_THREATENING"].map((s) => [s, tr(s)])) + '</div>', L("إضافة", "Add"), async () => {
    const v = formVals(); if (!v.substance) throw new Error(L("اكتب الحساسية", "Enter the allergy"));
    await api("/api/insert", { t: "Allergy", values: { patientId: p.id, source: "SELF_REPORTED", substance: v.substance, severity: v.severity } }); toast(L("تمت الإضافة ✓", "Added ✓")); render();
  });
}

/* ---------- doctors ---------- */
async function staff() {
  const list = await api("/api/staff");
  let h = '<div class="title"><h2>' + L("الأطباء", "Doctors") + '</h2></div><p class="desc">' + L("اضغط على أي طبيب لعرض معلوماته وتعديلها وتغيير كلمة المرور.", "Click a doctor to see and edit their information or change the password.") + '</p>';
  h += '<div class="bar"><button class="btn primary" id="add">+ ' + L("إضافة طبيب", "Add doctor") + '</button><span class="count">' + list.length + '</span></div>';
  h += '<div class="card"><table><thead><tr><th>' + L("الاسم", "Name") + '</th><th>' + L("الدور", "Role") + '</th><th>' + L("المستشفى", "Hospital") + '</th><th>' + L("البريد (للدخول)", "Email (login)") + '</th><th>' + L("الحساب", "Account") + '</th></tr></thead><tbody>' +
    list.map((s) => '<tr data-id="' + s.id + '"><td><b>' + esc(lang === "ar" ? s.fullNameAr : s.fullNameEn) + '</b><div class="sub">' + esc(s.specialty || "") + '</div></td><td>' + esc(tr(s.role)) + '</td><td>' + esc(L(s.hospitals, s.hospitalsEn) || "—") + '</td><td class="ltr">' + esc(s.email || "") + '</td><td>' + (s.isActive ? '<span class="pill yes">' + L("مفعّل", "Active") + '</span>' : '<span class="pill no">' + L("موقوف", "Disabled") + '</span>') + '</td></tr>').join("") + '</tbody></table></div>';
  $("main").innerHTML = h;
  for (const r of $("main").querySelectorAll("tr[data-id]")) r.onclick = () => go({ kind: "pro", id: r.dataset.id });
  $("add").onclick = async () => {
    const hs = await api("/api/hospitals");
    dialog(L("إضافة طبيب", "Add doctor"), '<div class="fields">' +
      inp("fullNameAr", L("الاسم بالعربي *", "Name in Arabic *"), 'placeholder="' + L("د. ", "") + '"') + inp("fullNameEn", L("الاسم بالإنجليزي *", "Name in English *"), 'class="ltr" placeholder="Dr. "') +
      inp("email", L("البريد (للدخول) *", "Email (login) *"), 'class="ltr" type="email"') + inp("password", L("كلمة المرور *", "Password *"), 'class="ltr" placeholder="' + L("8 أحرف على الأقل", "at least 8 characters") + '"') +
      sel("role", L("الدور *", "Role *"), [["DOCTOR", L("طبيب طوارئ", "Emergency doctor")], ["RADIOLOGIST", L("أخصائي أشعة", "Radiologist")]]) +
      sel("hospitalId", L("المستشفى *", "Hospital *"), hs.map((x) => [x.id, lang === "ar" ? x.nameAr : x.nameEn])) +
      inp("specialty", L("التخصص", "Specialty")) + inp("licenseNumber", L("رقم الترخيص", "License number"), 'class="ltr"') + '</div>',
      L("إضافة", "Add"), async () => { const r = await api("/api/staff/add", formVals()); toast(L("تمت إضافة الطبيب ✓", "Doctor added ✓")); go({ kind: "pro", id: r.id }); });
  };
}
async function pro(id) {
  const d = await api("/api/staff-one?id=" + encodeURIComponent(id));
  const p = d.pro, u = d.user;
  const name = lang === "ar" ? p.fullNameAr : p.fullNameEn;
  let h = '<button class="back" id="back">' + L("→ رجوع إلى الأطباء", "← Back to doctors") + '</button>';
  h += '<div class="hero"><div class="avatar">🩺</div><div><h2>' + esc(name) + '</h2><p>' + esc(tr(u?.role)) + (d.affiliations[0] ? ' · ' + esc(L(d.affiliations[0].hospital, d.affiliations[0].hospitalEn)) : "") + '</p></div></div>';
  h += '<div class="grid2"><div class="sec"><h3>🪪 ' + L("البيانات المهنية", "Professional information") + '</h3>' +
    field(L("الاسم بالعربي", "Name (Arabic)"), "HealthcareProfessional", p.id, "fullNameAr", p.fullNameAr) + field(L("الاسم بالإنجليزي", "Name (English)"), "HealthcareProfessional", p.id, "fullNameEn", p.fullNameEn) +
    field(L("التخصص", "Specialty"), "HealthcareProfessional", p.id, "specialty", p.specialty) +
    field(L("رقم الترخيص", "License number"), "HealthcareProfessional", p.id, "licenseNumber", p.licenseNumber, null, "ltr") +
    field(L("الترخيص موثّق", "License verified"), "HealthcareProfessional", p.id, "licenseVerified", String(p.licenseVerified), yesno(p.licenseVerified)) + '</div>';
  h += '<div class="sec"><h3>🔐 ' + L("حساب الدخول", "Login account") + (u ? ' <button class="btn" id="pw">' + L("تغيير كلمة المرور", "Change password") + '</button>' : "") + '</h3>' + (u ?
    field(L("البريد (للدخول)", "Email (login)"), "User", u.id, "email", u.email, null, "ltr") +
    ro(L("كلمة المرور", "Password"), '<span class="muted">•••••••• — ' + L("مشفّرة، غيّرها من الزر", "encrypted, change it with the button") + '</span>') +
    field(L("الدور", "Role"), "User", u.id, "role", u.role) +
    field(L("الحساب مفعّل", "Account active"), "User", u.id, "isActive", String(u.isActive), yesno(u.isActive)) +
    ro(L("تاريخ إنشاء الحساب", "Account created"), esc(dt(u.createdAt))) : '<p class="muted">—</p>') + '</div></div>';
  h += '<div class="grid2"><div class="sec"><h3>🏥 ' + L("جهة العمل", "Workplace") + '</h3>' + (d.affiliations.length ? d.affiliations.map((a) =>
    ro(L("المستشفى", "Hospital"), esc(L(a.hospital, a.hospitalEn))) + field(L("القسم", "Department"), "ProfessionalAffiliation", a.id, "department", a.department) + field(L("الحالة", "Status"), "ProfessionalAffiliation", a.id, "status", a.status)).join("") : '<p class="muted">—</p>') + '</div>';
  h += '<div class="sec"><h3>👁️ ' + L("السجلات التي فتحها", "Records opened") + '</h3>' + (d.access.length ? d.access.map((a) => ro(esc(day(a.createdAt)), esc(L(a.patient, a.patientEn) || ""))).join("") : '<p class="muted">' + L("لم يفتح أي سجل بعد.", "No records opened yet.") + '</p>') + '</div></div>';
  $("main").innerHTML = h;
  $("back").onclick = () => go({ kind: "staff" });
  wireEdits();
  if ($("pw")) $("pw").onclick = () => dialog(L("تغيير كلمة المرور", "Change password"), '<div class="fields">' + inp("password", L("كلمة المرور الجديدة (8 أحرف على الأقل)", "New password (at least 8 characters)"), 'class="ltr"', "full") + '</div>', L("حفظ", "Save"), async () => {
    await api("/api/password", { userId: u.id, password: formVals().password }); toast(L("تم تغيير كلمة المرور ✓", "Password changed ✓"));
  });
}
setLang(lang);
</script>
</body>
</html>`;
