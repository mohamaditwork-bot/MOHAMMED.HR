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
import { toTrash, trashRoute } from "./trash.js";
import { renewContracts } from "./renewals.js";
import { withSecrets, saveSecrets } from "./secrets.js";
import { loginRoutes, rateLimited } from "./login.js";
import { verifyTotp } from "./totp.js";
import { askClaude, aiConfigured, aiProvider, buildContext } from "./ai.js";
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
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
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
      "INSERT INTO audit (user_id, user_name, action, entity, entity_id, details, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [user?.id ?? null, user?.name ?? null, action, entity, entityId == null ? null : String(entityId), details ? JSON.stringify(details) : null, user?.ip ?? null]
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
  out.attachments = clean(await db.query("SELECT id, employee_id, document_id, file_name, mime, size, uploaded_by, created_at, category FROM attachments ORDER BY id DESC"));
  out.storage = (await db.query("SELECT pg_database_size(current_database()) AS bytes"))[0]?.bytes ?? null;
  out.appraisals = clean(await db.query(
    `SELECT id, employee_id, period, manager_name, manager_title, status, total, grade, decision, decision_note,
            manager_signed_at, employee_signed_at, token_mgr, token_emp, expires_at, created_by, created_at FROM appraisals ORDER BY created_at DESC`));
  return out;
}

// ---------- auth ----------



