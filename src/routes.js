// API routes. Every request is `/api/<route>`; the hosting adapter passes
// `env` (secrets + the key-value store in env.HR).
import {
  json, sameOrigin, requireUser, getUsers, saveUsers, hashPassword, verifyPassword,
  isLocked, recordFail, clearFails, sessionCookie, clearCookie, ROLES,
} from "./auth.js";
import { getDb } from "./db.js";
import { TABLES, coerce } from "./schema.js";
import { importWorkbook } from "./importer.js";
import { detectWorkbook, applyUpdateFile } from "./updates.js";
import { signRoute, appraisalsRoute } from "./appraisals.js";
import { askClaude, aiConfigured, buildContext } from "./ai.js";
import { sendAlertEmail, emailConfigured } from "./alerts.js";
import { DEFAULT_SETTINGS } from "../public/js/logic.js";

const MAX_UPLOAD = 4 * 1024 * 1024;
const ID_RE = /^\d{5,15}$/;
const readJson = (req) => req.json().catch(() => null);

const SECURITY_HEADERS = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
  "strict-transport-security": "max-age=31536000",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

// Dates come back from Postgres as Date objects (or full timestamps): send plain YYYY-MM-DD.
const DATE_COLS = new Set(["birth_date", "join_date", "start_date", "end_date", "move_date", "issue_date", "expiry_date", "passport_expiry", "due_date", "effective_date"]);
function clean(rows) {
  return rows.map((r) => {
    const o = {};
    for (const [k, v] of Object.entries(r)) {
      if (v instanceof Date) o[k] = DATE_COLS.has(k) ? v.toISOString().slice(0, 10) : v.toISOString();
      else if (typeof v === "string" && DATE_COLS.has(k)) o[k] = v.slice(0, 10);
      else o[k] = v;
    }
    return o;
  });
}

async function audit(env, user, action, entity, entityId, details) {
  try {
    const db = await getDb(env);
    await db.query(
      "INSERT INTO audit (user_id, user_name, action, entity, entity_id, details) VALUES ($1,$2,$3,$4,$5,$6)",
      [user?.id ?? null, user?.name ?? null, action, entity, entityId == null ? null : String(entityId), details ? JSON.stringify(details) : null]
    );
  } catch (e) {
    console.error("audit failed", e);
  }
}

export async function getSettings(env) {
  const s = (await env.HR.get("settings", "json")) || {};
  return { ...DEFAULT_SETTINGS, ...s };
}

async function loadAll(env) {
  const db = await getDb(env);
  const out = {};
  for (const [t, cfg] of Object.entries(TABLES)) out[t] = clean(await db.query(`SELECT * FROM ${t} ORDER BY ${cfg.order}`));
  out.attachments = clean(await db.query("SELECT id, employee_id, document_id, file_name, mime, size, uploaded_by, created_at FROM attachments ORDER BY id DESC"));
  out.appraisals = clean(await db.query(
    `SELECT id, employee_id, period, manager_name, manager_title, status, total, grade, decision, decision_note,
            manager_signed_at, employee_signed_at, token_mgr, token_emp, expires_at, created_by, created_at FROM appraisals ORDER BY created_at DESC`));
  return out;
}

// ---------- auth ----------
async function login(req, env) {
  const body = await readJson(req);
  if (!body) return json({ error: "بيانات غير صحيحة" }, 400);
  const id = String(body.id || "").trim();
  const password = String(body.password || "");
  if (!ID_RE.test(id) || !password) return json({ error: "اكتب رقم الهوية وكلمة المرور" }, 400);
  const until = await isLocked(env, id);
  if (until) {
    const mins = Math.ceil((until - Date.now()) / 60e3);
    return json({ error: `تم إيقاف الدخول مؤقتًا بسبب محاولات خاطئة. حاول بعد ${mins} دقيقة` }, 429);
  }
  const u = (await getUsers(env))[id];
  if (!u || !(await verifyPassword(password, u.hash))) {
    await recordFail(env, id);
    return json({ error: "رقم الهوية أو كلمة المرور غير صحيحة" }, 401);
  }
  await clearFails(env, id);
  await audit(env, { id, name: u.name }, "login");
  return json({ ok: true, user: { id, name: u.name, role: u.role } }, 200, { "set-cookie": await sessionCookie(env, id) });
}

