// Automatic contract renewal: a contract ending within N days (default 75) is renewed
// for one year ONLY when a signed renewal exists (renewal form, appraisal decision or
// renewal file). Others are listed as needing a decision; leavers are never renewed.
import { getDb } from "./db.js";
import { leavingReason, renewalReady } from "../public/js/logic.js";

const iso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
const addDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const addYear = (d) => { const x = new Date(d + "T00:00:00Z"); x.setUTCFullYear(x.getUTCFullYear() + 1); return x.toISOString().slice(0, 10); };
const parse = (v) => (typeof v === "string" ? JSON.parse(v || "{}") : v || {});

// Why a contract was renewed — written in the movement note and the renewal history (no person's name).
export const RENEW_BASIS = {
  form: "بناءً على نموذج التجديد من المدير المباشر",
  appraisal: "بناءً على قرار التقييم",
  file: "بناءً على نموذج التجديد",
  manual: "بقرار الموارد البشرية",
};

// The hotel's general manager, looked up from the data (no names in the code).
export async function generalManager(db) {
  const r = await db.query(
    `SELECT id, name_ar, name_en FROM employees
      WHERE status <> 'left' AND (job_title ~* 'general\\s*manager' OR qiwa_job = 'مدير فندق' OR iqama_job = 'مدير فندق')
      ORDER BY (job_title ~* 'general\\s*manager') DESC, id LIMIT 1`);
  return r[0] || null;
}

export async function renewContracts(env, settings, user, { dryRun = false, force = [] } = {}) {
  const db = await getDb(env);
  const days = Number(settings.contract_renew_days) || 75;
  const today = new Date().toISOString().slice(0, 10);
  const limit = addDays(today, days);
  const docs = await db.query(
    `SELECT d.*, e.name_ar, e.status AS emp_status FROM documents d JOIN employees e ON e.id = d.employee_id
      WHERE d.doc_type = 'contract' AND d.expiry_date IS NOT NULL AND d.expiry_date <= $1 AND e.status <> 'left'
      ORDER BY d.expiry_date`, [limit]);
  const apr = await db.query("SELECT employee_id, decision, status, created_at FROM appraisals WHERE status <> 'manager' ORDER BY created_at DESC");
  const files = [];
  const isoAt = (rows) => rows.map((r) => ({ ...r, created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at }));
  const aprI = isoAt(apr), filesI = isoAt(files);
  const forced = new Set((force || []).map(Number));
  const renewed = [], skipped = [], needs = [];
  for (const d of docs) {
    const det = parse(d.details);
    const reason = leavingReason({ ...d, details: det }, apr.filter((a) => a.employee_id === d.employee_id));
    const exp = iso(d.expiry_date);
    if (reason) { skipped.push({ employee_id: d.employee_id, name: d.name_ar, expiry: exp, reason }); continue; }
    const ready = renewalReady({ ...d, details: det, issue_date: iso(d.issue_date) }, aprI.filter((a) => a.employee_id === d.employee_id), filesI);
    if (!ready && !forced.has(d.employee_id)) { needs.push({ employee_id: d.employee_id, name: d.name_ar, expiry: exp }); continue; }
    // Renew year by year until the contract runs past the window's start (handles long-expired ones).
    let start = addDays(exp, 1), end = addYear(exp);
    while (end < today) { start = addDays(end, 1); end = addYear(end); }
    renewed.push({ employee_id: d.employee_id, name: d.name_ar, from: exp, start, end, basis: ready || "manual" });
    if (dryRun) continue;
    const hist = Array.isArray(det.renewals) ? det.renewals : [];
    const basis = ready || "manual";
    hist.push({ old_issue: iso(d.issue_date), old_expiry: exp, new_expiry: end, at: today, by: RENEW_BASIS[basis] || RENEW_BASIS.manual, basis, form: det.renewal || null });
    const next = { ...det, renewals: hist };
    delete next.renewal; // the form is used; next year needs a new one
    await db.query("UPDATE documents SET issue_date = $1, expiry_date = $2, details = $3, updated_at = now() WHERE id = $4",
      [start, end, JSON.stringify(next), d.id]);
    await db.query("INSERT INTO movements (employee_id, move_type, move_date, from_value, to_value, notes) VALUES ($1,'contract',$2,$3,$4,$5)",
      [d.employee_id, start, exp, end, null]);
  }
  return { days, renewed, skipped, needs };
}