async function users(req, env) {
  const me = await requireUser(env, req, { admin: true });
  if (me instanceof Response) return me;
  const all = await getUsers(env);
  const list = () => json({ users: Object.entries(all).map(([id, u]) => ({ id, name: u.name, role: u.role, twofa: !!u.totp?.on, must_change: !!u.must_change })) });
  if (req.method === "GET") return list();
  const body = await readJson(req);
  if (!body) return json({ error: "بيانات غير صحيحة" }, 400);
  const id = String(body.id || "").trim();
  if (!ID_RE.test(id)) return json({ error: "رقم الهوية غير صحيح" }, 400);
  if (req.method === "DELETE") {
    if (id === me.id) return json({ error: "ما تقدر تحذف حسابك" }, 400);
    delete all[id];
    await saveUsers(env, all);
    // Remember it so the hosting seed list does not bring it back.
    const removed = new Set((await env.HR.get("users_removed", "json")) || []);
    removed.add(id);
    await env.HR.put("users_removed", JSON.stringify([...removed]));
    await audit(env, me, "delete", "user", id);
    return list();
  }
  if (body.reset2fa && all[id]) {
    delete all[id].totp; delete all[id].backup; delete all[id].totp_pending;
    all[id].sv = (all[id].sv || 0) + 1;
    await saveUsers(env, all);
    await audit(env, me, "reset_2fa", "user", id);
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
  const removedList = (await env.HR.get("users_removed", "json")) || [];
  if (removedList.includes(id)) await env.HR.put("users_removed", JSON.stringify(removedList.filter((x) => x !== id)));
  all[id] = { ...(all[id] || {}), name, role, hash: pw ? await hashPassword(pw) : all[id].hash, ...(pw ? { must_change: true, sv: (all[id]?.sv || 0) + 1 } : {}) };
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
    const snap = await toTrash(db, table, id, u);
    const before = snap ? [snap.row] : [];
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
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", DOCX]);
const FILE_CATS = new Set(["iqama", "passport", "contract", "cv", "iban", "experience", "certificate", "photo", "dependent", "other"]);
// The real file type from its first bytes (never trust the name or the header alone).
function sniff(buf) {
  const b = (i) => buf[i];
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return "application/pdf";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45) return "image/webp";
  if (b(0) === 0x50 && b(1) === 0x4b && b(2) === 0x03 && b(3) === 0x04) return DOCX;
  return null;
}
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
    await audit(env, u, "view_file", "attachments", id, null);
    if (!rows.length) return json({ error: "الملف غير موجود" }, 404);
    const f = rows[0];
    return new Response(fromB64(String(f.b64).replace(/\s+/g, "")), {
      headers: {
        "content-type": f.mime,
        "content-disposition": `${f.mime === DOCX ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.file_name)}`,
        "cache-control": "private, no-store",
      },
    });
  }
  if (req.method === "DELETE") {
    const body = (await readJson(req)) || {};
    await toTrash(db, "attachments", parseInt(body.id, 10), u);
    await db.query("DELETE FROM attachments WHERE id = $1", [parseInt(body.id, 10)]);
    await audit(env, u, "delete", "attachments", body.id);
    return json({ ok: true });
  }
  // POST: raw file body; metadata in headers
  const mime = (req.headers.get("content-type") || "").split(";")[0].trim();
  if (!FILE_TYPES.has(mime)) return json({ error: "الملف لازم يكون PDF أو صورة أو Word" }, 400);
  const buf = new Uint8Array(await req.arrayBuffer());
  const real = buf.length > 12 ? sniff(buf) : null;
  if (!real || (real !== mime && !(real === "image/jpeg" && mime.startsWith("image/")))) return json({ error: "محتوى الملف ما يطابق نوعه — مرفوض" }, 400);
  if (!buf.length) return json({ error: "الملف فاضي" }, 400);
  if (buf.length > MAX_UPLOAD) return json({ error: "الملف أكبر من 4 ميجا" }, 413);
  let name = "file";
  try { name = decodeURIComponent(req.headers.get("x-file-name") || "file").slice(0, 200); } catch {}
  const empId = parseInt(req.headers.get("x-employee-id"), 10) || null;
  const docId = parseInt(req.headers.get("x-document-id"), 10) || null;
  if (!empId) return json({ error: "حدد الموظف" }, 400);
  const cat = FILE_CATS.has(req.headers.get("x-category")) ? req.headers.get("x-category") : null;
  const hashBuf = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  const sha = [...hashBuf].map((x) => x.toString(16).padStart(2, "0")).join("");
  const dup = await db.query("SELECT id FROM attachments WHERE employee_id = $1 AND sha256 = $2", [empId, sha]);
  if (dup.length) return json({ ok: true, id: dup[0].id, duplicate: true });
  const out = await db.query(
    "INSERT INTO attachments (employee_id, document_id, file_name, mime, size, data, uploaded_by, category, sha256) VALUES ($1,$2,$3,$4,$5, decode($6, 'base64'), $7, $8, $9) RETURNING id",
    [empId, docId, name, real === "image/jpeg" ? real : mime, buf.length, toB64(buf), u.name, cat, sha]
  );
  if (cat === "photo") await db.query("UPDATE employees SET photo_id = $1 WHERE id = $2", [out[0].id, empId]);
  await audit(env, u, "create", "attachments", out[0].id, { name, employee_id: empId, document_id: docId, category: cat });
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
    [leave.employee_id, start, end, JSON.stringify({ leave_id: leave.id, outside: "نعم" }), "مطابقة لإجازة خارج المملكة — تأكد من إصدارها في مقيم"]
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
    return json({ settings: await getSettings(env), keys: env.KEY_SOURCE || {} });
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
  if ("contract_renew_days" in body) next.contract_renew_days = Math.max(1, Math.min(180, parseInt(body.contract_renew_days, 10) || 75));
  if ("owner_email" in body) {
    const e = String(body.owner_email || "").trim().toLowerCase();
    if (e && !/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(e)) return json({ error: "اكتب بريد واحد صحيح" }, 400);
    next.owner_email = e || null;
  }
  delete next.alert_emails;
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
    const out = await askClaude(env, { messages, context: buildContext({ ...data, rules: data.saud_rules, leaves: data.leaves, appraisals: data.appraisals }, st, { strict: aiProvider(env) === "gemini" }), mode, lang });
    if (mode === "screen" && out.text) {
      const db = await getDb(env);
      await db.query("UPDATE applicants SET ai_summary = $1 WHERE id = $2", [out.text.slice(0, 8000), parseInt(body.applicant_id, 10)]);
    }
    return json(out);
  } catch (e) {
    console.error("AI error", e?.status, e?.message);
    if (e.status === 503) return json({ error: "الذكاء الاصطناعي غير مفعّل — المدير يضيف مفتاح Claude من الإعدادات" }, 503);
    if (e.status === 429) return json({ error: e.free ? "انتهى الحد المجاني من Gemini لهذي الدقيقة أو اليوم — حاول بعد شوي أو بكرة" : "ضغط على خدمة الذكاء، حاول بعد قليل" }, 429);
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
  const st = await getSettings(env);
  let renew = null;
  if (st.contract_autorenew) {
    renew = await renewContracts(env, st, { name: "التجديد التلقائي" });
    if (renew.renewed.length) await audit(env, { id: "cron", name: "cron" }, "auto_renew", "documents", null, { renewed: renew.renewed.length, skipped: renew.skipped.length });
  }
  const data = await loadAll(env);
  const out = await sendAlertEmail(env, st, data);
  await audit(env, { id: "cron", name: "cron" }, "send_alerts", null, null, out);
  return json({ ...out, renewed: renew?.renewed.length ?? 0 });
}