async function me(req, env) {
  const u = await requireUser(env, req);
  if (u instanceof Response) return u;
  return json({ user: { id: u.id, name: u.name, role: u.role }, features: { ai: aiConfigured(env), email: emailConfigured(env) } });
}

async function password(req, env) {
  const u = await requireUser(env, req);
  if (u instanceof Response) return u;
  const { current, next } = (await readJson(req)) || {};
  const all = await getUsers(env);
  if (!(await verifyPassword(String(current || ""), all[u.id].hash))) return json({ error: "كلمة المرور الحالية غير صحيحة" }, 400);
  if (!next || String(next).length < 6) return json({ error: "كلمة المرور الجديدة 6 خانات على الأقل" }, 400);
  all[u.id].hash = await hashPassword(String(next));
  await saveUsers(env, all);
  await audit(env, u, "password_change");
  return json({ ok: true });
}

async function users(req, env) {
  const me = await requireUser(env, req, { admin: true });
  if (me instanceof Response) return me;
  const all = await getUsers(env);
  const list = () => json({ users: Object.entries(all).map(([id, u]) => ({ id, name: u.name, role: u.role })) });
  if (req.method === "GET") return list();
  const body = await readJson(req);
  if (!body) return json({ error: "بيانات غير صحيحة" }, 400);
  const id = String(body.id || "").trim();
  if (!ID_RE.test(id)) return json({ error: "رقم الهوية غير صحيح" }, 400);
  if (req.method === "DELETE") {
    if (id === me.id) return json({ error: "ما تقدر تحذف حسابك" }, 400);
    delete all[id];
    await saveUsers(env, all);
    await audit(env, me, "delete", "user", id);
    return list();
  }
  const name = String(body.name || all[id]?.name || "").trim();
  if (!name) return json({ error: "اكتب الاسم" }, 400);
  const role = ROLES.includes(body.role) ? body.role : "viewer";
  // New users get their ID number as password unless one is given.
  const pw = body.password ? String(body.password) : all[id] ? null : id;
  if (pw && pw.length < 6) return json({ error: "كلمة المرور 6 خانات على الأقل" }, 400);
  if (id === me.id && role !== "admin") return json({ error: "ما تقدر تشيل صلاحية المدير عن نفسك" }, 400);
  const existed = Boolean(all[id]);
  all[id] = { name, role, hash: pw ? await hashPassword(pw) : all[id].hash };
  await saveUsers(env, all);
  await clearFails(env, id);
  await audit(env, me, existed ? "update" : "create", "user", id, { name, role });
  return list();
}

// ---------- data ----------
async function all(req, env) {
  const u = await requireUser(env, req);
  if (u instanceof Response) return u;
  return json({ ...(await loadAll(env)), settings: await getSettings(env) });
}

