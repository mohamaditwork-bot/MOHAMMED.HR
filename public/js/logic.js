// Business rules shared by the browser and the server (document status,
// Saudization maths, alert lists). Plain ES module, no dependencies.

export const DOC_TYPES = {
  iqama: { ar: "الإقامة", en: "Iqama", thr: "iqama" },
  passport: { ar: "الجواز", en: "Passport", thr: "docs" },
  work_permit: { ar: "رخصة العمل", en: "Work permit", thr: "docs" },
  health: { ar: "الشهادة الصحية", en: "Health certificate", thr: "docs" },
  contract: { ar: "العقد", en: "Contract", thr: "contracts" },
  ajeer: { ar: "أجير", en: "Ajeer permit", thr: "docs" },
  exit_reentry: { ar: "خروج وعودة", en: "Exit / re-entry", thr: "docs" },
  other: { ar: "وثيقة أخرى", en: "Other document", thr: "docs" },
};

export const DEFAULT_SETTINGS = {
  iqama: 40,
  contracts: 80,
  docs: 30,
  contract_autorenew: true,
  saudization_target: null,
  alert_emails: "",
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

// Status of one document: expired | near | ok | none (no date)
export function docStatus(doc, settings = DEFAULT_SETTINGS, today = todayUTC()) {
  let expiry = toISO(doc.expiry_date);
  if (!expiry) return { status: "none", days: null, expiry: null };
  if (doc.doc_type === "contract" && settings.contract_autorenew) {
    let guard = 0;
    while (daysUntil(expiry, today) < 0 && guard++ < 60) expiry = addYears(expiry, 1);
  }
  const days = daysUntil(expiry, today);
  const thr = Number(settings[(DOC_TYPES[doc.doc_type] || DOC_TYPES.other).thr]) || 30;
  // An expired exit/re-entry visa only matters while the holder is still abroad.
  if (days < 0 && doc.doc_type === "exit_reentry") {
    const det = typeof doc.details === "string" ? JSON.parse(doc.details || "{}") : doc.details || {};
    if (det.outside !== "نعم") return { status: "used", days, expiry, thr };
  }
  return { status: days < 0 ? "expired" : days <= thr ? "near" : "ok", days, expiry, thr };
}

// All documents that are expired or close to expiry, most urgent first.
export function buildAlerts(employees, documents, settings = DEFAULT_SETTINGS, today = todayUTC()) {
  const byId = new Map(employees.map((e) => [e.id, e]));
  const out = [];
  for (const d of documents) {
    const e = byId.get(d.employee_id);
    if (!e || e.status === "left") continue;
    const s = docStatus(d, settings, today);
    if (s.status === "expired" || s.status === "near") out.push({ ...s, doc: d, employee: e });
  }
  return out.sort((a, b) => a.days - b.days);
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
export function ruleCoverage(rule, staff) {
  const occ = String(rule.occupations || "")
    .split(/[,،\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!occ.length) return { ...ratio([]), members: [] };
  const members = staff.filter((e) => {
    const t = [e.job_title, e.iqama_job, e.qiwa_job].filter(Boolean).join(" ").toLowerCase();
    return occ.some((o) => t.includes(o));
  });
  return { ...ratio(members), members };
}