const LR = loginRoutes({ audit, getSettings });
const featureFlags = (env) => ({ features: { ai: aiConfigured(env), ai_provider: aiProvider(env), email: emailConfigured(env) } });
const me = (req, env) => LR.me(req, env, featureFlags);

// Full backup (admin + a fresh two-factor code): every table except file contents.
async function backup(req, env) {
  const u = await requireUser(env, req, { admin: true });
  if (u instanceof Response) return u;
  if (await rateLimited(env, req, "backup", 10)) return json({ error: "محاولات كثيرة" }, 429);
  const { code } = (await readJson(req)) || {};
  const all = await getUsers(env);
  const rec = all[u.id];
  const step = await verifyTotp(rec.totp?.secret, code, rec.totp?.last ?? -1);
  if (step < 0) return json({ error: "رمز التحقق غير صحيح" }, 400);
  rec.totp.last = step;
  await saveUsers(env, all);
  const data = await loadAll(env);
  delete data.storage;
  await audit(env, u, "backup_download");
  return json({ ok: true, at: new Date().toISOString(), data });
}

async function appraisals(req, env) {
  const u = await requireUser(env, req, { role: req.method === "GET" ? "viewer" : "editor" });
  if (u instanceof Response) return u;
  return appraisalsRoute(req, env, u, audit);
}
const sign = async (req, env) => ((await rateLimited(env, req, "sign", 60)) ? json({ error: "محاولات كثيرة — حاول لاحقًا" }, 429) : signRoute(req, env, audit));
async function secrets(req, env) {
  const u = await requireUser(env, req, { admin: true });
  if (u instanceof Response) return u;
  const body = (await readJson(req)) || {};
  const out = await saveSecrets(env, body);
  if (out.error) return json(out, 400);
  await audit(env, u, "update", "api_keys", null, { ai: "anthropic_key" in body, gemini: "gemini_key" in body, email: "resend_key" in body });
  return json(out);
}
async function renewNow(req, env) {
  const u = await requireUser(env, req, { role: "editor" });
  if (u instanceof Response) return u;
  const body = (await readJson(req)) || {};
  const out = await renewContracts(env, await getSettings(env), u, { dryRun: !!body.dry_run });
  if (!body.dry_run) await audit(env, u, "renew_contracts", "documents", null, { renewed: out.renewed.length, skipped: out.skipped.length });
  return json(out);
}
async function trash(req, env) {
  const u = await requireUser(env, req, { role: req.method === "GET" ? "viewer" : "editor" });
  if (u instanceof Response) return u;
  return trashRoute(req, env, u, audit);
}

const ROUTES = {
  "/api/login": { POST: LR.login },
  "/api/twofa": { GET: LR.twofa, POST: LR.twofa },
  "/api/backup": { POST: backup },
  "/api/logout": { POST: async () => json({ ok: true }, 200, { "set-cookie": clearCookie() }) },
  "/api/me": { GET: me },
  "/api/password": { POST: LR.password },
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
  "/api/trash": { GET: trash, POST: trash, DELETE: trash },
  "/api/renew": { POST: renewNow },
  "/api/secrets": { PUT: secrets },
};

// Handle one API request. `path` is the API path such as "/api/login".
export async function handle(req, rawEnv, path) {
  const env = await withSecrets(rawEnv);
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
  if (authed && res.status < 400 && req.sessionUser && req.sessionUser.st === "full" && !res.headers.get("set-cookie")) {
    res.headers.append("set-cookie", await sessionCookie(env, req.sessionUser.id, req.sessionUser.iat, { st: "full", sv: req.sessionUser.sv, ua: req.sessionUser.ua }));
  }
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}
