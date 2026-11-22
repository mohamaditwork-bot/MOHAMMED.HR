// Automatic contract renewal: every contract that ends within N days (default 75)
// is renewed for one more year, except people marked as leaving.
import { getDb } from "./db.js";
import { leavingReason } from "../public/js/logic.js";

const iso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
const addDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const addYear = (d) => { const x = new Date(d + "T00:00:00Z"); x.setUTCFullYear(x.getUTCFullYear() + 1); return x.toISOString().slice(0, 10); };
const parse = (v) => (typeof v === "string" ? JSON.parse(v || "{}") : v || {});

export async function renewContracts(env, settings, user, { dryRun = false } = {}) {
  const db = await getDb(env);
  const days = Number(settings.contract_renew_days) || 75;
  const today = new Date().toISOString().slice(0, 10);
  const limit = addDays(today, days);
  const docs = await db.query(
    `SELECT d.*, e.name_ar, e.status AS emp_status FROM documents d JOIN employees e ON e.id = d.employee_id
      WHERE d.doc_type = 'contract' AND d.expiry_date IS NOT NULL AND d.expiry_date <= $1 AND e.status <> 'left'
      ORDER BY d.expiry_date`, [limit]);
  const apr = await db.query("SELECT employee_id, decision, created_at FROM appraisals WHERE status <> 'manager' ORDER BY created_at DESC");
  const renewed = [], skipped = [];
  for (const d of docs) {
    const det = parse(d.details);
    const reason = leavingReason({ ...d, details: det }, apr.filter((a) => a.employee_id === d.employee_id));
    const exp = iso(d.expiry_date);
    if (reason) { skipped.push({ employee_id: d.employee_id, name: d.name_ar, expiry: exp, reason }); continue; }
    // Renew year by year until the contract runs past the window's start (handles long-expired ones).
    let start = addDays(exp, 1), end = addYear(exp);
    while (end < today) { start = addDays(end, 1); end = addYear(end); }
    renewed.push({ employee_id: d.employee_id, name: d.name_ar, from: exp, start, end });
    if (dryRun) continue;
    const hist = Array.isArray(det.renewals) ? det.renewals : [];
    hist.push({ old_issue: iso(d.issue_date), old_expiry: exp, new_expiry: end, at: today, by: user?.name || "تلقائي" });
    await db.query("UPDATE documents SET issue_date = $1, expiry_date = $2, details = $3, updated_at = now() WHERE id = $4",
      [start, end, JSON.stringify({ ...det, renewals: hist }), d.id]);
    await db.query("INSERT INTO movements (employee_id, move_type, move_date, from_value, to_value, notes) VALUES ($1,'contract',$2,$3,$4,$5)",
      [d.employee_id, start, exp, end, `تجديد عقد تلقائي (سنة) — ${user?.name || "النظام"}`]);
  }
  return { days, renewed, skipped };
}
