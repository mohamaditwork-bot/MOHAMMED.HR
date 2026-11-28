// Business rules shared by the browser and the server (document status,
// Saudization maths, alert lists). Plain ES module, no dependencies.

export const DOC_TYPES = {
  iqama: { ar: "الإقامة", en: "Iqama", thr: "iqama" },
  passport: { ar: "الجواز", en: "Passport", thr: "docs" },
  work_permit: { ar: "رخصة العمل", en: "Work permit", thr: "docs" },
  health: { ar: "الشهادة الصحية", en: "Health certificate", thr: "docs" },
  contract: { ar: "العقد", en: "Contract", thr: "contracts" },
  ajeer: { ar: "أجير", en: "Ajeer permit", thr: "ajeer" },
  // Kept only in the employee's file — never in the documents centre, alerts or counts.
  final_exit: { ar: "خروج نهائي", en: "Final exit visa", thr: "docs", profileOnly: true },
  other: { ar: "وثيقة أخرى", en: "Other document", thr: "docs" },
};

export const DEFAULT_SETTINGS = {
  iqama: 35,
  contracts: 75,
  docs: 35,
  ajeer: 45,
  contract_autorenew: true,
  contract_renew_days: 75,
  saudization_target: null,
  owner_email: null,
  alert_days: [30, 14, 7, 1],
  hotel_name_ar: "نوفوتيل المدينة المنورة",
  hotel_name_en: "Novotel Al Madinah",
};