async function rows(req, env) {
  const url = new URL(req.url);
  const table = url.searchParams.get("table");
  const cfg = TABLES[table];
  if (!cfg) return json({ error: "جدول غير معروف" }, 400);
  const u = await requireUser(env, req, { role: req.method === "GET" ? "viewer" : "editor" });
  if (u instanceof Response) return u;
  const db = await getDb(env);

  if (req.method === "GET") return json({ rows: clean(await db.query(`SELECT * FROM ${table} ORDER BY ${cfg.order}`)) });

  const body = await readJson(req);
  if (!body) return json({ error: "بيانات غير صحيحة" }, 400);

  if (req.method === "DELETE") {
    const id = parseInt(body.id, 10);
    if (!id) return json({ error: "رقم السجل مفقود" }, 400);
    const before = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    await db.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    await audit(env, u, "delete", table, id, before[0] ? { name: before[0].name_ar || before[0].name || before[0].title || before[0].member_name } : null);
    return json({ ok: true });
  }

  const data = {};
  for (const [col, type] of Object.entries(cfg.cols)) {
    if (col in body) data[col] = coerce(type, body[col]);
  }
  // Leave length: inclusive days between the two dates when not given.
  if (table === "leaves" && data.start_date && data.end_date && (data.days === null || data.days === undefined)) {
    const d = Math.round((Date.parse(data.end_date) - Date.parse(data.start_date)) / 864e5) + 1;
    if (d < 1) return json({ error: "تاريخ النهاية قبل البداية" }, 400);
    data.days = d;
  }
  if (req.method === "POST") {
    for (const r of cfg.required) if (data[r] === null || data[r] === undefined) return json({ error: `الحقل مطلوب: ${r}` }, 400);
    const cols = Object.keys(data);
    try {
      const out = await db.query(
        `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`,
        cols.map((c) => data[c])
      );
      await audit(env, u, "create", table, out[0].id, data);
      const warning = table === "leaves" ? await syncLeaveVisa(db, out[0]) : null;
      return json({ row: clean(out)[0], warning });
    } catch (e) {
      return json({ error: dbError(e) }, 400);
    }
  }
  if (req.method === "PUT") {
    const id = parseInt(body.id, 10);
    if (!id) return json({ error: "رقم السجل مفقود" }, 400);
    for (const r of cfg.required) if (r in data && (data[r] === null || data[r] === "")) return json({ error: `الحقل مطلوب: ${r}` }, 400);
    const cols = Object.keys(data);
    if (!cols.length) return json({ error: "لا يوجد تعديل" }, 400);
    const sets = cols.map((c, i) => `${c} = $${i + 1}`);
    if (cfg.touch) sets.push("updated_at = now()");
    try {
      const out = await db.query(
        `UPDATE ${table} SET ${sets.join(", ")} WHERE id = $${cols.length + 1} RETURNING *`,
        [...cols.map((c) => data[c]), id]
      );
      if (!out.length) return json({ error: "السجل غير موجود" }, 404);
      await audit(env, u, "update", table, id, data);
      const warning = table === "leaves" ? await syncLeaveVisa(db, out[0]) : null;
      return json({ row: clean(out)[0], warning });
    } catch (e) {
      return json({ error: dbError(e) }, 400);
    }
  }
  return json({ error: "طريقة غير مسموحة" }, 405);
}

function dbError(e) {
  const m = String(e && e.message || e);
  if (/unique|duplicate/i.test(m)) return "القيمة موجودة مسبقًا (رقم هوية أو وثيقة مكررة)";
  if (/foreign key/i.test(m)) return "السجل المرتبط غير موجود";
  console.error(e);
  return "تعذر الحفظ";
}

