// Performance appraisal + contract-renewal decision, signed electronically
// through private links: manager rates & signs, then the employee signs.
import { getDb } from "./db.js";
import { toTrash } from "./trash.js";
import { CRITERIA_SETS, setFor, totalWeight } from "../public/js/appraisal-criteria.js";

// Legacy criteria (weights total 70) — kept for appraisals created before department-specific sets.
export const CRITERIA = [
  { id: "quality", ar: "جودة العمل وخدمة الضيوف", en: "Quality of work & guest service", w: 10 },
  { id: "productivity", ar: "إنجاز المهام في الوقت المحدد", en: "Productivity & timely completion", w: 10 },
  { id: "attendance", ar: "الحضور والانضباط وتحمل المسؤولية", en: "Attendance, punctuality & responsibility", w: 10 },
  { id: "procedures", ar: "الالتزام بسياسات وإجراءات الفندق", en: "Compliance with hotel policies", w: 10 },
  { id: "teamwork", ar: "العمل الجماعي والتعاون بين الأقسام", en: "Teamwork & cooperation", w: 8 },
  { id: "communication", ar: "التواصل المهني والعناية بالضيف", en: "Professional communication & guest care", w: 7 },
  { id: "safety", ar: "الوعي بالسلامة والنظافة والأمن", en: "Safety, hygiene & security awareness", w: 8 },
  { id: "initiative", ar: "حل المشكلات والتحسين المستمر", en: "Problem solving & improvement", w: 7 },
];
export const MAX_TOTAL = CRITERIA.reduce((s, c) => s + c.w, 0);
export const DECISIONS = ["renew", "renew_conditional", "not_renew"];

export function gradeOf(pct) {
  if (pct >= 90) return "excellent";
  if (pct >= 80) return "very_good";
  if (pct >= 70) return "good";
  if (pct >= 60) return "acceptable";
  return "weak";
}

// The criteria an appraisal is scored on: its own snapshot, else the legacy set.
const criteriaOf = (a) => {
  const c = typeof a?.criteria === "string" ? JSON.parse(a.criteria || "null") : a?.criteria;
  return Array.isArray(c) && c.length ? c : CRITERIA;
};
export const setNameOf = (key) => (CRITERIA_SETS[key] ? `نموذج ${CRITERIA_SETS[key].ar}` : null);

