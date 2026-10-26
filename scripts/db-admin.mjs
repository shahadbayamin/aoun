/**
 * Aoun database viewer/editor — a small local web page on http://localhost:3001
 * Started automatically by scripts/launcher.mjs together with the website.
 * Listens on 127.0.0.1 only (not reachable from other devices).
 */
import http from "node:http";
import crypto from "node:crypto";

const MAIN = [
  ["Patient", "المرضى"],
  ["MedicalProfile", "الملف الطبي وجهة الاتصال"],
  ["ChronicCondition", "الأمراض المزمنة"],
  ["Allergy", "الحساسية"],
  ["Medication", "الأدوية"],
  ["ImagingStudy", "الأشعة"],
  ["RadiologyReport", "تقارير الأشعة"],
  ["ImagingFile", "ملفات الأشعة"],
  ["Hospital", "المستشفيات"],
  ["HealthcareProfessional", "الكادر الطبي"],
  ["User", "حسابات الدخول"],
];
const READ_ONLY_TABLES = new Set(["AuditLog", "_prisma_migrations", "_taree_migrations"]);
const HIDDEN_TABLES = new Set(["_prisma_migrations", "_taree_migrations"]);
/** Columns that are hashes, keys or encrypted values — changing them would break the app. */
const PROTECTED_COLS = new Set(["id", "passwordHash", "apiSecretEnc", "identifierHash", "storageKey", "sha256", "contentHash", "tokenHash", "shortCodeHash", "codeHash", "hash", "prevHash", "createdAt", "updatedAt"]);
const COL_AR = {
  fullNameAr: "الاسم بالعربي", fullNameEn: "الاسم بالإنجليزي", dateOfBirth: "تاريخ الميلاد", sex: "الجنس", maskedId: "الهوية (مخفية)",
  bloodType: "فصيلة الدم", emergencyContactName: "اسم جهة الاتصال", emergencyContactPhone: "جوال جهة الاتصال", emergencyContactRel: "صلة القرابة",
  medicalAlerts: "تنبيهات طبية", noKnownAllergies: "لا توجد حساسية معروفة", name: "الاسم", substance: "المادة", reaction: "التفاعل", severity: "الشدة",
  dose: "الجرعة", frequency: "التكرار", highRisk: "عالي الخطورة", active: "فعّال", patientId: "المريض", hospitalId: "المستشفى", sourceHospitalId: "المستشفى المصدر",
  modality: "نوع الأشعة", bodyRegion: "المنطقة", examDate: "تاريخ الفحص", radiologistName: "أخصائي الأشعة", status: "الحالة", referenceNumber: "الرقم المرجعي",
  text: "نص التقرير", author: "الكاتب", fileName: "اسم الملف", mimeType: "نوع الملف", sizeBytes: "الحجم (بايت)", nameAr: "الاسم بالعربي", nameEn: "الاسم بالإنجليزي",
  city: "المدينة", email: "البريد", phone: "الجوال", displayName: "الاسم الظاهر", role: "الدور", isActive: "نشط", createdAt: "تاريخ الإنشاء", updatedAt: "آخر تحديث",
  studyId: "الأشعة", source: "المصدر", code: "الرمز", type: "النوع", licenseNumber: "رقم الترخيص", profession: "المهنة", specialty: "التخصص",
};

const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';
const cuid = () => "c" + Date.now().toString(36) + crypto.randomBytes(8).toString("hex");