// ---------- attachments (stored in Postgres, max 4 MB each) ----------
const FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const toB64 = (u8) => {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function files(req, env) {
  const url = new URL(req.url);
  const u = await requireUser(env, req, { role: req.method === "GET" ? "viewer" : "editor" });
  if (u instanceof Response) return u;
  const db = await getDb(env);
  if (req.method === "GET") {
    const id = parseInt(url.searchParams.get("id"), 10);
    if (!id) return json({ error: "رقم الملف مفقود" }, 400);
    const rows = await db.query("SELECT file_name, mime, encode(data, 'base64') AS b64 FROM attachments WHERE id = $1", [id]);
    if (!rows.length) return json({ error: "الملف غير موجود" }, 404);
    const f = rows[0];
    return new Response(fromB64(String(f.b64).replace(/\s+/g, "")), {
      headers: {
        "content-type": f.mime,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.file_name)}`,
        "cache-control": "private, no-store",
      },
    });
  }
  if (req.method === "DELETE") {
    const body = (await readJson(req)) || {};
    await db.query("DELETE FROM attachments WHERE id = $1", [parseInt(body.id, 10)]);
    await audit(env, u, "delete", "attachments", body.id);
    return json({ ok: true });
  }
  // POST: raw file body; metadata in headers
  const mime = (req.headers.get("content-type") || "").split(";")[0].trim();
  if (!FILE_TYPES.has(mime)) return json({ error: "الملف لازم يكون PDF أو صورة" }, 400);
  const buf = new Uint8Array(await req.arrayBuffer());
  if (!buf.length) return json({ error: "الملف فاضي" }, 400);
  if (buf.length > MAX_UPLOAD) return json({ error: "الملف أكبر من 4 ميجا" }, 413);
  let name = "file";
  try { name = decodeURIComponent(req.headers.get("x-file-name") || "file").slice(0, 200); } catch {}
  const empId = parseInt(req.headers.get("x-employee-id"), 10) || null;
  const docId = parseInt(req.headers.get("x-document-id"), 10) || null;
  if (!empId) return json({ error: "حدد الموظف" }, 400);
  const out = await db.query(
    "INSERT INTO attachments (employee_id, document_id, file_name, mime, size, data, uploaded_by) VALUES ($1,$2,$3,$4,$5, decode($6, 'base64'), $7) RETURNING id",
    [empId, docId, name, mime, buf.length, toB64(buf), u.name]
  );
  await audit(env, u, "create", "attachments", out[0].id, { name, employee_id: empId, document_id: docId });
  return json({ ok: true, id: out[0].id });
}

// A leave spent outside the Kingdom needs an exit/re-entry visa covering the same dates.
async function syncLeaveVisa(db, leave) {
  if (!leave.outside_ksa || leave.status === "rejected") return null;
  const iso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
  const start = iso(leave.start_date), end = iso(leave.end_date);
  const doc = (await db.query("SELECT * FROM documents WHERE employee_id = $1 AND doc_type = 'exit_reentry'", [leave.employee_id]))[0];
  const dIssue = iso(doc?.issue_date), dExp = iso(doc?.expiry_date);
  if (doc && dIssue === start && dExp === end) return null;
  const covered = doc && dIssue && dExp && dIssue <= start && dExp >= end;
  if (covered) return null;
  const old = doc ? `${dIssue || "—"} ← ${dExp || "—"}` : null;
  await db.query(
    `INSERT INTO documents (employee_id, doc_type, issue_date, expiry_date, details, notes) VALUES ($1,'exit_reentry',$2,$3,$4,$5)
     ON CONFLICT (employee_id, doc_type) DO UPDATE SET issue_date = EXCLUDED.issue_date, expiry_date = EXCLUDED.expiry_date,
       details = COALESCE(documents.details, '{}'::jsonb) || EXCLUDED.details, notes = EXCLUDED.notes, updated_at = now()`,
    [leave.employee_id, start, end, JSON.stringify({ leave_id: leave.id }), "مطابقة لإجازة خارج المملكة — تأكد من إصدارها في مقيم"]
  );
  return old
    ? `تأشيرة الخروج والعودة الحالية (${old}) ما تغطي الإجازة — تم تعديلها لتطابق الإجازة ${start} ← ${end}. تأكد من تمديدها/إصدارها في مقيم.`
    : `ما فيه تأشيرة خروج وعودة — تم إنشاؤها بتاريخ الإجازة ${start} ← ${end}. لا تنسى إصدارها في مقيم.`;
}

async function importXlsx(req, env) {
  const u = await requireUser(env, req, { role: "editor" });
  if (u instanceof Response) return u;
  const buf = new Uint8Array(await req.arrayBuffer());
  if (!buf.length) return json({ error: "الملف فاضي" }, 400);
  if (buf.length > MAX_UPLOAD) return json({ error: "الملف أكبر من 4 ميجا" }, 413);
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) return json({ error: "الملف لازم يكون Excel بصيغة xlsx" }, 400);
  const db = await getDb(env);
  let result;
  try {
    const { wb, type } = detectWorkbook(buf);
    if (!type) return json({ error: "ما قدرت أتعرف على نوع الملف — تأكد إنه من قوى/مقيم/Casual أو ملف الموظفين الرئيسي" }, 400);
    if (type.key !== "main") {
      const rep = await applyUpdateFile(db, wb, type);
      await audit(env, u, "import", type.key, null, { summary: rep.summary, changes: rep.changes.length });
      return json({ ok: true, update: rep });
    }
    result = await importWorkbook(db, buf);
  } catch (e) {
    console.error(e);
    return json({ error: "تعذر قراءة الملف: " + e.message }, 400);
  }
  // Keep the workbook's alert thresholds the first time.
  const current = (await env.HR.get("settings", "json")) || {};
  if (!current.imported_thresholds && result.settings) {
    await env.HR.put("settings", JSON.stringify({ ...current, ...result.settings, imported_thresholds: true }));
  }
  await audit(env, u, "import", "workbook", null, result.stats);
  return json({ ok: true, stats: result.stats });
}

async function settings(req, env) {
  if (req.method === "GET") {
    const u = await requireUser(env, req);
    if (u instanceof Response) return u;
    return json({ settings: await getSettings(env) });
  }
  const u = await requireUser(env, req, { admin: true });
  if (u instanceof Response) return u;
  const body = (await readJson(req)) || {};
  const current = await getSettings(env);
  const next = { ...current };
  for (const k of ["iqama", "contracts", "docs"]) if (k in body) next[k] = Math.max(1, Math.min(365, parseInt(body[k], 10) || current[k]));
  if ("saudization_target" in body) {
    const t = body.saudization_target === "" || body.saudization_target === null ? null : Number(body.saudization_target);
    next.saudization_target = t === null || (t >= 0 && t <= 100) ? t : current.saudization_target;
  }
  if ("contract_autorenew" in body) next.contract_autorenew = Boolean(body.contract_autorenew);
  if ("alert_emails" in body) next.alert_emails = String(body.alert_emails || "").slice(0, 1000);
  for (const k of ["hotel_name_ar", "hotel_name_en"]) if (body[k]) next[k] = String(body[k]).slice(0, 120);
  await env.HR.put("settings", JSON.stringify(next));
  await audit(env, u, "update", "settings", null, body);
  return json({ settings: next });
}

async function auditLog(req, env) {
  const u = await requireUser(env, req, { admin: true });
  if (u instanceof Response) return u;
  const db = await getDb(env);
  return json({ rows: clean(await db.query("SELECT * FROM audit ORDER BY id DESC LIMIT 500")) });
}

async function ai(req, env) {
  const u = await requireUser(env, req);
  if (u instanceof Response) return u;
  const body = (await readJson(req)) || {};
  const mode = ["chat", "insights", "saudization", "screen"].includes(body.mode) ? body.mode : "chat";
  const lang = body.lang === "en" ? "en" : "ar";
  const data = await loadAll(env);
  const st = await getSettings(env);
  let messages = Array.isArray(body.messages) ? body.messages : [];
  messages = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (mode === "screen") {
    const a = data.applicants.find((x) => x.id === parseInt(body.applicant_id, 10));
    if (!a) return json({ error: "المتقدم غير موجود" }, 404);
    const job = data.jobs.find((j) => j.id === a.job_id);
    messages = [{
      role: "user",
      content: `Job: ${job ? `${job.title} — ${job.department || ""}${job.saudi_only ? " (Saudi only)" : ""}\n${job.description || ""}` : "not linked"}\n\nApplicant: ${a.name}, nationality ${a.nationality || "-"}, expected salary ${a.expected_salary ?? "-"}, source ${a.source || "-"}\nNotes: ${a.notes || "-"}\nCV:\n${(a.cv_text || "").slice(0, 12000)}`,
    }];
  }
  if (mode === "chat" && (!messages.length || messages[messages.length - 1].role !== "user")) {
    return json({ error: "اكتب سؤالك" }, 400);
  }
  try {
    const out = await askClaude(env, { messages, context: buildContext({ ...data, rules: data.saud_rules }, st), mode, lang });
    if (mode === "screen" && out.text) {
      const db = await getDb(env);
      await db.query("UPDATE applicants SET ai_summary = $1 WHERE id = $2", [out.text.slice(0, 8000), parseInt(body.applicant_id, 10)]);
    }
    return json(out);
  } catch (e) {
    console.error("AI error", e?.status, e?.message);
    if (e.status === 503) return json({ error: "الذكاء الاصطناعي غير مفعّل — أضف مفتاح ANTHROPIC_API_KEY في إعدادات الاستضافة" }, 503);
    if (e.status === 429) return json({ error: "ضغط على خدمة الذكاء، حاول بعد قليل" }, 429);
    return json({ error: "تعذر الاتصال بخدمة الذكاء الاصطناعي" }, 502);
  }
}

async function alertsNow(req, env) {
  const u = await requireUser(env, req, { admin: true });
  if (u instanceof Response) return u;
  const data = await loadAll(env);
  const out = await sendAlertEmail(env, await getSettings(env), data, { force: true });
  await audit(env, u, "send_alerts", null, null, out);
  return json(out, out.sent ? 200 : 400);
}

// Called daily by Vercel Cron (Authorization: Bearer CRON_SECRET).
async function cron(req, env) {
  const auth = req.headers.get("authorization") || "";
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) return json({ error: "unauthorized" }, 401);
  const data = await loadAll(env);
  const out = await sendAlertEmail(env, await getSettings(env), data);
  await audit(env, { id: "cron", name: "cron" }, "send_alerts", null, null, out);
  return json(out);
}

async function appraisals(req, env) {
  const u = await requireUser(env, req, { role: req.method === "GET" ? "viewer" : "editor" });
  if (u instanceof Response) return u;
  return appraisalsRoute(req, env, u, audit);
}
const sign = (req, env) => signRoute(req, env, audit);

const ROUTES = {
  "/api/login": { POST: login },
  "/api/logout": { POST: async () => json({ ok: true }, 200, { "set-cookie": clearCookie() }) },
  "/api/me": { GET: me },
  "/api/password": { POST: password },
  "/api/users": { GET: users, POST: users, DELETE: users },
  "/api/all": { GET: all },
  "/api/rows": { GET: rows, POST: rows, PUT: rows, DELETE: rows },
  "/api/import": { POST: importXlsx },
  "/api/files": { GET: files, POST: files, DELETE: files },
  "/api/settings": { GET: settings, PUT: settings },
  "/api/audit": { GET: auditLog },
  "/api/ai": { POST: ai },
  "/api/alerts": { POST: alertsNow },
  "/api/cron": { GET: cron },
  "/api/appraisals": { GET: appraisals, POST: appraisals, PUT: appraisals, DELETE: appraisals },
  "/api/sign": { GET: sign, POST: sign },
};

// Handle one API request. `path` is the API path such as "/api/login".
export async function handle(req, env, path) {
  const authed = !["/api/login", "/api/logout", "/api/cron", "/api/sign"].includes(path);
  const route = ROUTES[path];
  let res;
  if (!route) res = json({ error: "غير موجود" }, 404);
  else if (!route[req.method]) res = json({ error: "طريقة غير مسموحة" }, 405);
  else if (req.method !== "GET" && !sameOrigin(req)) res = json({ error: "طلب غير مسموح" }, 403);
  else {
    try {
      res = await route[req.method](req, env);
    } catch (e) {
      console.error(e);
      res = json({ error: "خطأ في الخادم" }, 500);
    }
  }
  // Activity keeps the session alive: refresh the cookie on every successful signed-in request.
  if (authed && res.status < 400 && req.sessionUser) {
    res.headers.append("set-cookie", await sessionCookie(env, req.sessionUser.id, req.sessionUser.iat));
  }
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}