// Scores are 1..5 per criterion; points = weight × score / 5.
export function computeTotal(scores, list = CRITERIA) {
  let pts = 0;
  for (const c of list) {
    const s = Number(scores?.[c.id]);
    if (!(s >= 1 && s <= 5)) return null;
    pts += (c.w * s) / 5;
  }
  const pct = Math.round((pts / totalWeight(list)) * 1000) / 10;
  return { points: Math.round(pts * 10) / 10, pct, grade: gradeOf(pct) };
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function token() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const SIG_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const iso = (v) => (v instanceof Date ? v.toISOString() : v);

// Public view of an appraisal for a signer (no ID numbers, no salary).
async function byToken(db, tok) {
  if (!tok || tok.length < 20) return null;
  const r = await db.query(
    `SELECT a.*, e.name_ar, e.name_en, e.job_title, e.department, e.join_date, e.emp_no
       FROM appraisals a JOIN employees e ON e.id = a.employee_id
      WHERE a.token_mgr = $1 OR a.token_emp = $1`,
    [tok]
  );
  const a = r[0];
  if (!a) return null;
  a.role = a.token_mgr === tok ? "manager" : "employee";
  return a;
}

function publicView(a) {
  const jd = a.join_date instanceof Date ? a.join_date.toISOString().slice(0, 10) : a.join_date;
  return {
    role: a.role, status: a.status, period: a.period, manager_name: a.manager_name, manager_title: a.manager_title,
    employee: { name_ar: a.name_ar, name_en: a.name_en, job_title: a.job_title, department: a.department, join_date: jd, emp_no: a.emp_no },
    scores: a.scores, total: a.total, grade: a.grade, decision: a.decision, decision_note: a.decision_note,
    manager_comment: a.manager_comment, employee_comment: a.employee_comment,
    manager_sig: a.manager_sig, manager_signed_at: iso(a.manager_signed_at),
    employee_sig: a.employee_sig, employee_signed_at: iso(a.employee_signed_at),
    hr_sig: a.hr_sig || null, hr_name: a.hr_name || null, hr_signed_at: iso(a.hr_signed_at),
    criteria: criteriaOf(a), max_total: totalWeight(criteriaOf(a)),
    criteria_set: a.criteria_set || null, criteria_name: setNameOf(a.criteria_set),
  };
}

// GET/POST /api/sign — used by the signer pages (no login, token only).
export async function signRoute(req, env, audit) {
  const db = await getDb(env);
  if (req.method === "GET") {
    const a = await byToken(db, new URL(req.url).searchParams.get("token"));
    if (!a) return json({ error: "الرابط غير صحيح أو تم إلغاؤه" }, 404);
    if (a.expires_at && new Date(a.expires_at) < new Date() && a.status !== "completed") return json({ error: "انتهت صلاحية الرابط — اطلب رابطًا جديدًا من الموارد البشرية" }, 410);
    return json(publicView(a));
  }
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "بيانات غير صحيحة" }, 400);
  const a = await byToken(db, String(body.token || ""));
  if (!a) return json({ error: "الرابط غير صحيح أو تم إلغاؤه" }, 404);
  if (a.expires_at && new Date(a.expires_at) < new Date()) return json({ error: "انتهت صلاحية الرابط" }, 410);
  const sig = String(body.sig || "");
  if (!SIG_RE.test(sig) || sig.length > 300000) return json({ error: "التوقيع مطلوب" }, 400);
  const name = String(body.name || "").trim().slice(0, 120);
  if (!name) return json({ error: "اكتب اسمك" }, 400);
  const comment = String(body.comment || "").trim().slice(0, 2000) || null;

  if (a.role === "manager") {
    if (a.status !== "manager") return json({ error: "تم توقيع هذا التقييم مسبقًا" }, 409);
    const list = criteriaOf(a);
    const scores = {};
    for (const c of list) scores[c.id] = Number(body.scores?.[c.id]);
    const tot = computeTotal(scores, list);
    if (!tot) return json({ error: "قيّم كل البنود (من 1 إلى 5)" }, 400);
    const decision = String(body.decision || "");
    if (!DECISIONS.includes(decision)) return json({ error: "اختر قرار تجديد العقد" }, 400);
    const note = String(body.decision_note || "").trim().slice(0, 1000) || null;
    if (decision !== "renew" && !note) return json({ error: "اكتب السبب/الشروط" }, 400);
    const tok = token();
    await db.query(
      `UPDATE appraisals SET scores = $1, total = $2, grade = $3, decision = $4, decision_note = $5, manager_comment = $6,
         manager_name = $7, manager_sig = $8, manager_signed_at = now(), status = 'employee', token_emp = $9,
         expires_at = now() + interval '30 days' WHERE id = $10`,
      [JSON.stringify(scores), tot.pct, tot.grade, decision, note, comment, name, sig, tok, a.id]
    );
    await audit(env, { id: "sign", name: `${name} (مدير)` }, "manager_sign", "appraisals", a.id, { pct: tot.pct, decision });
    return json({ ok: true, next: "employee", employee_token: tok });
  }
  if (a.status !== "employee") return json({ error: a.status === "completed" ? "تم التوقيع مسبقًا" : "التقييم لسا عند المدير" }, 409);
  await db.query(
    "UPDATE appraisals SET employee_comment = $1, employee_sig = $2, employee_signed_at = now(), status = 'completed' WHERE id = $3",
    [comment, sig, a.id]
  );
  await db.query(
    "INSERT INTO tasks (category, title, person, details, status, source) VALUES ('renewal', $1, $2, $3, 'open', 'appraisal')",
    [`تقييم مكتمل — قرار العقد: ${{ renew: "تجديد", renew_conditional: "تجديد مشروط", not_renew: "عدم تجديد" }[a.decision] || a.decision}`, a.name_ar, `النتيجة ${a.total}% — ${a.period || ""}`]
  );
  await audit(env, { id: "sign", name: `${name} (موظف)` }, "employee_sign", "appraisals", a.id, null);
  return json({ ok: true, next: "done" });
}

