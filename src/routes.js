// API routes. Every request is `/api/<route>`; the hosting adapter passes
// `env` (secrets + the key-value store in env.HR).
import {
  json, sameOrigin, requireUser, getUsers, saveUsers, hashPassword, verifyPassword,
  isLocked, recordFail, clearFails, sessionCookie, clearCookie, ROLES,
} from "./auth.js";
import { getDb } from "./db.js";
import { TABLES, coerce } from "./schema.js";
import { importWorkbook } from "./importer.js";
import { detectWorkbook, applyUpdateFile, natAr, addLeftIds } from "./updates.js";
import { signRoute, appraisalsRoute } from "./appraisals.js";
import { toTrash, trashRoute } from "./trash.js";
import { renewContracts, generalManager, RENEW_BASIS } from "./renewals.js";
import { CRITERIA_SETS, setFor } from "../public/js/appraisal-criteria.js";
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
  let s = (await env.HR.get("settings", "json")) || {};
  // One-time update (rev 2): 35 days for iqama and all documents, 75 days for contracts.
  if ((s.settings_rev || 0) < 2) {
    s = { ...s, iqama: 35, docs: 35, contracts: 75, contract_renew_days: 75, settings_rev: 2 };
    await env.HR.put("settings", JSON.stringify(s));
  }
  // rev 4: no file archive any more (owner request) — delete every uploaded file once,
  // including copies kept in the recycle bin, to free the database space.
  if ((s.settings_rev || 0) < 4) {
    try {
      const db = await getDb(env);
      await db.query("DELETE FROM attachments");
      await db.query("DROP TABLE IF EXISTS upload_chunks");
      await db.query("UPDATE employees SET photo_id = NULL WHERE photo_id IS NOT NULL");
      await db.query("DELETE FROM trash WHERE entity = 'attachments'");
      await db.query("UPDATE trash SET data = jsonb_set(data, '{related,attachments}', '[]'::jsonb) WHERE data->'related' ? 'attachments'");
      s = { ...s, settings_rev: 4, twofa_required: (s.settings_rev || 0) < 3 ? true : s.twofa_required };
      await env.HR.put("settings", JSON.stringify(s));
    } catch (e) { console.error("file cleanup failed", e); }
  }
  // rev 3: two-step verification back on (owner request).
  if ((s.settings_rev || 0) < 3) {
    s = { ...s, twofa_required: true, settings_rev: 3 };
    await env.HR.put("settings", JSON.stringify(s));
  }
  // rev 5 (owner request): exit/re-entry visas are not tracked any more — move them all to the recycle bin;
  // Ajeer (the key document for contractor labor) is flagged earlier: 45 days.
  if ((s.settings_rev || 0) < 5) {
    try {
      const db = await getDb(env);
      for (const d of await db.query("SELECT id FROM documents WHERE doc_type = 'exit_reentry'")) {
        await toTrash(db, "documents", d.id, { name: "إلغاء تتبع تأشيرات الخروج والعودة" });
        await db.query("DELETE FROM documents WHERE id = $1", [d.id]);
      }
      // "Third party" employees are the ones transferred to an outside company: label them منقولين.
      await db.query("UPDATE employees SET company = regexp_replace(company, '^طرف ثالث \\(Third Party\\)', 'منقولين') WHERE company LIKE 'طرف ثالث%'");
      s = { ...s, ajeer: s.ajeer || 45, settings_rev: 5 };
      await env.HR.put("settings", JSON.stringify(s));
    } catch (e) { console.error("visa cleanup failed", e); }
  }
  // rev 6 (owner request, follow-ups): finished follow-ups from before are removed (kept in the recycle bin),
  // every insurance follow-up is marked done, and actions done with a login account that no longer exists
  // are shown under the current administrator's name (that old admin login was the owner's).
  if ((s.settings_rev || 0) < 6) {
    try {
      const db = await getDb(env);
      for (const r of await db.query("SELECT id FROM tasks WHERE status = 'done'")) {
        await toTrash(db, "tasks", r.id, { name: "تنظيف المتابعات المنجزة" });
        await db.query("DELETE FROM tasks WHERE id = $1", [r.id]);
      }
      await db.query("UPDATE tasks SET status = 'done' WHERE category = 'insurance' AND status = 'open'");
      const users = await getUsers(env);
      const owner = Object.values(users).find((u) => u.role === "admin")?.name;
      const gone = owner ? (await db.query("SELECT DISTINCT user_id, user_name FROM audit WHERE action IN ('renew_contracts', 'renew_contract', 'login') AND user_name IS NOT NULL"))
        .filter((r) => r.user_id && /^\d{10}$/.test(r.user_id) && !users[r.user_id] && r.user_name !== owner) : [];
      for (const { user_id, user_name } of gone) {
        await db.query("UPDATE movements SET notes = replace(notes, $1, $2) WHERE move_type = 'contract' AND notes LIKE '%' || $1 || '%'", [user_name, owner]);
        await db.query(
          `UPDATE documents SET details = jsonb_set(details, '{renewals}',
             (SELECT jsonb_agg(CASE WHEN x->>'by' = $1 THEN jsonb_set(x, '{by}', to_jsonb($2::text)) ELSE x END) FROM jsonb_array_elements(details->'renewals') x))
           WHERE doc_type = 'contract' AND jsonb_typeof(details->'renewals') = 'array' AND details::text LIKE '%' || $1 || '%'`, [user_name, owner]);
        await db.query("UPDATE audit SET user_name = $1 WHERE user_id = $2", [owner, user_id]);
      }
      s = { ...s, settings_rev: 6 };
      await env.HR.put("settings", JSON.stringify(s));
    } catch (e) { console.error("follow-up cleanup failed", e); }
  }
  // rev 7 (owner request, before publishing): fresh start.
  //  - people removed by hand stay out even after the recycle bin is emptied
  //  - insurance follow-ups removed completely
  //  - contract renewals shown in the general manager's name (looked up by job title)
  //  - safe clean-up of nationalities, mobiles and IBANs
  //  - recycle bin emptied and the activity log cleared (last)
  if ((s.settings_rev || 0) < 7) {
    try {
      const db = await getDb(env);
      const left = await db.query("SELECT DISTINCT data->'row'->>'id_no' AS id FROM trash WHERE entity = 'employees' AND deleted_by = 'تصحيحات'");
      await addLeftIds(db, left.map((r) => r.id));
      await db.query("DELETE FROM tasks WHERE category = 'insurance'");

      const gm = await generalManager(db);
      if (gm?.name_ar) {
        const users = await getUsers(env);
        const admins = Object.values(users).filter((u) => u.role === "admin").map((u) => u.name);
        const gone = (await db.query("SELECT DISTINCT user_id, user_name FROM audit WHERE user_name IS NOT NULL"))
          .filter((r) => r.user_id && /^\d{10}$/.test(r.user_id) && !users[r.user_id]).map((r) => r.user_name);
        for (const name of new Set([...admins, ...gone].filter((n) => n && n !== gm.name_ar))) {
          await db.query("UPDATE movements SET notes = replace(notes, $1, $2) WHERE move_type = 'contract' AND notes LIKE 'تجديد عقد%' AND notes LIKE '%' || $1 || '%'", [name, gm.name_ar]);
          await db.query(
            `UPDATE documents SET details = jsonb_set(details, '{renewals}',
               (SELECT jsonb_agg(CASE WHEN x->>'by' = $1 THEN jsonb_set(x, '{by}', to_jsonb($2::text)) ELSE x END) FROM jsonb_array_elements(details->'renewals') x))
             WHERE doc_type = 'contract' AND jsonb_typeof(details->'renewals') = 'array' AND details::text LIKE '%' || $1 || '%'`, [name, gm.name_ar]);
        }
      }

      for (const e of await db.query("SELECT id, nationality, mobile, iban, name_ar, name_en FROM employees")) {
        const nat = e.nationality ? natAr(e.nationality) : null;
        let mob = e.mobile ? String(e.mobile).replace(/\D/g, "").replace(/^(00966|966)/, "") : null;
        if (mob && mob.length >= 9 && !mob.startsWith("0")) mob = "0" + mob;
        if (mob && (mob.length < 9 || /^0+$/.test(mob))) mob = e.mobile;
        const iban = e.iban ? String(e.iban).replace(/\s+/g, "").toUpperCase() : null;
        const na = e.name_ar ? String(e.name_ar).replace(/\s+/g, " ").trim() : e.name_ar;
        const ne = e.name_en ? String(e.name_en).replace(/\s+/g, " ").trim() : e.name_en;
        if (nat !== e.nationality || mob !== e.mobile || iban !== e.iban || na !== e.name_ar || ne !== e.name_en) {
          await db.query("UPDATE employees SET nationality = $1, mobile = $2, iban = $3, name_ar = $4, name_en = $5 WHERE id = $6", [nat, mob, iban, na, ne, e.id]);
        }
      }

      await db.query("DELETE FROM trash");
      await db.query("DELETE FROM audit");
      s = { ...s, settings_rev: 7 };
      await env.HR.put("settings", JSON.stringify(s));
    } catch (e) { console.error("publish clean-up failed", e); }
  }
  // rev 8 (owner request): renewals were made because each employee's direct manager filled the renewal
  // form — the history says so instead of naming anyone.
  if ((s.settings_rev || 0) < 8) {
    try {
      const db = await getDb(env);
      await db.query(
        "UPDATE movements SET notes = $1 WHERE move_type = 'contract' AND notes LIKE 'تجديد عقد تلقائي (سنة) —%'",
        [`تجديد عقد تلقائي (سنة) — ${RENEW_BASIS.form}`]);
      await db.query(
        `UPDATE documents SET details = jsonb_set(details, '{renewals}',
           (SELECT jsonb_agg(jsonb_set(x, '{by}', to_jsonb(CASE x->>'basis' WHEN 'appraisal' THEN $2::text WHEN 'file' THEN $3::text ELSE $1::text END)))
              FROM jsonb_array_elements(details->'renewals') x))
         WHERE doc_type = 'contract' AND jsonb_typeof(details->'renewals') = 'array' AND jsonb_array_length(details->'renewals') > 0`,
        [RENEW_BASIS.form, RENEW_BASIS.appraisal, RENEW_BASIS.file]);
      s = { ...s, settings_rev: 8 };
      await env.HR.put("settings", JSON.stringify(s));
    } catch (e) { console.error("renewal wording update failed", e); }
  }
  // rev 9 (owner request): contract renewals carry no note; appraisals still waiting for the manager
  // get the criteria of the employee's department.
  if ((s.settings_rev || 0) < 9) {
    try {
      const db = await getDb(env);
      await db.query("UPDATE movements SET notes = NULL WHERE move_type = 'contract' AND notes LIKE 'تجديد عقد تلقائي%'");
      const open = await db.query(
        "SELECT a.id, e.department, e.job_title FROM appraisals a JOIN employees e ON e.id = a.employee_id WHERE a.status = 'manager' AND a.criteria IS NULL");
      for (const a of open) {
        const key = setFor(a.department, a.job_title);
        await db.query("UPDATE appraisals SET criteria = $1, criteria_set = $2 WHERE id = $3", [JSON.stringify(CRITERIA_SETS[key].criteria), key, a.id]);
      }
      s = { ...s, settings_rev: 9 };
      await env.HR.put("settings", JSON.stringify(s));
    } catch (e) { console.error("rev 9 update failed", e); }
  }
  // rev 10 (owner request): platform rows that are matched (مطابق) carry no note.
  if ((s.settings_rev || 0) < 10) {
    try {
      const db = await getDb(env);
      await db.query("UPDATE employees SET platform = platform - 'note' WHERE platform->>'result' = 'مطابق' AND platform ? 'note'");
      s = { ...s, settings_rev: 10 };
      await env.HR.put("settings", JSON.stringify(s));
    } catch (e) { console.error("rev 10 update failed", e); }
  }
  // rev 11 (owner request): read-only accounts for the General Manager (everything) and the housing
  // supervisor (contractor labour only). Username = ID number, first password = ID number, which must be
  // changed at first sign-in, then two-step verification is set up. A deleted account is never re-created.
  if ((s.settings_rev || 0) < 11) {
    try {
      const db = await getDb(env);
      const gm = await generalManager(db);
      const hs = await db.query(
        "SELECT id_no, name_ar, name_en FROM employees WHERE status <> 'left' AND kind = 'staff' AND job_title ~* 'housing\\s*supervisor'");
      const want = [];
      if (gm) want.push({ ...gm, role: "viewer" });
      if (hs.length === 1) want.push({ ...hs[0], role: "labor_viewer" });
      const users = await getUsers(env);
      const removed = new Set((await env.HR.get("users_removed", "json")) || []);
      let changed = false;
      for (const p of want) {
        const id = String(p.id_no || "");
        if (!/^[12]\d{9}$/.test(id) || users[id] || removed.has(id)) continue;
        const name = p.name_ar || p.name_en || id;
        users[id] = { name, role: p.role, hash: await hashPassword(id), must_change: true, sv: 1 };
        changed = true;
        await audit(env, { name: "النظام" }, "create", "user", id, { name, role: p.role });
      }
      if (changed) await saveUsers(env, users);
      s = { ...s, settings_rev: 11 };
      await env.HR.put("settings", JSON.stringify(s));
    } catch (e) { console.error("rev 11 update failed", e); }
  }
  // rev 12 (owner request): the HR editors sign in from scratch (ID number, new password, new two-step).
  if ((s.settings_rev || 0) < 12) {
    try {
      const db = await getDb(env);
      const hr = new Set((await db.query(
        "SELECT id_no FROM employees WHERE status <> 'left' AND department ~* '(الموارد البشرية|human|people)'")).map((r) => String(r.id_no)));
      const users = await getUsers(env);
      let changed = false;
      for (const [id, rec] of Object.entries(users)) {
        if (rec.role !== "editor" || !hr.has(id)) continue;
        await resetLogin(env, rec, id);
        changed = true;
        await audit(env, { name: "النظام" }, "reset_login", "user", id, { name: rec.name });
      }
      if (changed) await saveUsers(env, users);
      s = { ...s, settings_rev: 12 };
      await env.HR.put("settings", JSON.stringify(s));
    } catch (e) { console.error("rev 12 update failed", e); }
  }
  return { ...DEFAULT_SETTINGS, ...s };
}