const DAY = 864e5;
export function todayUTC(d = new Date()) {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}
export function toISO(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
export function daysUntil(iso, today = todayUTC()) {
  if (!iso) return null;
  return Math.round((Date.parse(iso + "T00:00:00Z") - today) / DAY);
}
function addYears(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString().slice(0, 10);
}

export function isSaudi(nationality) {
  const s = String(nationality || "").trim().toLowerCase();
  return s === "سعودي" || s === "سعودية" || s === "saudi" || s === "saudi arabia";
}

export const profileOnly = (docType) => !!DOC_TYPES[docType]?.profileOnly;
const detailsOf = (doc) => { try { return (typeof doc.details === "string" ? JSON.parse(doc.details || "{}") : doc.details) || {}; } catch { return {}; } };

// Status of one document: expired | near | ok | none (no date) | pending (no date, request in progress)
export function docStatus(doc, settings = DEFAULT_SETTINGS, today = todayUTC()) {
  let expiry = toISO(doc.expiry_date);
  if (!expiry) return { status: detailsOf(doc).pending ? "pending" : "none", days: null, expiry: null };
  const days = daysUntil(expiry, today);
  // Expired but already being renewed (e.g. examined, waiting for the new health card): not an alert.
  if (days < 0 && detailsOf(doc).pending) return { status: "pending", days, expiry };
  const key = (DOC_TYPES[doc.doc_type] || DOC_TYPES.other).thr;
  const thr = Number(settings?.[key]) || DEFAULT_SETTINGS[key] || 30;
  return { status: days < 0 ? "expired" : days <= thr ? "near" : "ok", days, expiry, thr };
}

// All documents that are expired or close to expiry, most urgent first.
export function buildAlerts(employees, documents, settings = DEFAULT_SETTINGS, today = todayUTC(), extra = {}) {
  const byId = new Map(employees.map((e) => [e.id, e]));
  const out = [];
  for (const d of documents) {
    const e = byId.get(d.employee_id);
    if (!e || e.status === "left" || !docApplies(e, d.doc_type) || profileOnly(d.doc_type) || d.doc_type === "exit_reentry") continue;
    const s = docStatus(d, settings, today);
    // A contract with a signed renewal ready is handled (renewed automatically) — no alert.
    if (d.doc_type === "contract" && s.status === "near" && renewalReady(d, (extra.appraisals || []).filter((a) => a.employee_id === d.employee_id), extra.attachments || [])) continue;
    if (s.status === "expired" || s.status === "near") out.push({ ...s, doc: d, employee: e });
  }
  // Most urgent first; for contractor labor Ajeer leads when equally urgent.
  const rank = (a) => (a.days < 0 ? 0 : 1);
  const ajeer = (a) => (a.employee.kind === "labor" && a.doc.doc_type === "ajeer" ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || ajeer(a) - ajeer(b) || a.days - b.days);
}

// Saudization for a list of staff employees.
export function ratio(list) {
  const total = list.length;
  const saudi = list.filter((e) => isSaudi(e.nationality)).length;
  return { total, saudi, non_saudi: total - saudi, pct: total ? (saudi / total) * 100 : 0 };
}

export function groupRatio(list, key) {
  const g = new Map();
  for (const e of list) {
    const k = (e[key] && String(e[key]).trim()) || "—";
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(e);
  }
  return [...g.entries()].map(([k, l]) => ({ key: k, ...ratio(l) })).sort((a, b) => b.total - a.total);
}

// Saudis to hire so that (saudi + x) / (total + x) >= target.
export function saudisNeeded(r, targetPct) {
  if (targetPct === null || targetPct === undefined || targetPct === "") return null;
  const p = Number(targetPct) / 100;
  if (!(p > 0) || p >= 1) return p >= 1 ? Math.max(0, r.non_saudi) : 0;
  if (r.pct / 100 >= p) return 0;
  return Math.max(0, Math.ceil((p * r.total - r.saudi) / (1 - p)));
}

// Employees covered by a localization rule (job title contains one of the occupations).
// Arabic-insensitive text: أ/إ/آ→ا, ة→ه, ى→ي, no tatweel/diacritics, single spaces.
export const normAr = (s) =>
  String(s || "").toLowerCase().replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();

// Employees covered by a localization rule.
export function ruleCoverage(rule, staff) {
  const occ = String(rule.occupations || "").split(/[,،\n]/).map(normAr).filter(Boolean);
  if (!occ.length) return { ...ratio([]), members: [], required: 0, missing: 0 };
  // Exact official profession (Qiwa, else iqama), or the job title contains the text.
  const members = staff.filter((e) => {
    const prof = normAr(e.qiwa_job || e.iqama_job);
    const title = normAr(e.job_title);
    return occ.some((o) => prof === o || (title && title.includes(o)));
  });
  const r = ratio(members);
  // MHRSD method: required Saudis = workers in the profession × rate, rounded to the nearest whole (0.5 up).
  const required = rule.required_pct === null || rule.required_pct === undefined || rule.required_pct === "" ? null : Math.round((r.total * Number(rule.required_pct)) / 100);
  return { ...r, members, required, missing: required === null ? 0 : Math.max(0, required - r.saudi) };
}

// Why an employee's contract should NOT be renewed (null = renew normally).
export function leavingReason(contractDoc, appraisals = []) {
  const det = (typeof contractDoc?.details === "string" ? JSON.parse(contractDoc.details || "{}") : contractDoc?.details) || {};
  if (det.no_renew) return det.no_renew_reason ? `مغادر — ${det.no_renew_reason}` : "مغادر (محدد يدويًا)";
  if (det.renewal?.recommendation === "N") return "المدير لا يوصي بالتجديد" + (det.renewal.comment ? ` — ${det.renewal.comment}` : "");
  if (det.renewal?.employee_wish === "N") return "الموظف لا يرغب بالتجديد";
  const last = appraisals.find((a) => a.decision);
  if (last?.decision === "not_renew") return "قرار التقييم: عدم التجديد";
  if (last?.employee_wish === "not_renew") return "الموظف لا يرغب بالتجديد (التقييم)";
  return null;
}

// Is there a signed renewal (form or appraisal decision) for the CURRENT contract term?
// Returns a short label or null. Forms used by an earlier renewal do not count again.
export function renewalReady(doc, appraisals = [], attachments = []) {
  const det = (typeof doc?.details === "string" ? JSON.parse(doc.details || "{}") : doc?.details) || {};
  const issue = doc?.issue_date ? String(doc.issue_date).slice(0, 10) : "";
  const hist = Array.isArray(det.renewals) ? det.renewals : [];
  const lastRenewal = hist.length ? String(hist[hist.length - 1].at || "") : "";
  const r = det.renewal;
  if (r && r.recommendation === "R" && r.employee_wish !== "N" && !(lastRenewal && (!r.at || String(r.at) <= lastRenewal))) return "form";
  const apr = appraisals.find((a) => a.status === "completed" && (a.decision === "renew" || a.decision === "renew_conditional") && a.employee_wish !== "not_renew" && String(a.created_at || "").slice(0, 10) > issue);
  if (apr) return "appraisal";
  const file = attachments.find((a) => a.employee_id === doc.employee_id && /تجديد|renewal|new contract/i.test(a.file_name || "") && String(a.created_at || "").slice(0, 10) > issue);
  if (file) return "file";
  return null;
}

// Saudi nationals do not need a passport, residence permit (iqama) or work permit on file.
const SAUDI_NOT_NEEDED = new Set(["passport", "iqama", "work_permit"]);
export function docApplies(emp, docType) {
  if (!emp) return true;
  // Per-person exemption (e.g. a Saudi woman's son/daughter or husband needs no work permit).
  const p = typeof emp.platform === "string" ? (() => { try { return JSON.parse(emp.platform); } catch { return {}; } })() : emp.platform || {};
  if (Array.isArray(p.exempt) && p.exempt.includes(docType)) return false;
  if (!SAUDI_NOT_NEEDED.has(docType)) return true;
  const saudi = isSaudi(emp.nationality) || /^1\d{9}$/.test(String(emp.id_no || ""));
  return !saudi;
}
