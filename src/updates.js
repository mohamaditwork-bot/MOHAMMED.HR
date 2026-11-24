// Update files exported from the government platforms (Qiwa, Muqeem, Ajeer list...).
// Each file type is recognised by its column names; the matching handler applies
// the changes and returns a short report of what changed.
import * as XLSXns from "xlsx";
import { sheetRows } from "./parse.js";
import { toTrash } from "./trash.js";

const XLSX = XLSXns.SSF ? XLSXns : XLSXns.default;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, "0");
const txt = (v) => (v === null || v === undefined ? null : String(v).trim() || null);
const idOf = (v) => {
  const s = txt(v);
  return s && /^\d{10}$/.test(s.replace(/\s+/g, "")) ? s.replace(/\s+/g, "") : null;
};

// ---------- dates (ISO, "Jan 8, 2026 4:46 PM", d/m/yyyy, Hijri d/m/14xx) ----------
const hijriFmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
function hijriParts(ms) {
  const p = Object.fromEntries(hijriFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { d: +p.day, m: +p.month, y: parseInt(p.year, 10) };
}
export function hijriToISO(hd, hm, hy) {
  // Approximate, then walk to the exact Umm al-Qura day.
  let ms = Date.UTC(Math.round(hy * 0.970229 + 621.5643), 0, 1) + ((hm - 1) * 29.53 + (hd - 1)) * 864e5;
  for (let i = 0; i < 120; i++) {
    const h = hijriParts(ms);
    const diff = (hy - h.y) * 354 + (hm - h.m) * 29.5 + (hd - h.d);
    if (h.y === hy && h.m === hm && h.d === hd) return new Date(ms).toISOString().slice(0, 10);
    ms += Math.sign(diff) * Math.max(1, Math.round(Math.abs(diff))) * 864e5;
  }
  return null;
}
export function anyDate(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const s = String(v).trim();
  if (ISO.test(s.slice(0, 10))) return s.slice(0, 10);
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [d, mo, y] = [+m[1], +m[2], +m[3]];
    if (y < 1600) return hijriToISO(d, mo, y);
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  m = s.match(/^([A-Za-z]{3}) (\d{1,2}), (\d{4})/);
  if (m) {
    const mon = "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(m[1]) / 3 + 1;
    if (mon > 0) return `${m[3]}-${pad(mon)}-${pad(+m[2])}`;
  }
  return null;
}

// Table of objects from a sheet whose header row contains `must`.
function table(ws, must) {
  const rows = sheetRows(ws);
  const h = rows.findIndex((r) => r.some((c) => typeof c === "string" && c.trim() === must));
  if (h < 0) return { header: [], rows: [] };
  const header = rows[h].map((c) => (c === null ? "" : String(c).trim()));
  return { header, raw: rows.slice(h + 1), rows: rows.slice(h + 1).filter((r) => r.some((c) => c !== null)).map((r) => Object.fromEntries(header.map((k, i) => [k, r[i]]))) };
}

const TYPES = [
  { key: "main", label: "ملف الموظفين والعمالة الرئيسي", test: (names) => names.includes("بيانات الموظفين") },
  { key: "master", label: "ملف البيانات الرئيسي (Master Data)", test: (names) => names.some((n) => /^active$/i.test(n.trim())) && names.some((n) => /^casual$/i.test(n.trim())) },
  { key: "fixes", label: "تصحيحات يدوية", test: (names, hdr) => names.some((n) => n.trim() === "تصحيحات") || (hdr.includes("الإجراء") && hdr.includes("رقم الهوية")) },
  { key: "contracts", label: "العقود (قوى)", test: (_, hdr) => hdr.includes("Contract status") },
  { key: "casual", label: "العمالة المؤقتة (Casual)", test: (_, hdr, first) => /CASUAL LIST/i.test(first) },
  { key: "dependents", label: "مقيم — التابعين", test: (_, hdr) => hdr.includes("صلة القرابة") && hdr.includes("رقم إقامة رب الأسرة") },
  { key: "residents", label: "مقيم — المقيمين النشطين", test: (_, hdr) => hdr.includes("تاريخ انتهاء الجواز") && hdr.includes("تاريخ انتهاء الاقامة") },
  { key: "exitreentry", label: "تأشيرات الخروج والعودة", test: (_, hdr) => hdr.includes("مدة التأشيرة") && hdr.includes("نوع التأشيرة") },
  { key: "renewals", label: "الإقامات المجددة", test: (_, hdr) => hdr.includes("مدة التجديد") },
  { key: "professions", label: "تغيير المهن", test: (_, hdr) => hdr.includes("المهنة الجديدة") },
  { key: "finalexit", label: "تأشيرات الخروج النهائي", test: (_, hdr) => hdr.includes("السفر قبل تاريخ بالميلادي") },
  { key: "transfers", label: "نقل الخدمات (الإقامات المنقولة)", test: (_, hdr) => hdr.includes("اسم صاحب العمل القديم") },
  { key: "services", label: "سجل الخدمات التفاعلية", test: (_, hdr) => hdr.includes("نوع الخدمة") },
  { key: "tasks", label: "تصدير المتابعات", test: (_, hdr) => hdr.includes("التصنيف") && hdr.includes("العنوان") },
];

export function detectWorkbook(buf) {
  const wb = XLSX.read(buf, { type: "array", cellNF: true, cellDates: false });
  const names = wb.SheetNames;
  const first = sheetRows(wb.Sheets[names[0]]);
  const hdr = (first.find((r) => r.filter((c) => c !== null).length >= 3) || []).map((c) => (c === null ? "" : String(c).trim()));
  const firstText = String((first[0] || []).find((c) => c !== null) || "");
  const type = TYPES.find((t) => t.test(names, hdr, firstText)) || null;
  return { wb, type };
}

// ---------- database helpers ----------
async function people(db) {
  const rows = await db.query("SELECT id, kind, status, name_ar, name_en, id_no, iqama_job, platform FROM employees");
  return new Map(rows.filter((r) => r.id_no).map((r) => [r.id_no, r]));
}
async function upsertDoc(db, employeeId, type, { number, issue, expiry, details } = {}) {
  await db.query(
    `INSERT INTO documents (employee_id, doc_type, number, issue_date, expiry_date, details) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (employee_id, doc_type) DO UPDATE SET number = COALESCE(EXCLUDED.number, documents.number),
       issue_date = COALESCE(EXCLUDED.issue_date, documents.issue_date), expiry_date = COALESCE(EXCLUDED.expiry_date, documents.expiry_date),
       details = COALESCE(EXCLUDED.details, documents.details), updated_at = now()`,
    [employeeId, type, number ?? null, issue ?? null, expiry ?? null, details ? JSON.stringify(details) : null]
  );
}
async function docExpiry(db, employeeId, type) {
  const r = await db.query("SELECT expiry_date FROM documents WHERE employee_id = $1 AND doc_type = $2", [employeeId, type]);
  const v = r[0]?.expiry_date;
  return v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null;
}
async function setPlatform(db, emp, patch) {
  const p = { ...(emp.platform || {}), ...patch };
  emp.platform = p;
  await db.query("UPDATE employees SET platform = $1, updated_at = now() WHERE id = $2", [JSON.stringify(p), emp.id]);
}
async function addTask(db, category, title, person, idNo, details) {
  const ex = await db.query("SELECT id FROM tasks WHERE status = 'open' AND title = $1 AND COALESCE(id_no,'') = COALESCE($2,'')", [title, idNo]);
  if (ex.length) return;
  await db.query("INSERT INTO tasks (category, title, person, id_no, details, status, source) VALUES ($1,$2,$3,$4,$5,'open','update')", [category, title, person, idNo, details]);
}
const nm = (e) => e.name_ar || e.name_en || e.id_no;

// ---------- handlers ----------
const H = {};

H.contracts = async (db, wb) => {
  const { rows } = table(wb.Sheets[wb.SheetNames[0]], "Contract status");
  const map = await people(db);
  const by = new Map();
  for (const r of rows) {
    const id = idOf(r["Employee ID"]);
    if (!id) continue;
    if (!by.has(id)) by.set(id, []);
    by.get(id).push(r);
  }
  const out = [];
  let ok = 0;
  for (const [id, list] of by) {
    const active = list.find((x) => txt(x["Contract status"]) === "ساري");
    const e = map.get(id);
    if (e && e.kind === "staff" && e.status !== "left") {
      await setPlatform(db, e, { qiwa_contract: active ? "✔" : "✖", qiwa_contract_status: txt((active || list[list.length - 1])["Contract status"]) });
      if (active) ok++;
      else {
        out.push(`⚠️ ${nm(e)} (${id}) ما عنده عقد ساري في قوى — الحالة: ${txt(list[list.length - 1]["Contract status"])}`);
        await addTask(db, "platform", "بدون عقد ساري في قوى", nm(e), id, txt(list[list.length - 1]["Contract status"]));
      }
    } else if (active && !e && (await removedByHand(db, id))) {
      out.push(`⏭ ${txt(active["Employee name"])} (${id}) عقده ساري في قوى بس سبق وانشال يدويًا (غادر) — تأكد من إنهاء عقده في قوى`);
    } else if (active && !e) {
      // New hire: an active Qiwa contract but not in the system yet → add as staff right away.
      const name = txt(active["Employee name"]) || id;
      const joined = anyDate(active["Created at"]);
      const r = await db.query(
        "INSERT INTO employees (kind, status, id_no, name_ar, nationality, join_date, platform) VALUES ('staff','active',$1,$2,$3,$4,$5) RETURNING id, kind, status, name_ar, name_en, id_no, platform",
        [id, name, id.startsWith("1") ? "سعودي" : null, joined, JSON.stringify({ qiwa_contract: "✔", qiwa_contract_status: "ساري" })]
      );
      map.set(id, r[0]);
      ok++;
      out.push(`➕ موظف جديد من قوى: ${name} (${id}) — انضاف للموظفين، كمّل بياناته (المسمى الوظيفي والمهنة والقسم والراتب)`);
      await addTask(db, "platform", "موظف جديد من قوى — كمّل بياناته", name, id, "المسمى الوظيفي ومهنة قوى والقسم والراتب");
    }
  }
  return { summary: `${ok} موظف عقدهم ساري`, changes: out };
};

H.casual = async (db, wb) => {
  const map = await people(db);
  const NAT = /(i|ese|ian|ani|ino)$/i;
  const parse = (ws, left) => {
    const rows = sheetRows(ws).slice(2);
    const out = [];
    for (const r of rows) {
      const name = txt(r[1]);
      if (!name || name === "Name") continue;
      const cells = r.slice(4).map(txt);
      const iqama = r.map(idOf).find((x) => x && x.startsWith("2"));
      const dates = r.filter((c) => typeof c === "string" && ISO.test(c));
      const ni = cells.findIndex((c) => c && NAT.test(c) && !/\d/.test(c));
      const nationality = ni >= 0 ? cells[ni] : null;
      const company = ni >= 0 ? cells.slice(ni + 1).find((c) => c && !/\d/.test(c) && !/^(yes|no)$/i.test(c)) : null;
      const mobile = r.map(txt).find((c) => c && /^5\d{8}/.test(c.replace(/\D/g, "")) && c.replace(/\D/g, "").length === 9);
      out.push({ name, dept: txt(r[2]), pos: txt(r[3]), iqama, nationality, company, mobile: mobile ? mobile.replace(/\D/g, "") : null, join: dates[0] || null, ajeer: left ? null : dates[1] || null, reason: left ? txt(r[r.length - 1]) : null });
    }
    return out;
  };
  const active = parse(wb.Sheets[wb.SheetNames[0]], false);
  const left = wb.SheetNames[1] ? parse(wb.Sheets[wb.SheetNames[1]], true) : [];
  const out = [];
  let added = 0, updated = 0, gone = 0;
  for (const w of active) {
    if (!w.iqama) { out.push(`⚠️ ${w.name}: بدون رقم إقامة في الملف`); continue; }
    let e = map.get(w.iqama);
    if (!e) {
      const r = await db.query(
        `INSERT INTO employees (kind, status, name_ar, name_en, id_no, nationality, company, department, job_title, mobile, join_date, notes)
         VALUES ('labor','active',$1,$1,$2,$3,$4,$5,$6,$7,$8,'أضيف من ملف Casual') RETURNING id, kind, status, name_ar, name_en, id_no, platform`,
        [w.name, w.iqama, w.nationality, w.company, w.dept, w.pos, w.mobile, w.join]
      );
      e = r[0];
      map.set(w.iqama, e);
      added++;
      out.push(`➕ عامل جديد: ${w.name} (${w.iqama}) — ${w.company || "بدون شركة"}`);
    } else {
      await db.query("UPDATE employees SET status = 'active', company = COALESCE($1, company), updated_at = now() WHERE id = $2", [w.company, e.id]);
      updated++;
    }
    if (w.ajeer) await upsertDoc(db, e.id, "ajeer", { expiry: w.ajeer });
    else out.push(`⚠️ ${w.name} (${w.iqama}) بدون تاريخ أجير`);
  }
  const stillActive = new Set(active.map((w) => w.iqama).filter(Boolean));
  for (const w of left) {
    const e = w.iqama && !stillActive.has(w.iqama) && map.get(w.iqama);
    if (e && e.status !== "left") {
      await toTrash(db, "employees", e.id, { name: "استيراد Casual — غادر" });
      await db.query("DELETE FROM employees WHERE id = $1", [e.id]);
      gone++;
      out.push(`➖ غادر وانشال من النظام (محفوظ في السلة): ${nm(e)} (${w.iqama})${w.reason ? " — " + w.reason : ""}`);
    }
  }
  return { summary: `${active.length} على رأس العمل • ${added} جديد • ${updated} محدّث • ${gone} غادروا`, changes: out };
};

H.residents = async (db, wb) => {
  const { rows } = table(wb.Sheets[wb.SheetNames[0]], "رقم الاقامة");
  const map = await people(db);
  const out = [];
  let n = 0;
  const outside = [];
  for (const r of rows) {
    const id = idOf(r["رقم الاقامة"]);
    const e = id && map.get(id);
    if (!e) { if (id) out.push(`❔ ${txt(r["الاسم"])} (${id}) في مقيم وغير موجود بالموقع`); continue; }
    const iq = anyDate(r["تاريخ انتهاء الاقامة"]);
    const pp = anyDate(r["تاريخ انتهاء الجواز"]);
    const before = await docExpiry(db, e.id, "iqama");
    if (iq) await upsertDoc(db, e.id, "iqama", { expiry: iq, issue: anyDate(r["تاريخ اصدار الاقامة"]) });
    if (pp) await upsertDoc(db, e.id, "passport", { expiry: pp, number: txt(r["رقم الجواز"]) });
    if (iq && before && iq !== before) out.push(`🔄 ${nm(e)}: انتهاء الإقامة ${before} ← ${iq}`);
    const isOut = txt(r["خارج المملكه"]) === "نعم";
    await setPlatform(db, e, { muqeem: "✔", outside_ksa: isOut ? "نعم" : "لا" });
    if (isOut) outside.push(nm(e));
    await db.query(
      "UPDATE documents SET details = COALESCE(details, '{}'::jsonb) || $1::jsonb WHERE employee_id = $2 AND doc_type = 'exit_reentry'",
      [JSON.stringify({ outside: isOut ? "نعم" : "لا" }), e.id]
    );
    if (txt(r["المهنة"]) && txt(r["المهنة"]) !== e.iqama_job) await db.query("UPDATE employees SET iqama_job = $1 WHERE id = $2", [txt(r["المهنة"]), e.id]);
    n++;
  }
  if (outside.length) out.unshift(`✈️ خارج المملكة الآن (${outside.length}): ${outside.join("، ")}`);
  return { summary: `${n} مقيم تم تحديث إقاماتهم وجوازاتهم`, changes: out };
};

H.dependents = async (db, wb) => {
  const { rows } = table(wb.Sheets[wb.SheetNames[0]], "رقم الاقامة");
  const map = await people(db);
  let n = 0;
  const out = [];
  for (const r of rows) {
    const id = idOf(r["رقم الاقامة"]);
    const rel = txt(r["صلة القرابة"]);
    if (!id || !rel) continue;
    const head = map.get(idOf(r["رقم إقامة رب الأسرة"]));
    const pp = anyDate(r["تاريخ انتهاء الجواز"]);
    await db.query(
      `INSERT INTO dependents (employee_id, name, iqama_no, relation, passport_expiry) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (iqama_no) DO UPDATE SET employee_id = COALESCE(EXCLUDED.employee_id, dependents.employee_id), name = EXCLUDED.name,
         relation = EXCLUDED.relation, passport_expiry = COALESCE(EXCLUDED.passport_expiry, dependents.passport_expiry)`,
      [head?.id ?? null, txt(r["الاسم"]), id, rel, pp]
    );
    n++;
  }
  return { summary: `${n} تابع تم تحديثهم`, changes: out };
};

H.exitreentry = async () => ({ summary: "تأشيرات الخروج والعودة ما تنحفظ في النظام (حسب طلبك) — ما تغيّر شي", changes: [] });

H.renewals = async (db, wb) => {
  const { rows } = table(wb.Sheets[wb.SheetNames[0]], "رقم الإقامة");
  const map = await people(db);
  const latest = new Map();
  for (const r of rows) {
    const id = idOf(r["رقم الإقامة"]);
    const exp = anyDate(r["تاريخ انتهاء الاقامة"]);
    if (id && exp && (!latest.get(id) || exp > latest.get(id))) latest.set(id, exp);
  }
  let n = 0;
  const out = [];
  for (const [id, exp] of latest) {
    const e = map.get(id);
    if (!e) continue;
    const cur = await docExpiry(db, e.id, "iqama");
    if (!cur || exp > cur) {
      await upsertDoc(db, e.id, "iqama", { expiry: exp });
      out.push(`🔄 ${nm(e)}: الإقامة مجددة حتى ${exp}`);
      n++;
    }
  }
  return { summary: `${n} إقامة تحدّث تاريخها من سجل التجديد`, changes: out };
};

H.professions = async (db, wb) => {
  const { rows } = table(wb.Sheets[wb.SheetNames[0]], "رقم الإقامة");
  const map = await people(db);
  const out = [];
  const norm = (s) => String(s || "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
  for (const r of rows) {
    const e = map.get(idOf(r["رقم الإقامة"]));
    const nw = txt(r["المهنة الجديدة"]);
    if (!e || !nw || norm(nw) === norm(e.iqama_job)) continue;
    await db.query("UPDATE employees SET iqama_job = $1, updated_at = now() WHERE id = $2", [nw, e.id]);
    await db.query("INSERT INTO movements (employee_id, move_type, move_date, from_value, to_value, notes) VALUES ($1,'title',$2,$3,$4,'تغيير المهنة في مقيم')",
      [e.id, anyDate(r["تاريخ العملية"]) || new Date().toISOString().slice(0, 10), e.iqama_job, nw]);
    out.push(`🔄 ${nm(e)}: المهنة ${e.iqama_job || "—"} ← ${nw}`);
  }
  return { summary: `${out.length} مهنة تحدّثت`, changes: out };
};

H.finalexit = async (db, wb) => {
  const { rows } = table(wb.Sheets[wb.SheetNames[0]], "رقم الإقامة");
  const map = await people(db);
  const out = [];
  for (const r of rows) {
    const e = map.get(idOf(r["رقم الإقامة"]));
    if (!e || e.status === "left") continue;
    const travel = anyDate(r["السفر قبل تاريخ بالميلادي"]);
    await upsertDoc(db, e.id, "final_exit", {
      number: txt(r["رقم التأشيرة"]), issue: anyDate(r["تاريخ إصدار التأشيرة بالميلادي"]) || anyDate(r["تاريخ الإصدار"]), expiry: travel,
      details: { visa_type: "خروج نهائي" },
    });
    out.push(`✈️ ${nm(e)}: تأشيرة خروج نهائي${travel ? ` — السفر قبل ${travel}` : ""} (انحفظت في ملفه)`);
  }
  return { summary: out.length ? `${out.length} تأشيرة خروج نهائي انحفظت في ملفات أصحابها` : "أصحاب الخروج النهائي غير موجودين بالقوائم (غادروا) ✔", changes: out };
};

H.transfers = async (db, wb) => {
  const { rows } = table(wb.Sheets[wb.SheetNames[0]], "رقم الإقامة");
  const map = await people(db);
  const missing = rows.filter((r) => !map.get(idOf(r["رقم الإقامة"])));
  return { summary: `${rows.length} نقل خدمات • ${rows.length - missing.length} موجودين بالموقع`, changes: missing.map((r) => `ℹ️ ${txt(r["الاسم"])} (${idOf(r["رقم الإقامة"])}) غير موجود بالقوائم (غادر غالبًا)`) };
};

H.services = async (db, wb) => {
  const { rows } = table(wb.Sheets[wb.SheetNames[0]], "نوع الخدمة");
  return { summary: `${rows.length} عملية — سجل فقط، ما يحتاج تحديث`, changes: [] };
};
// ---------- Master Data workbook (Active / Third Parti / Permenant Leavers / Casual / Casual Leavers) ----------
// Excel serial numbers, ISO, d/m/yyyy or d-m-yyyy → ISO date.
function xdate(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v <= 10000 || v >= 80000 ? null : new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
  const s = String(v).trim().replace(/-/g, "/");
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12 ? `${m[3]}-${pad(+m[2])}-${pad(+m[1])}` : null;
  const d = anyDate(v);
  return d && /^(19[3-9]\d|20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d) ? d : null;
}
const num = (v) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n; };
const nid = (v) => { const s = String(v ?? "").replace(/\D/g, ""); return /^[12]\d{9}$/.test(s) ? s : null; };
const GENDER = { male: "ذكر", female: "أنثى", "ذكر": "ذكر", "أنثى": "أنثى" };

// Rows of a sheet as objects, with a getter that finds a column by a pattern on its header.
function sheetTable(ws, headerTest) {
  const rows = sheetRows(ws);
  const h = rows.findIndex((r) => r.some((c) => typeof c === "string" && headerTest.test(c.trim())));
  if (h < 0) return [];
  const header = rows[h].map((c) => String(c ?? "").replace(/\s+/g, " ").trim().toLowerCase());
  return rows.slice(h + 1).filter((r) => r.some((c) => c !== null && c !== "")).map((r) => (re) => {
    const i = header.findIndex((k) => re.test(k));
    return i < 0 ? null : r[i];
  });
}
const sheetBy = (wb, re) => wb.Sheets[wb.SheetNames.find((n) => re.test(n.trim()))];

// Placeholder text that must never overwrite real data.
const EMPTY = /^(n\/?a|na|none|nil|null|-+|—|0+|pending|done|tbd|\?)$/i;
// English nationality codes in the Master file → the Arabic used across the site.
const NAT_AR = { bangladeshi: "بنغلاديشي", bangladesh: "بنغلاديشي", egyptian: "مصري", egyption: "مصري", egypt: "مصري", indian: "هندي", india: "هندي", pakistani: "باكستاني", pakistan: "باكستاني", saudi: "سعودي", "saudi arabian": "سعودي", sudanese: "سوداني", yemeni: "يمني", syrian: "سوري", jordanian: "أردني", filipino: "فلبيني", philippine: "فلبيني", nepali: "نيبالي", nepalese: "نيبالي", "sri lankan": "سريلانكي", indonesian: "إندونيسي", moroccan: "مغربي", tunisian: "تونسي", lebanese: "لبناني", palestinian: "فلسطيني", ethiopian: "إثيوبي", kenyan: "كيني", afghan: "أفغاني", nigerian: "نيجيري", ugandan: "أوغندي", myanmar: "ميانماري", burmese: "ميانماري", chadian: "تشادي", eritrean: "إريتري", somali: "صومالي", turkish: "تركي", iraqi: "عراقي", algerian: "جزائري", libyan: "ليبي" };
export const natAr = (v) => { const t = txt(v); return t ? NAT_AR[t.toLowerCase().replace(/\s+/g, " ")] || t : null; };
// Fields the Master file is the source of truth for; everything else is only filled when empty.
const MASTER_OWNS = new Set(["emp_no", "job_title", "grade", "leave_days", "basic_salary", "housing", "transport", "total_salary", "company", "work_hours", "iban", "bank", "qiwa_job", "iqama_job"]);
const sameVal = (a, b) => {
  const x = String(a ?? "").replace(/\s+/g, "").toLowerCase(), y = String(b ?? "").replace(/\s+/g, "").toLowerCase();
  return x === y || (x !== "" && Number(x) === Number(y));
};

// Someone removed from the system with a manual correction (left / resigned).
// The list survives emptying the recycle bin (kv "left_ids").
export async function leftIds(db) {
  const r = await db.query("SELECT value FROM kv WHERE key = 'left_ids'");
  try { return new Set(JSON.parse(r[0]?.value || "[]")); } catch { return new Set(); }
}
export async function addLeftIds(db, ids) {
  const all = await leftIds(db);
  for (const id of ids) if (id) all.add(String(id));
  await db.query("INSERT INTO kv(key, value) VALUES ('left_ids', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify([...all])]);
}
async function removedByHand(db, id) {
  if ((await leftIds(db)).has(String(id))) return true;
  const r = await db.query("SELECT 1 FROM trash WHERE entity = 'employees' AND deleted_by = 'تصحيحات' AND data->'row'->>'id_no' = $1 LIMIT 1", [id]);
  return r.length > 0;
}

async function upsertPerson(db, map, kind, f, out, stat) {
  const id = f.id_no;
  const e = map.get(id);
  for (const k of Object.keys(f)) if (typeof f[k] === "string" && EMPTY.test(f[k].trim())) f[k] = null;
  // A date typed into a text column (e.g. qualification) is a shifted cell, not data.
  for (const k of ["qualification", "specialty", "experience"]) if (f[k] && /^\d{4}-\d{2}-\d{2}$|^\d{5}$/.test(String(f[k]))) f[k] = null;
  if (f.nationality) f.nationality = natAr(f.nationality);
  if (f.mobile) { const m = String(f.mobile).replace(/\D/g, "").replace(/^(00966|966)/, ""); f.mobile = m.length >= 9 ? (m.startsWith("0") ? m : "0" + m) : null; }
  if (f.iban) f.iban = String(f.iban).replace(/\s+/g, "").toUpperCase();
  let cols = Object.keys(f).filter((k) => k !== "id_no" && f[k] !== null && f[k] !== undefined && f[k] !== "");
  if (!e && (await removedByHand(db, id))) { out.push(`⏭ ${f.name_ar || f.name_en} (${id}) سبق وانشال يدويًا (غادر) — ما انضاف`); return null; }
  if (!e) {
    const all = ["kind", "status", "id_no", ...cols];
    const vals = [kind, "active", id, ...cols.map((k) => f[k])];
    if (!f.name_ar) { all.push("name_ar"); vals.push(f.name_en || id); }
    const r = await db.query(`INSERT INTO employees (${all.join(",")}) VALUES (${all.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING id, kind, status, name_ar, name_en, id_no, platform`, vals);
    map.set(id, r[0]);
    stat.added++;
    out.push(`➕ ${kind === "labor" ? "عامل" : "موظف"} جديد: ${f.name_ar || f.name_en} (${id})`);
    return r[0];
  }
  const cur = (await db.query("SELECT * FROM employees WHERE id = $1", [e.id]))[0] || {};
  cols = cols.filter((k) => {
    const old = cur[k] instanceof Date ? cur[k].toISOString().slice(0, 10) : cur[k];
    const empty = old === null || old === undefined || String(old).trim() === "" || EMPTY.test(String(old).trim());
    if (empty) return true;
    return MASTER_OWNS.has(k) && !sameVal(old, f[k]);
  });
  if (cols.length) {
    await db.query(`UPDATE employees SET ${cols.map((k, i) => `${k} = $${i + 1}`).join(", ")}, status = 'active', updated_at = now() WHERE id = $${cols.length + 1}`, [...cols.map((k) => f[k]), e.id]);
    stat.updated++;
  }
  return e;
}

async function removeLeaver(db, map, id, why, out, stat, keep) {
  if (!id || keep?.has(id)) return;
  const e = map.get(id);
  if (!e || e.status === "left") return;
  await toTrash(db, "employees", e.id, { name: `ملف Master Data — ${why}` });
  await db.query("DELETE FROM employees WHERE id = $1", [e.id]);
  map.delete(id);
  stat.removed++;
  out.push(`➖ غادر وانشال من النظام (محفوظ في السلة): ${nm(e)} (${id})`);
}

H.master = async (db, wb) => {
  const map = await people(db);
  const out = [], stat = { added: 0, updated: 0, removed: 0, docs: 0 };
  const staffRow = (g) => ({
    id_no: nid(g(/^national id/)), emp_no: g(/^employee id/) ? String(g(/^employee id/)).padStart(6, "0") : null,
    name_en: txt(g(/^english name/)), name_ar: txt(g(/^arabic name/)), iqama_job: txt(g(/^iqama profession/)),
    qiwa_job: txt(g(/^qiwa (occupation|titel|title)/)), sector: txt(g(/^division/)), department: txt(g(/^department/)),
    job_title: txt(g(/^position/)), nationality: txt(g(/^nationality/)), birth_date: xdate(g(/^date of birth/)),
    mobile: txt(g(/^mobile/)), join_date: xdate(g(/^joining/)), grade: txt(g(/^grade/)), leave_days: num(g(/^annual leave/)),
    basic_salary: num(g(/^basic salary/)), housing: txt(g(/^housing/)), transport: txt(g(/^transportation/)),
    total_salary: num(g(/^total salary/)), gender: GENDER[String(g(/^gender/) || "").trim().toLowerCase()] || null,
    national_address: txt(g(/^national address/)), iban: txt(g(/^iban/))?.replace(/\s+/g, "") || null, bank: txt(g(/^bank/)),
    email: txt(g(/^email/)), qualification: txt(g(/^qualifcation|^qualification/)), specialty: txt(g(/^major/)),
    experience: txt(g(/^years of exp/)),
  });

  const today = new Date().toISOString().slice(0, 10);
  const lastDay = (g) => { const d = xdate(g(/^last working/)); return d && d <= today ? d : null; };
  // Everyone still working somewhere in this file: the leaver sheets are history and can list people
  // who later came back or moved (casual → permanent), so those are never removed.
  const keep = new Set();
  for (const [re, h] of [[/^active$/i, /^employee id$/i], [/^third/i, /^employee id$/i]]) {
    const ws = sheetBy(wb, re);
    if (ws) for (const g of sheetTable(ws, h)) { const id = nid(g(/^national id/)); if (id) keep.add(id); }
  }
  const csWs = sheetBy(wb, /^casual$/i);
  if (csWs) for (const g of sheetTable(csWs, /^iqama id$/i)) { const id = nid(g(/^iqama id$/)); if (id && !lastDay(g)) keep.add(id); }

  // Active permanent staff
  const active = sheetBy(wb, /^active$/i);
  let nActive = 0;
  if (active) for (const g of sheetTable(active, /^employee id$/i)) {
    const f = staffRow(g);
    if (!f.id_no) continue;
    await upsertPerson(db, map, "staff", f, out, stat);
    nActive++;
  }
  // Permanent leavers
  const pl = sheetBy(wb, /permenant leavers|permanent leavers/i);
  if (pl) for (const g of sheetTable(pl, /^employee id$/i)) await removeLeaver(db, map, nid(g(/^national id/)), "موظف غادر", out, stat, keep);

  // Casual (contractor) workers with municipal health card, iqama and Ajeer
  const cs = sheetBy(wb, /^casual$/i);
  let nCasual = 0;
  if (cs) for (const g of sheetTable(cs, /^iqama id$/i)) {
    const id = nid(g(/^iqama id$/));
    if (!id) continue;
    if (lastDay(g)) { await removeLeaver(db, map, id, "عامل غادر", out, stat, keep); continue; }
    const name = txt(g(/^name$/));
    const e = await upsertPerson(db, map, "labor", {
      id_no: id, emp_no: txt(g(/^em\. ?id/)), name_en: name, department: txt(g(/^department/)), job_title: txt(g(/^position/)),
      iqama_job: txt(g(/^iqama profession/)), nationality: txt(g(/^nationality/)), work_hours: num(g(/^working hours/)),
      company: txt(g(/^company/)), mobile: txt(g(/^mobile/))?.replace(/\D/g, "") || null, birth_date: xdate(g(/^date of birth/)),
      join_date: xdate(g(/^joining date/)), start_date: xdate(g(/^actual joining/)), basic_salary: num(g(/^salary/)),
    }, out, stat);
    if (!e) continue;
    for (const [type, v] of [["health", g(/^baladya card/)], ["iqama", g(/^iqama expiry/)], ["ajeer", g(/^ajeer expiry/)]]) {
      const d = xdate(v);
      // Only fill a missing date or move it forward — Muqeem/renewals may already hold a newer one.
      if (d) { const old = await docExpiry(db, e.id, type); if (!old || type !== "iqama" || d > old) { await upsertDoc(db, e.id, type, { expiry: d }); stat.docs++; } }
    }
    nCasual++;
  }
  // "Transferred" (sheet "Third Parti"): were on the hotel's sponsorship, moved to an outside company.
  // Handled like contractor labor (not in the hotel's Saudization) but labelled منقولين.
  const third = sheetBy(wb, /^third/i);
  let nThird = 0;
  if (third) for (const g of sheetTable(third, /^employee id$/i)) {
    const f = staffRow(g);
    if (!f.id_no) continue;
    const prev = map.get(f.id_no) && (await db.query("SELECT company FROM employees WHERE id = $1", [map.get(f.id_no).id]))[0]?.company;
    const base = String(prev || "").replace(/^(منقولين|طرف ثالث \(Third Party\))( — )?/, "").trim();
    f.company = base ? `منقولين — ${base}` : "منقولين";
    const e = await upsertPerson(db, map, "labor", f, out, stat);
    if (!e) continue;
    if (e.kind !== "labor") { await db.query("UPDATE employees SET kind = 'labor' WHERE id = $1", [e.id]); e.kind = "labor"; }
    nThird++;
  }
  // Casual leavers
  const cl = sheetBy(wb, /casual leavers/i);
  if (cl) for (const r of sheetRows(cl)) {
    const id = r.map(nid).find(Boolean);
    if (id) await removeLeaver(db, map, id, "عامل مؤقت غادر", out, stat, keep);
  }
  return {
    summary: `${nActive} موظف • ${nThird} منقولين • ${nCasual} عامل • ${stat.added} جديد • ${stat.updated} محدّث • ${stat.removed} غادروا • ${stat.docs} تاريخ وثيقة`,
    changes: out,
  };
};

// ---------- Manual corrections: one row per change ----------
// Columns: رقم الهوية | الاسم | الإجراء | الحقل | القيمة | السبب
//   حذف            → remove (kept in the recycle bin) — never re-added by later files
//   تعديل          → set a field (Arabic label or column name) to القيمة
//   وثيقة          → set a document's expiry (الحقل = الإقامة / الجواز / الشهادة الصحية / أجير / رخصة العمل / العقد)
//   عدم تجديد      → contract will not be renewed (السبب shown in alerts)
//   متابعة         → open a follow-up task
const FIX_FIELDS = { "الاسم عربي": "name_ar", "الاسم": "name_ar", "الاسم إنجليزي": "name_en", "الجوال": "mobile", "الإيميل": "email", "القسم": "department", "القطاع": "sector", "المسمى": "job_title", "المسمى الوظيفي": "job_title", "مهنة قوى": "qiwa_job", "مهنة الإقامة": "iqama_job", "الجنسية": "nationality", "الجنس": "gender", "الميلاد": "birth_date", "الانضمام": "join_date", "المباشرة": "start_date", "الدرجة": "grade", "الإجازة": "leave_days", "الأساسي": "basic_salary", "الراتب الأساسي": "basic_salary", "السكن": "housing", "النقل": "transport", "الإجمالي": "total_salary", "الراتب الإجمالي": "total_salary", "البنك": "bank", "الآيبان": "iban", "الشركة": "company", "الرقم الوظيفي": "emp_no", "ساعات العمل": "work_hours", "ملاحظات": "notes" };
const FIX_DOCS = { "الإقامة": "iqama", "الجواز": "passport", "الشهادة الصحية": "health", "أجير": "ajeer", "رخصة العمل": "work_permit", "العقد": "contract", "التأمين": "insurance" };

H.fixes = async (db, wb) => {
  const ws = wb.Sheets[wb.SheetNames.find((n) => n.trim() === "تصحيحات") || wb.SheetNames[0]];
  const { rows } = table(ws, "الإجراء");
  const map = await people(db);
  const cols = new Set((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'employees'")).map((c) => c.column_name));
  const out = [];
  let done = 0;
  for (const r of rows) {
    const id = String(r["رقم الهوية"] ?? "").replace(/\D/g, "");
    const act = txt(r["الإجراء"]), field = txt(r["الحقل"]), why = txt(r["السبب"]);
    let val = r["القيمة"];
    const e = map.get(id);
    if (!act) continue;
    if (!e && act === "حذف" && /^[12]\d{9}$/.test(id)) {
      // Not in the system (yet): remember the removal so later files never add them back.
      await addLeftIds(db, [id]);
      if (!(await removedByHand(db, id))) await db.query("INSERT INTO trash (entity, entity_id, label, data, extra_count, deleted_by) VALUES ('employees', $1, $2, $3, 0, 'تصحيحات')", [id, txt(r["الاسم"]) || id, JSON.stringify({ row: { id_no: id, name_ar: txt(r["الاسم"]) }, related: {}, marker: true })]);
      out.push(`➖ ${txt(r["الاسم"]) || id} (${id}) مسجل كمغادر — ما راح ينضاف من أي ملف — ${why || "غادر"}`);
      done++;
      continue;
    }
    if (!e) { out.push(`❔ ${txt(r["الاسم"]) || id} (${id}) غير موجود في النظام — «${act}» ما تنفّذ (ارفع ملف التصحيحات آخر شي)`); continue; }
    if (act === "حذف") {
      await addLeftIds(db, [id]);
      await toTrash(db, "employees", e.id, { name: "تصحيحات" });
      await db.query("DELETE FROM employees WHERE id = $1", [e.id]);
      map.delete(id);
      out.push(`➖ ${nm(e)} (${id}) انشال من النظام — ${why || "غادر"} (محفوظ في السلة)`);
    } else if (act === "تعديل") {
      const col = FIX_FIELDS[field] || (cols.has(field) ? field : null);
      if (!col || ["id", "id_no", "kind", "status", "platform"].includes(col)) { out.push(`❔ ${nm(e)}: الحقل «${field}» غير معروف`); continue; }
      if (/_date$/.test(col)) val = anyDate(val);
      else if (["basic_salary", "total_salary", "leave_days", "work_hours"].includes(col)) val = Number(String(val).replace(/[^\d.]/g, "")) || null;
      else val = txt(val);
      if (col === "mobile" && val) { const m = val.replace(/\D/g, "").replace(/^(00966|966)/, ""); val = m.startsWith("0") ? m : "0" + m; }
      if (col === "iban" && val) val = val.replace(/\s+/g, "").toUpperCase();
      if (col === "nationality") val = natAr(val);
      await db.query(`UPDATE employees SET ${col} = $1, updated_at = now() WHERE id = $2`, [val, e.id]);
      out.push(`✏️ ${nm(e)}: ${field} ← ${val ?? "فاضي"}`);
    } else if (act === "وثيقة") {
      const type = FIX_DOCS[field] || field;
      const d = anyDate(val);
      if (!d) { out.push(`❔ ${nm(e)}: تاريخ ${field} غير مفهوم («${val ?? ""}»)`); continue; }
      await upsertDoc(db, e.id, type, { expiry: d });
      out.push(`📄 ${nm(e)}: انتهاء ${field} ← ${d}`);
    } else if (act === "عدم تجديد") {
      const c = (await db.query("SELECT id, details FROM documents WHERE employee_id = $1 AND doc_type = 'contract'", [e.id]))[0];
      const det = { ...(typeof c?.details === "string" ? JSON.parse(c.details || "{}") : c?.details || {}), no_renew: true, no_renew_reason: why || "مغادر" };
      if (c) await db.query("UPDATE documents SET details = $1, updated_at = now() WHERE id = $2", [JSON.stringify(det), c.id]);
      else await upsertDoc(db, e.id, "contract", { details: det });
      await addTask(db, "contract", "مغادر — لا يجدد عقده", nm(e), id, why || "");
      out.push(`🚪 ${nm(e)} (${id}) ما يتجدد عقده — ${why || "مغادر"}`);
    } else if (act === "لا ينطبق") {
      // This person doesn't need this document (e.g. son/daughter or husband of a Saudi woman: no work permit).
      const type = FIX_DOCS[field] || field;
      const np = { ...((await db.query("SELECT platform FROM employees WHERE id = $1", [e.id]))[0]?.platform || {}) };
      np.exempt = [...new Set([...(Array.isArray(np.exempt) ? np.exempt : []), type])];
      np.exempt_reason = { ...(np.exempt_reason || {}), [type]: why || "لا ينطبق" };
      await db.query("UPDATE employees SET platform = $1, updated_at = now() WHERE id = $2", [JSON.stringify(np), e.id]);
      out.push(`🚫 ${nm(e)}: ${field} — لا ينطبق${why ? ` (${why})` : ""}`);
    } else if (act === "منقول") {
      // Moved from the hotel's sponsorship to an outside company.
      const cur = (await db.query("SELECT company FROM employees WHERE id = $1", [e.id]))[0]?.company || "";
      const base = String(txt(val) || cur).replace(/^(منقولين|طرف ثالث \(Third Party\))( — )?/, "").trim();
      await db.query("UPDATE employees SET kind = 'labor', company = $1, updated_at = now() WHERE id = $2", [base ? `منقولين — ${base}` : "منقولين", e.id]);
      out.push(`↪ ${nm(e)}: منقولة/منقول لشركة خارجية${base ? ` (${base})` : ""}`);
    } else if (act === "مطابقة صحيحة") {
      // Checked on every platform: everything is correct.
      const np = { ...((await db.query("SELECT platform FROM employees WHERE id = $1", [e.id]))[0]?.platform || {}) };
      for (const k of ["qiwa_staff", "qiwa_contract", "gosi", "muqeem", "work_permit"]) if (np[k] === "✖" || np[k] === "؟") np[k] = "✔";
      np.result = "مطابق";
      np.note = why || "تم التحقق — كل شي صحيح";
      await db.query("UPDATE employees SET platform = $1, updated_at = now() WHERE id = $2", [JSON.stringify(np), e.id]);
      out.push(`✅ ${nm(e)}: مطابقة المنصات — كل شي صحيح`);
    } else if (act === "قيد الإصدار") {
      // A request was made for a document that has no date yet (e.g. a health certificate being issued).
      const type = FIX_DOCS[field] || field || "health";
      const c = (await db.query("SELECT id, details FROM documents WHERE employee_id = $1 AND doc_type = $2", [e.id, type]))[0];
      const det = { ...(typeof c?.details === "string" ? JSON.parse(c.details || "{}") : c?.details || {}), pending: true };
      if (c) await db.query("UPDATE documents SET details = $1, updated_at = now() WHERE id = $2", [JSON.stringify(det), c.id]);
      else await upsertDoc(db, e.id, type, { details: det });
      out.push(`📨 ${nm(e)}: ${field || "الشهادة الصحية"} — قيد الإصدار`);
    } else if (act === "متابعة") {
      await addTask(db, "followup", field || "متابعة", nm(e), id, txt(val) || why || "");
      out.push(`📌 ${nm(e)}: متابعة — ${field || ""} ${txt(val) || why || ""}`.trim());
    } else { out.push(`❔ ${nm(e)}: إجراء غير معروف «${act}»`); continue; }
    done++;
  }
  return { summary: `${done} تصحيح تنفّذ`, changes: out };
};

H.tasks = async () => ({ summary: "هذا تصدير المتابعات من الموقع نفسه — ما يحتاج استيراد", changes: [] });

export async function applyUpdateFile(db, wb, type) {
  const res = await H[type.key](db, wb);
  return { type: type.key, label: type.label, ...res };
}