async function loadAll(env) {
  const db = await getDb(env);
  const out = {};
  for (const [t, cfg] of Object.entries(TABLES)) out[t] = clean(await db.query(`SELECT * FROM ${t} ORDER BY ${cfg.order}`));
  out.attachments = []; // the system keeps data only — no uploaded files
  out.storage = (await db.query("SELECT pg_database_size(current_database()) AS bytes"))[0]?.bytes ?? null;
  out.appraisals = clean(await db.query(
    `SELECT id, employee_id, period, manager_name, manager_title, status, total, grade, decision, decision_note,
            manager_signed_at, employee_signed_at, hr_name, hr_signed_at, token_mgr, token_emp, expires_at, created_by, created_at FROM appraisals ORDER BY created_at DESC`));
  return out;
}

// ---------- auth ----------



// Back to first sign-in: username and password = ID number, new password required, two-step set up
// again from scratch, and every open session signed out.
async function resetLogin(env, rec, id) {
  rec.hash = await hashPassword(id);
  rec.must_change = true;
  delete rec.totp; delete rec.backup; delete rec.totp_pending;
  rec.sv = (rec.sv || 0) + 1;
  await clearFails(env, id);
}

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
  if (body.reset_login && all[id]) {
    if (id === me.id) return json({ error: "ما تقدر تعيد ضبط حسابك من هنا" }, 400);
    await resetLogin(env, all[id], id);
    await saveUsers(env, all);
    await audit(env, me, "reset_login", "user", id);
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
  const weak = pw && (pw === id || pw.length < 10 || !/[A-Za-z\u0600-\u06FF]/.test(pw) || !/\d/.test(pw));
  all[id] = { ...(all[id] || {}), name, role, hash: pw ? await hashPassword(pw) : all[id].hash, ...(pw ? { must_change: !!weak, sv: (all[id]?.sv || 0) + 1 } : {}) };
  await saveUsers(env, all);
  await clearFails(env, id);
  await audit(env, me, existed ? "update" : "create", "user", id, { name, role });
  return list();
}