export async function startDbAdmin({ databaseUrl, port = 3001, log = console.log }) {
  const { default: pgLib } = await import("pg");
  const pool = new pgLib.Pool({ connectionString: databaseUrl, max: 4 });

  async function meta() {
    const t = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
    return t.rows.map((r) => r.table_name).filter((n) => !HIDDEN_TABLES.has(n));
  }
  async function columns(table) {
    const r = await pool.query(
      `SELECT c.column_name AS name, c.data_type AS type, c.udt_name AS udt, c.is_nullable='YES' AS nullable, c.column_default AS def,
              (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname = c.udt_name) AS "enumValues"
         FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=$1 ORDER BY c.ordinal_position`, [table]);
    return r.rows.map((c) => ({ ...c, label: COL_AR[c.name] || null, protected: PROTECTED_COLS.has(c.name), isArray: c.type === "ARRAY" }));
  }
  async function checkTable(table) {
    const all = await meta();
    if (!all.includes(table)) throw Object.assign(new Error("جدول غير معروف"), { status: 400 });
  }
  async function lookups() {
    const out = {}, refs = {};
    const add = async (sql, keys) => {
      try {
        const rows = (await pool.query(sql)).rows;
        for (const r of rows) out[r.id] = r.label;
        for (const k of keys) refs[k] = rows;
      } catch {}
    };
    await add(`SELECT id, "fullNameAr" AS label FROM "Patient" ORDER BY "fullNameAr"`, ["patientId"]);
    await add(`SELECT id, "nameAr" AS label FROM "Hospital" ORDER BY "nameAr"`, ["hospitalId", "sourceHospitalId"]);
    await add(`SELECT id, "referenceNumber" AS label FROM "ImagingStudy" ORDER BY "createdAt" DESC`, ["studyId"]);
    return { out, refs };
  }

  const api = {
    async "GET /api/tables"() {
      const names = await meta();
      const counts = {};
      for (const n of names) counts[n] = (await pool.query(`SELECT count(*)::int AS n FROM ${q(n)}`)).rows[0].n;
      const mainNames = MAIN.map((m) => m[0]);
      return {
        main: MAIN.filter(([n]) => names.includes(n)).map(([n, ar]) => ({ name: n, ar, count: counts[n] })),
        system: names.filter((n) => !mainNames.includes(n)).map((n) => ({ name: n, count: counts[n], readOnly: READ_ONLY_TABLES.has(n) })),
      };
    },
    async "GET /api/rows"(u) {
      const table = u.searchParams.get("table");
      await checkTable(table);
      const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
      const search = (u.searchParams.get("q") || "").trim();
      const cols = await columns(table);
      const where = search ? `WHERE ${q(table)}::text ILIKE $1` : "";
      const params = search ? ["%" + search + "%"] : [];
      const order = cols.some((c) => c.name === "createdAt") ? `ORDER BY "createdAt" DESC` : cols.some((c) => c.name === "id") ? `ORDER BY "id"` : "";
      const total = (await pool.query(`SELECT count(*)::int AS n FROM ${q(table)} ${where}`, params)).rows[0].n;
      const rows = (await pool.query(`SELECT * FROM ${q(table)} ${where} ${order} LIMIT 50 OFFSET ${offset}`, params)).rows;
      return { table, columns: cols, rows, total, offset, readOnly: READ_ONLY_TABLES.has(table), canInsert: !READ_ONLY_TABLES.has(table) && cols.some((c) => c.name === "id"), ...(await (async () => { const l = await lookups(); return { lookups: l.out, refs: l.refs }; })()) };
    },
    async "POST /api/update"(_u, body) {
      const { table, id, column, value } = body;
      await checkTable(table);
      if (READ_ONLY_TABLES.has(table)) throw Object.assign(new Error("هذا الجدول للقراءة فقط"), { status: 400 });
      const cols = await columns(table);
      const col = cols.find((c) => c.name === column);
      if (!col || col.protected) throw Object.assign(new Error("لا يمكن تعديل هذا الحقل"), { status: 400 });
      const touch = cols.some((c) => c.name === "updatedAt") ? `, "updatedAt" = now()` : "";
      const r = await pool.query(`UPDATE ${q(table)} SET ${q(column)} = $1 ${touch} WHERE "id" = $2`, [value, id]);
      return { updated: r.rowCount };
    },
    async "POST /api/insert"(_u, body) {
      const { table, values } = body;
      await checkTable(table);
      if (READ_ONLY_TABLES.has(table)) throw Object.assign(new Error("هذا الجدول للقراءة فقط"), { status: 400 });
      const cols = await columns(table);
      const data = { id: cuid() };
      for (const c of cols) {
        if (c.protected) continue;
        if (values[c.name] !== undefined && values[c.name] !== "") data[c.name] = values[c.name];
      }
      if (cols.some((c) => c.name === "updatedAt")) data.updatedAt = new Date();
      const keys = Object.keys(data);
      const r = await pool.query(`INSERT INTO ${q(table)} (${keys.map(q).join(",")}) VALUES (${keys.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING "id"`, keys.map((k) => data[k]));
      return { id: r.rows[0].id };
    },
    async "POST /api/delete"(_u, body) {
      const { table, id } = body;
      await checkTable(table);
      if (READ_ONLY_TABLES.has(table)) throw Object.assign(new Error("هذا الجدول للقراءة فقط"), { status: 400 });
      const r = await pool.query(`DELETE FROM ${q(table)} WHERE "id" = $1`, [id]);
      return { deleted: r.rowCount };
    },
  };

  const server = http.createServer(async (req, res) => {
    const send = (status, body, type = "application/json; charset=utf-8") => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-frame-options": "DENY" });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    try {
      // Only this computer's own browser may use the editor (blocks other websites and other devices).
      const host = (req.headers.host || "").split(":")[0];
      if (!["localhost", "127.0.0.1"].includes(host)) return send(403, { error: "forbidden" });
      if (req.method !== "GET") {
        const origin = req.headers.origin;
        if (!origin || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) || new URL(origin).port !== String(port)) return send(403, { error: "forbidden" });
      }
      const u = new URL(req.url, `http://localhost:${port}`);
      if (req.method === "GET" && u.pathname === "/") return send(200, PAGE, "text/html; charset=utf-8");
      const h = api[`${req.method} ${u.pathname}`];
      if (!h) return send(404, { error: "not found" });
      let body = {};
      if (req.method === "POST") {
        let raw = "";
        for await (const ch of req) { raw += ch; if (raw.length > 2_000_000) return send(413, { error: "too large" }); }
        body = JSON.parse(raw || "{}");
      }
      send(200, await h(u, body));
    } catch (e) {
      send(e.status || 400, { error: e.message || String(e) });
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  log(`database editor on http://localhost:${port}`);
  return { close: () => { server.close(); pool.end().catch(() => {}); } };
}

const PAGE = /* html */ `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>عون — قاعدة البيانات</title>
<style>
:root{--teal:#087F8C;--teal-50:#E8F5F6;--navy:#0F2A43;--muted:#5B6F85;--bg:#F7FAFC;--line:#E2E8F0;--red:#C53030;--red-50:#FFF1F1}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--navy);font-family:-apple-system,"Segoe UI",Tahoma,"IBM Plex Sans Arabic",sans-serif;font-size:14px}
header{display:flex;align-items:center;gap:12px;padding:12px 20px;background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.logo{width:36px;height:36px;border-radius:10px;background:var(--teal);display:grid;place-items:center}
h1{font-size:18px;margin:0}.sub{color:var(--muted);font-size:13px}
.wrap{display:grid;grid-template-columns:250px 1fr;min-height:calc(100vh - 61px)}
aside{background:#fff;border-inline-end:1px solid var(--line);padding:12px;overflow:auto}
aside h3{font-size:12px;color:var(--muted);margin:14px 8px 6px;font-weight:600}
aside button{display:flex;justify-content:space-between;width:100%;border:0;background:none;padding:8px 10px;border-radius:8px;cursor:pointer;font:inherit;color:inherit;text-align:start}
aside button:hover{background:var(--bg)}aside button.on{background:var(--teal-50);color:var(--teal);font-weight:600}
aside .n{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
details summary{cursor:pointer;font-size:12px;color:var(--muted);margin:14px 8px 6px;font-weight:600}
main{padding:18px 20px;overflow:hidden;min-width:0}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
.bar h2{margin:0 0 0 auto;font-size:18px}
input,select,textarea{font:inherit;color:inherit;border:1px solid var(--line);border-radius:8px;padding:7px 10px;background:#fff}
textarea{width:100%;min-height:90px}
.btn{border:1px solid var(--line);background:#fff;border-radius:8px;padding:7px 12px;cursor:pointer;font:inherit}
.btn.p{background:var(--teal);border-color:var(--teal);color:#fff}.btn.d{color:var(--red);border-color:#F3C7C7}
.btn:disabled{opacity:.5;cursor:default}
.note{background:#FFF8E6;border:1px solid #F5DFA3;border-radius:10px;padding:8px 12px;margin-bottom:12px;font-size:13px}
.tbl{overflow:auto;background:#fff;border:1px solid var(--line);border-radius:12px;max-height:calc(100vh - 190px)}
table{border-collapse:collapse;width:max-content;min-width:100%}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:start;vertical-align:top;max-width:280px}
th{position:sticky;top:0;background:#F1F5F9;font-size:12px;z-index:1;white-space:nowrap}
th small{display:block;color:var(--muted);font-weight:400;direction:ltr;text-align:start}
td{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
td.ed{cursor:pointer}td.ed:hover{background:var(--teal-50)}
td.lock{color:var(--muted)}
.null{color:#A0AEC0;font-style:italic}.ltr{direction:ltr;unicode-bidi:isolate}
.hint{color:var(--muted);font-size:12px;display:block}
.pager{display:flex;gap:8px;align-items:center;margin-top:10px;color:var(--muted)}
dialog{border:0;border-radius:14px;padding:0;width:min(520px,94vw);box-shadow:0 20px 50px rgba(15,42,67,.25)}
dialog::backdrop{background:rgba(15,42,67,.35)}
.dh{padding:14px 18px;border-bottom:1px solid var(--line);font-weight:600}.db{padding:16px 18px;display:grid;gap:12px;max-height:65vh;overflow:auto}
.df{padding:12px 18px;border-top:1px solid var(--line);display:flex;gap:8px;justify-content:flex-end}
label{display:grid;gap:4px;font-size:13px}label input,label select{width:100%}
.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:var(--navy);color:#fff;padding:10px 16px;border-radius:10px;display:none}
.empty{padding:30px;text-align:center;color:var(--muted)}
@media (max-width:760px){.wrap{grid-template-columns:1fr}aside{max-height:200px}}
</style></head><body>
<header><div class="logo"><svg width="24" height="24" viewBox="0 0 64 64"><path d="M10 34h11l5-12 8 22 6-14 3 4h11" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
<div><h1>قاعدة بيانات عون</h1><div class="sub">اضغط على أي خانة لتعديلها · التغييرات تظهر في الموقع بعد تحديث الصفحة</div></div></header>
<div class="wrap"><aside id="side"></aside><main id="main"><div class="empty">اختر جدولاً من القائمة</div></main></div>
<dialog id="dlg"><form method="dialog"><div class="dh" id="dt"></div><div class="db" id="dbody"></div><div class="df" id="dfoot"></div></form></dialog>
<div class="toast" id="toast"></div>
<script>
const $=(s)=>document.querySelector(s);
let state={table:null,offset:0,q:"",data:null};
const esc=(s)=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function toast(m){const t=$("#toast");t.textContent=m;t.style.display="block";clearTimeout(t._h);t._h=setTimeout(()=>t.style.display="none",2500)}
async function call(path,body){const r=await fetch(path,body?{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}:{});const j=await r.json();if(!r.ok)throw new Error(j.error||"خطأ");return j}
function fmt(v,c,lk){
  if(v===null||v===undefined)return '<span class="null">فارغ</span>';
  if(c.type==="boolean")return v?"✓ نعم":"✗ لا";
  if(c.isArray)return v.length?esc(v.join("، ")):'<span class="null">—</span>';
  if(c.type.startsWith("timestamp")||c.type==="date"){const d=new Date(v);return '<span class="ltr">'+(c.type==="date"?d.toISOString().slice(0,10):d.toLocaleString("en-GB"))+'</span>'}
  if(typeof v==="object")return '<span class="ltr">'+esc(JSON.stringify(v))+'</span>';
  const s=esc(v);if(lk&&lk[v])return esc(lk[v])+' <span class="hint ltr">'+s+'</span>';
  return /^[\\x00-\\x7F]*$/.test(String(v))?'<span class="ltr">'+s+'</span>':s;
}
async function loadSide(){
  const t=await call("/api/tables");
  const b=(x,label)=>'<button data-t="'+x.name+'" class="'+(state.table===x.name?"on":"")+'"><span>'+label+'</span><span class="n">'+x.count+'</span></button>';
  $("#side").innerHTML='<h3>البيانات الأساسية</h3>'+t.main.map(x=>b(x,x.ar)).join("")+
   '<details><summary>جداول النظام ('+t.system.length+')</summary>'+t.system.map(x=>b(x,'<span class="ltr">'+x.name+'</span>'+(x.readOnly?" 🔒":""))).join("")+'</details>';
  if(t.system.some(x=>x.name===state.table))$("#side details").open=true;
  document.querySelectorAll("#side button").forEach(e=>e.onclick=()=>{state={table:e.dataset.t,offset:0,q:"",data:null};loadSide();loadRows()});
}
async function loadRows(){
  const d=await call("/api/rows?table="+encodeURIComponent(state.table)+"&offset="+state.offset+"&q="+encodeURIComponent(state.q));
  state.data=d;
  const cols=d.columns;
  const main=$("#main");
  main.innerHTML='<div class="bar"><h2>'+esc(document.querySelector('#side button.on span')?.textContent||d.table)+'</h2>'+
   '<input id="q" placeholder="بحث…" value="'+esc(state.q)+'">'+(d.canInsert?'<button class="btn p" id="add">+ إضافة سجل</button>':'')+'</div>'+
   (d.readOnly?'<div class="note">🔒 هذا الجدول للقراءة فقط (سجل حماية لا يجوز تعديله).</div>':
     (["IdentityMapping","Session","OtpChallenge","QrSession","SyncJob"].includes(d.table)?'<div class="note">جدول نظام: تعديله قد يوقف بعض وظائف الموقع. عدّل فقط إذا كنت متأكداً.</div>':''))+
   (d.rows.length?'<div class="tbl"><table><thead><tr><th></th>'+cols.map(c=>'<th>'+(c.label?esc(c.label)+'<small>'+c.name+'</small>':'<span class="ltr">'+c.name+'</span>')+'</th>').join("")+'</tr></thead><tbody>'+
   d.rows.map((r,i)=>'<tr><td>'+(d.readOnly?'':'<button class="btn d" data-del="'+i+'" title="حذف">🗑</button>')+'</td>'+cols.map(c=>'<td class="'+(d.readOnly||c.protected?"lock":"ed")+'" data-r="'+i+'" data-c="'+c.name+'" title="'+(c.protected?"حقل محمي":"اضغط للتعديل")+'">'+fmt(r[c.name],c,c.name==="id"?null:d.lookups)+'</td>').join("")+'</tr>').join("")+
   '</tbody></table></div>':'<div class="empty">لا توجد سجلات</div>')+
   '<div class="pager">'+(d.total?(d.offset+1)+'–'+Math.min(d.offset+50,d.total)+' من '+d.total:'')+
   ' <button class="btn" id="prev" '+(d.offset?'':'disabled')+'>السابق</button><button class="btn" id="next" '+(d.offset+50<d.total?'':'disabled')+'>التالي</button></div>';
  $("#q").onkeydown=(e)=>{if(e.key==="Enter"){state.q=e.target.value;state.offset=0;loadRows()}};
  $("#prev").onclick=()=>{state.offset-=50;loadRows()};$("#next").onclick=()=>{state.offset+=50;loadRows()};
  if($("#add"))$("#add").onclick=openAdd;
  main.querySelectorAll("td.ed").forEach(td=>td.onclick=()=>openEdit(d.rows[td.dataset.r],cols.find(c=>c.name===td.dataset.c)));
  main.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>openDelete(d.rows[b.dataset.del]));
}
function inputFor(c,v,id){
  const ref=state.data&&state.data.refs&&state.data.refs[c.name];
  if(ref)return '<select id="'+id+'">'+(c.nullable||!v?'<option value="">— اختر —</option>':'')+ref.map(o=>'<option value="'+esc(o.id)+'" '+(o.id===v?"selected":"")+'>'+esc(o.label)+'</option>').join("")+'</select>';
  if(c.enumValues)return '<select id="'+id+'">'+(c.nullable?'<option value="">— فارغ —</option>':'')+c.enumValues.map(e=>'<option '+(e===v?"selected":"")+'>'+esc(e)+'</option>').join("")+'</select>';
  if(c.type==="boolean")return '<select id="'+id+'"><option value="true" '+(v===true?"selected":"")+'>نعم</option><option value="false" '+(v===false?"selected":"")+'>لا</option>'+(c.nullable?'<option value="" '+(v==null?"selected":"")+'>— فارغ —</option>':'')+'</select>';
  if(c.isArray)return '<textarea id="'+id+'" placeholder="عنصر في كل سطر">'+esc((v||[]).join("\\n"))+'</textarea><span class="hint">اكتب كل عنصر في سطر منفصل</span>';
  if(c.type==="date")return '<input id="'+id+'" type="date" value="'+(v?new Date(v).toISOString().slice(0,10):"")+'">';
  if(c.type.startsWith("timestamp"))return '<input id="'+id+'" class="ltr" value="'+(v?new Date(v).toISOString():"")+'"><span class="hint">مثال: 2026-10-12T09:30:00Z</span>';
  if(c.type==="jsonb"||c.type==="json")return '<textarea id="'+id+'" class="ltr">'+esc(v==null?"":JSON.stringify(v,null,2))+'</textarea>';
  const long=typeof v==="string"&&v.length>60;
  return long?'<textarea id="'+id+'">'+esc(v)+'</textarea>':'<input id="'+id+'" value="'+esc(v??"")+'">';
}
function readInput(c,id){
  const raw=$("#"+id).value;
  if(c.isArray)return raw.split("\\n").map(s=>s.trim()).filter(Boolean);
  if(raw===""&&(c.nullable||c.enumValues||c.type==="boolean"))return c.nullable?null:raw;
  if(c.type==="boolean")return raw==="true";
  if(c.type==="integer"||c.type==="bigint"||c.type==="numeric"||c.type==="double precision")return raw===""?null:Number(raw);
  if(c.type==="jsonb"||c.type==="json")return raw===""?null:JSON.parse(raw);
  return raw;
}
function dialog(title,body,buttons){$("#dt").textContent=title;$("#dbody").innerHTML=body;$("#dfoot").innerHTML="";
  for(const [label,cls,fn] of buttons){const b=document.createElement("button");b.className="btn "+cls;b.textContent=label;b.value=label;
    b.onclick=async(e)=>{if(!fn)return;e.preventDefault();try{await fn();$("#dlg").close();}catch(err){toast("⚠️ "+err.message)}};$("#dfoot").append(b)}
  $("#dlg").showModal()}
function openEdit(row,c){
  dialog("تعديل: "+(c.label||c.name),'<label>'+(c.label?esc(c.label)+' <span class="hint ltr">'+c.name+'</span>':c.name)+inputFor(c,row[c.name],"f")+'</label>',
   [["حفظ","p",async()=>{await call("/api/update",{table:state.table,id:row.id,column:c.name,value:readInput(c,"f")});toast("✓ تم الحفظ");loadRows();loadSide()}],["إلغاء","",null]]);
}
function openDelete(row){
  dialog("حذف السجل",'<p>هل تريد حذف هذا السجل نهائياً؟</p><p class="hint ltr">'+esc(row.id)+'</p>',
   [["حذف","d",async()=>{await call("/api/delete",{table:state.table,id:row.id});toast("✓ تم الحذف");loadRows();loadSide()}],["إلغاء","",null]]);
}
function openAdd(){
  const cols=state.data.columns.filter(c=>!c.protected);
  dialog("إضافة سجل جديد",cols.map((c,i)=>'<label>'+(c.label?esc(c.label)+' <span class="hint ltr">'+c.name+(c.nullable||c.def?"":" *")+'</span>':'<span class="ltr">'+c.name+(c.nullable||c.def?"":" *")+'</span>')+inputFor(c,c.type==="boolean"?(c.def==="true"):(c.enumValues&&!c.nullable?c.enumValues[0]:null),"n"+i)+'</label>').join("")+'<span class="hint">* حقل مطلوب</span>',
   [["إضافة","p",async()=>{const values={};cols.forEach((c,i)=>{const v=readInput(c,"n"+i);if(v!==null&&v!==""&&!(Array.isArray(v)&&!v.length&&!c.def))values[c.name]=v});await call("/api/insert",{table:state.table,values});toast("✓ تمت الإضافة");loadRows();loadSide()}],["إلغاء","",null]]);
}
loadSide().then(()=>{document.querySelector('#side button')?.click()});
</script></body></html>`;