// /api/appraisals — HR side (signed-in users).
export async function appraisalsRoute(req, env, user, audit) {
  const db = await getDb(env);
  const url = new URL(req.url);
  if (req.method === "GET") {
    const id = parseInt(url.searchParams.get("id") || "", 10);
    if (id) {
      const r = await db.query(
        `SELECT a.*, e.name_ar, e.name_en, e.job_title, e.department, e.join_date, e.emp_no, e.id_no
           FROM appraisals a JOIN employees e ON e.id = a.employee_id WHERE a.id = $1`, [id]);
      if (!r[0]) return json({ error: "غير موجود" }, 404);
      const v = publicView({ ...r[0], role: "hr" });
      const canSign = user.role === "admin" || user.role === "editor";
      return json({ ...v, id, id_no: r[0].id_no, token_mgr: canSign ? r[0].token_mgr : null, token_emp: canSign ? r[0].token_emp : null, created_at: iso(r[0].created_at) });
    }
    const rows = await db.query(
      `SELECT id, employee_id, period, manager_name, manager_title, status, total, grade, decision, decision_note,
              manager_signed_at, employee_signed_at, hr_name, hr_signed_at, token_mgr, token_emp, expires_at, created_by, created_at
         FROM appraisals ORDER BY created_at DESC`);
    // Signing links act as signatures — only people who may edit see them.
    if (!(user.role === "admin" || user.role === "editor")) for (const r of rows) { r.token_mgr = null; r.token_emp = null; }
    return json({ rows: rows.map((r) => ({ ...r, manager_signed_at: iso(r.manager_signed_at), employee_signed_at: iso(r.employee_signed_at), hr_signed_at: iso(r.hr_signed_at), expires_at: iso(r.expires_at), created_at: iso(r.created_at) })) });
  }
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "بيانات غير صحيحة" }, 400);
  if (req.method === "POST") {
    const emp = parseInt(body.employee_id, 10);
    if (!emp) return json({ error: "اختر الموظف" }, 400);
    const mname = String(body.manager_name || "").trim().slice(0, 120);
    if (!mname) return json({ error: "اكتب اسم المدير المباشر" }, 400);
    const e = (await db.query("SELECT department, job_title FROM employees WHERE id = $1", [emp]))[0];
    if (!e) return json({ error: "الموظف غير موجود" }, 404);
    // Criteria that fit the employee's department (or the set HR picked), saved with the appraisal.
    const setKey = CRITERIA_SETS[body.criteria_set] ? body.criteria_set : setFor(e.department, e.job_title);
    const r = await db.query(
      `INSERT INTO appraisals (employee_id, period, manager_name, manager_title, status, token_mgr, expires_at, created_by, criteria, criteria_set)
       VALUES ($1,$2,$3,$4,'manager',$5, now() + interval '30 days', $6, $7, $8) RETURNING id, token_mgr`,
      [emp, String(body.period || "").slice(0, 60) || null, mname, String(body.manager_title || "").slice(0, 120) || null, token(), user.name,
        JSON.stringify(CRITERIA_SETS[setKey].criteria), setKey]
    );
    await audit(env, user, "create", "appraisals", r[0].id, { employee_id: emp });
    return json({ ok: true, id: r[0].id, token_mgr: r[0].token_mgr });
  }
  if (req.method === "PUT") {
    // Renew link (new token, 30 more days) for the current stage.
    const id = parseInt(body.id, 10);
    const r = (await db.query("SELECT status FROM appraisals WHERE id = $1", [id]))[0];
    if (!r) return json({ error: "غير موجود" }, 404);
    if (r.status === "completed") return json({ error: "التقييم مكتمل" }, 400);
    const col = r.status === "manager" ? "token_mgr" : "token_emp";
    const tok = token();
    await db.query(`UPDATE appraisals SET ${col} = $1, expires_at = now() + interval '30 days' WHERE id = $2`, [tok, id]);
    await audit(env, user, "renew_link", "appraisals", id, null);
    return json({ ok: true, [col]: tok });
  }
  if (req.method === "PATCH") {
    // HR approval: any HR user (admin or editor) signs a completed appraisal once.
    const id = parseInt(body.id, 10);
    const sig = String(body.sig || "");
    if (!SIG_RE.test(sig) || sig.length > 300000) return json({ error: "التوقيع مطلوب" }, 400);
    const r = (await db.query("SELECT status, hr_signed_at FROM appraisals WHERE id = $1", [id]))[0];
    if (!r) return json({ error: "غير موجود" }, 404);
    if (r.status !== "completed") return json({ error: "الاعتماد بعد توقيع المدير والموظف" }, 409);
    if (r.hr_signed_at) return json({ error: "تم الاعتماد مسبقًا" }, 409);
    await db.query("UPDATE appraisals SET hr_sig = $1, hr_name = $2, hr_signed_at = now() WHERE id = $3 AND hr_signed_at IS NULL", [sig, user.name, id]);
    await audit(env, user, "hr_sign", "appraisals", id, null);
    return json({ ok: true });
  }
  if (req.method === "DELETE") {
    const id = parseInt(body.id, 10);
    await toTrash(db, "appraisals", id, user);
    await db.query("DELETE FROM appraisals WHERE id = $1", [id]);
    await audit(env, user, "delete", "appraisals", id, null);
    return json({ ok: true });
  }
  return json({ error: "طريقة غير مسموحة" }, 405);
}