// ---------- data ----------
// Contractor labour only (not permanent staff, not transferred «منقولين»), and only rows linked to them.
// Anything not tied to a labourer (recruitment, Saudization rules, appraisals, storage...) is left out.
const MOVED_CO = /^(منقولين|طرف ثالث)/;
function laborOnly(data) {
  const emps = (data.employees || []).filter((e) => e.kind === "labor" && !MOVED_CO.test(String(e.company || "").trim()));
  const ids = new Set(emps.map((e) => e.id)), idNos = new Set(emps.map((e) => String(e.id_no)));
  const out = { employees: emps, attachments: [], appraisals: [], storage: null };
  for (const [t, rows] of Object.entries(data)) {
    if (t in out || !Array.isArray(rows)) continue;
    if (["documents", "dependents", "insurance", "leaves", "movements"].includes(t)) out[t] = rows.filter((r) => ids.has(r.employee_id));
    else if (t === "tasks") out[t] = rows.filter((r) => r.id_no && idNos.has(String(r.id_no)));
    else out[t] = [];
  }
  return out;
}
const publicSettings = (s) => Object.fromEntries(Object.entries(s).filter(([k]) => !/email|key|secret|token/i.test(k)));

async function all(req, env) {
  const u = await requireUser(env, req, { role: "labor_viewer" });
  if (u instanceof Response) return u;
  if (u.role === "labor_viewer") return json({ ...laborOnly(await loadAll(env)), settings: publicSettings(await getSettings(env)) });
  const data = await loadAll(env);
  // Signing links act as signatures — only people who may edit get them.
  if (!(u.role === "admin" || u.role === "editor")) for (const a of data.appraisals || []) { a.token_mgr = null; a.token_emp = null; }
  return json({ ...data, settings: await getSettings(env) });
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

// Exit/re-entry visas are no longer tracked: a leave outside the Kingdom just keeps its flag.
async function syncLeaveVisa() {
  return null;
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
  for (const k of ["iqama", "contracts", "docs", "ajeer"]) if (k in body) next[k] = Math.max(1, Math.min(365, parseInt(body[k], 10) || current[k]));
  if ("saudization_target" in body) {
    const t = body.saudization_target === "" || body.saudization_target === null ? null : Number(body.saudization_target);
    next.saudization_target = t === null || (t >= 0 && t <= 100) ? t : current.saudization_target;
  }
  if ("contract_autorenew" in body) next.contract_autorenew = Boolean(body.contract_autorenew);
  if ("twofa_required" in body) next.twofa_required = Boolean(body.twofa_required);
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
    if (e.notConfigured) return json({ error: "الذكاء الاصطناعي غير مفعّل — المدير يضيف مفتاح Google Gemini من الإعدادات ← مفاتيح الخدمات" }, 503);
    if (e.empty) return json({ error: e.message }, 502);
    if (e.status >= 500) return json({ error: `خدمة الذكاء الاصطناعي (${e.upstream ? "Google Gemini" : "Claude"}) مشغولة الحين — حاول بعد دقيقة` }, 503);
    if (e.status === 429) return json({ error: e.free ? "انتهى الحد المسموح من Gemini لهذي الدقيقة أو اليوم — حاول بعد شوي أو بكرة" : "ضغط على خدمة الذكاء، حاول بعد قليل" }, 429);
    // Show the provider's own reason (never contains the key) so a bad/restricted key is easy to spot.
    const why = String(e?.message || "").replace(/AIza[\w-]+|AQ\.[\w.-]+|sk-ant-[\w-]+/g, "•••").slice(0, 300);
    const hint = e.status === 400 || e.status === 401 || e.status === 403 ? " — تأكد إن مفتاح Gemini صحيح ومفعّل (أنشئ مفتاح جديد من aistudio.google.com/apikey واحفظه من الإعدادات)" : "";
    return json({ error: `تعذر الاتصال بخدمة الذكاء الاصطناعي${why ? ` (${why})` : ""}${hint}` }, 502);
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
  const auth = new TextEncoder().encode(req.headers.get("authorization") || "");
  const want = new TextEncoder().encode(`Bearer ${env.CRON_SECRET || ""}`);
  let diff = auth.length ^ want.length;
  for (let i = 0; i < want.length; i++) diff |= (auth[i] || 0) ^ want[i];
  if (!env.CRON_SECRET || diff !== 0) return json({ error: "unauthorized" }, 401);
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
  const out = await renewContracts(env, await getSettings(env), u, { dryRun: !!body.dry_run, force: Array.isArray(body.force) ? body.force : [] });
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
  "/api/settings": { GET: settings, PUT: settings },
  "/api/audit": { GET: auditLog },
  "/api/ai": { POST: ai },
  "/api/alerts": { POST: alertsNow },
  "/api/cron": { GET: cron },
  "/api/appraisals": { GET: appraisals, POST: appraisals, PUT: appraisals, PATCH: appraisals, DELETE: appraisals },
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
