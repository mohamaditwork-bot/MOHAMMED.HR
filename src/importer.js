// Import the HR workbook into the database.
// Matching is by column name, and re-importing updates records (by ID number)
// instead of creating duplicates.
import { parseWorkbook } from "./parse.js";

// Column header (Arabic, as in the workbook) -> employee field
const EMP_MAP = {
  "الرقم الوظيفي": "emp_no",
  "الاسم بالعربي": "name_ar",
  "الاسم": "name_ar",
  "الاسم بالإنجليزي": "name_en",
  "رقم الهوية / الإقامة": "id_no",
  "رقم الإقامة": "id_no",
  "الجنسية": "nationality",
  "الجنس": "gender",
  "تاريخ الميلاد": "birth_date",
  "الجوال": "mobile",
  "البريد الإلكتروني": "email",
  "العنوان الوطني": "national_address",
  "القطاع": "sector",
  "القسم": "department",
  "المسمى الوظيفي": "job_title",
  "المهنة في الإقامة": "iqama_job",
  "المهنة في قوى": "qiwa_job",
  "تاريخ الالتحاق": "join_date",
  "تاريخ المباشرة الفعلي": "start_date",
  "الدرجة": "grade",
  "الإجازة السنوية (يوم)": "leave_days",
  "الراتب الأساسي": "basic_salary",
  "الراتب": "basic_salary",
  "السكن": "housing",
  "النقل": "transport",
  "إجمالي الراتب": "total_salary",
  "البنك": "bank",
  "الآيبان": "iban",
  "المؤهل": "qualification",
  "التخصص": "specialty",
  "سنوات الخبرة": "experience",
  "التأمينات": "gosi",
  "الشركة": "company",
  "ساعات العمل": "work_hours",
};

const NUMERIC = new Set(["leave_days", "basic_salary", "total_salary", "work_hours"]);
const DATES = new Set(["birth_date", "join_date", "start_date"]);

// Document sheets: sheet name -> document type
const DOC_SHEETS = {
  "العقود": "contract",
  "إقامات الموظفين": "iqama",
  "جوازات الموظفين": "passport",
  "رخص العمل": "work_permit",
  "صحية الموظفين": "health",
  "إقامات العمالة": "iqama",
  "أجير العمالة": "ajeer",
  "صحية العمالة": "health",
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const asDate = (v) => (typeof v === "string" && ISO.test(v) ? v : null);
const asNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const asText = (v) => (v === null || v === undefined ? null : String(v).trim() || null);
const normId = (v) => {
  const s = asText(v);
  return s ? s.replace(/\s+/g, "") : null;
};

function rowObjects(sheet) {
  return sheet.rows.map((r) => Object.fromEntries(sheet.headers.map((h, i) => [h, r[i]])));
}

async function upsertEmployee(db, kind, o) {
  const rec = { kind };
  for (const [h, field] of Object.entries(EMP_MAP)) {
    if (!(h in o) || field in rec) continue;
    const v = o[h];
    rec[field] = NUMERIC.has(field) ? asNum(v) : DATES.has(field) ? asDate(v) : asText(v);
  }
  if (rec.id_no) rec.id_no = normId(rec.id_no);
  if (!rec.name_ar || !rec.id_no) return null;
  const cols = Object.keys(rec);
  const vals = cols.map((c) => rec[c]);
  const sets = cols.filter((c) => c !== "id_no").map((c) => `${c} = EXCLUDED.${c}`).concat("updated_at = now()");
  const rows = await db.query(
    `INSERT INTO employees (${cols.join(",")}) VALUES (${cols.map((_, i) => "$" + (i + 1)).join(",")})
     ON CONFLICT (id_no) DO UPDATE SET ${sets.join(", ")} RETURNING id`,
    vals
  );
  return rows[0].id;
}

export async function importWorkbook(db, buf) {
  const { meta, sheets } = parseWorkbook(buf);
  const byName = Object.fromEntries(sheets.map((s) => [s.name, s]));
  const stats = { employees: 0, labor: 0, documents: 0, dependents: 0, insurance: 0, tasks: 0, platform: 0 };

  // 1) people
  const idMap = new Map(); // id_no -> employee id
  const nameMap = new Map(); // Arabic name -> employee id
  for (const [sheetName, kind] of [["بيانات الموظفين", "staff"], ["بيانات العمالة", "labor"]]) {
    const s = byName[sheetName];
    if (!s) continue;
    for (const o of rowObjects(s)) {
      const id = await upsertEmployee(db, kind, o);
      if (!id) continue;
      const idNo = normId(o["رقم الهوية / الإقامة"] ?? o["رقم الإقامة"]);
      idMap.set(idNo, id);
      nameMap.set(asText(o["الاسم بالعربي"] ?? o["الاسم"]), id);
      stats[kind === "staff" ? "employees" : "labor"]++;
    }
  }
  // also know people already in the database
  for (const r of await db.query("SELECT id, id_no, name_ar FROM employees")) {
    if (r.id_no && !idMap.has(r.id_no)) idMap.set(r.id_no, r.id);
    if (r.name_ar && !nameMap.has(r.name_ar)) nameMap.set(r.name_ar, r.id);
  }

  // 2) documents
  for (const [sheetName, type] of Object.entries(DOC_SHEETS)) {
    const s = byName[sheetName];
    if (!s) continue;
    for (const o of rowObjects(s)) {
      const empId = idMap.get(normId(o["رقم الهوية / الإقامة"] ?? o["رقم الإقامة"]));
      if (!empId) continue;
      const expiry = asDate(o["تاريخ الانتهاء"]);
      const issue = asDate(o["بداية العقد (قوى)"] ?? o["تاريخ الإصدار"]);
      const details = {};
      if (type === "exit_reentry") {
        details.visa_type = asText(o["نوع التأشيرة"]);
        details.duration = asNum(o["المدة (يوم)"]);
        details.outside = asText(o["خارج المملكة الآن"]);
      }
      await db.query(
        `INSERT INTO documents (employee_id, doc_type, issue_date, expiry_date, details)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (employee_id, doc_type) DO UPDATE SET issue_date = COALESCE(EXCLUDED.issue_date, documents.issue_date),
           expiry_date = EXCLUDED.expiry_date, details = EXCLUDED.details, updated_at = now()`,
        [empId, type, issue, expiry, Object.keys(details).length ? JSON.stringify(details) : null]
      );
      stats.documents++;
    }
  }

  // 3) dependents (linked to the head of family by name)
  if (byName["التابعين"]) {
    for (const o of rowObjects(byName["التابعين"])) {
      const name = asText(o["الاسم"]);
      if (!name) continue;
      await db.query(
        `INSERT INTO dependents (employee_id, name, iqama_no, relation, passport_expiry) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (iqama_no) DO UPDATE SET employee_id = EXCLUDED.employee_id, name = EXCLUDED.name,
           relation = EXCLUDED.relation, passport_expiry = EXCLUDED.passport_expiry`,
        [nameMap.get(asText(o["رب الأسرة"])) ?? null, name, normId(o["رقم الإقامة"]), asText(o["صلة القرابة"]), asDate(o["تاريخ انتهاء الجواز"])]
      );
      stats.dependents++;
    }
  }

  // 4) platform matching (Qiwa / GOSI / Muqeem / work permit) stored on the employee
  if (byName["مطابقة المنصات"]) {
    for (const o of rowObjects(byName["مطابقة المنصات"])) {
      const empId = idMap.get(normId(o["رقم الهوية / الإقامة"]));
      if (!empId) continue;
      const p = {
        qiwa_staff: asText(o["قوى - موظفي المنشأة"]),
        qiwa_contract: asText(o["قوى - عقد ساري"]),
        gosi: asText(o["التأمينات"]),
        muqeem: asText(o["مقيم"]),
        work_permit: asText(o["رخصة العمل"]),
        result: asText(o["النتيجة"]),
        note: asText(o["الملاحظة"]),
      };
      await db.query("UPDATE employees SET platform = $1 WHERE id = $2", [JSON.stringify(p), empId]);
      stats.platform++;
    }
  }

  // 5) medical insurance members
  if (byName["التأمين الطبي"]) {
    for (const o of rowObjects(byName["التأمين الطبي"])) {
      const name = asText(o["اسم المؤمن عليه"]);
      if (!name) continue;
      await db.query(
        `INSERT INTO insurance (employee_id, member_name, id_no, relation, class, gender, nationality, birth_date, mobile, member_no, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id_no) DO UPDATE SET employee_id = EXCLUDED.employee_id, member_name = EXCLUDED.member_name,
           relation = EXCLUDED.relation, class = EXCLUDED.class, gender = EXCLUDED.gender, nationality = EXCLUDED.nationality,
           birth_date = EXCLUDED.birth_date, mobile = EXCLUDED.mobile, member_no = EXCLUDED.member_no, notes = EXCLUDED.notes`,
        [
          nameMap.get(asText(o["الموظف"])) ?? null, name, normId(o["رقم الهوية / الإقامة"]), asText(o["الصلة"]),
          asText(o["الفئة"]), asText(o["الجنس"]), asText(o["الجنسية"]), asDate(o["تاريخ الميلاد"]),
          asText(o["الجوال"]), asText(o["رقم العضوية"]), asText(o["ملاحظة"]),
        ]
      );
      stats.insurance++;
    }
  }

  // 6) follow-up tasks: insurance changes + documents without dates (replaced on every import)
  const taskSheets = [
    ["تعديلات التأمين", "insurance", (o) => [asText(o["الإجراء"]), asText(o["الاسم"]), normId(o["رقم الهوية / الإقامة"]), asText(o["التفاصيل"])]],
    ["بدون تاريخ", "missing_date", (o) => [
      [asText(o["الوثيقة"]), asText(o["الفئة"])].filter(Boolean).join(" — "),
      asText(o["الاسم"]), normId(o["رقم الهوية / الإقامة"]), asText(o["السبب / الإجراء"]),
    ]],
  ];
  for (const [sheetName, category, pick] of taskSheets) {
    const s = byName[sheetName];
    if (!s) continue;
    await db.query("DELETE FROM tasks WHERE source = 'import' AND category = $1 AND status = 'open'", [category]);
    for (const o of rowObjects(s)) {
      const [title, person, idNo, details] = pick(o);
      if (!title) continue;
      await db.query(
        "INSERT INTO tasks (category, title, person, id_no, details, status, source) VALUES ($1,$2,$3,$4,$5,'open','import')",
        [category, title, person, idNo, details]
      );
      stats.tasks++;
    }
  }

  return { stats, settings: meta.settings };
}
