import XLSX from "xlsx";

const pad = (n) => String(n).padStart(2, "0");

// Convert one cell to a JSON value. Dates become "YYYY-MM-DD" strings.
function cellValue(cell) {
  if (!cell || cell.v === undefined || cell.v === null) return null;
  if (cell.t === "e") return null;
  if (cell.t === "d") {
    const d = cell.v;
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (cell.t === "n" && cell.z && XLSX.SSF.is_date(cell.z)) {
    const p = XLSX.SSF.parse_date_code(cell.v);
    if (p) return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  }
  if (typeof cell.v === "string") {
    const s = cell.v.trim();
    return s === "" ? null : s;
  }
  return cell.v;
}

function sheetRows(ws) {
  if (!ws || !ws["!ref"]) return [];
  const r = XLSX.utils.decode_range(ws["!ref"]);
  const out = [];
  for (let R = r.s.r; R <= r.e.r; R++) {
    const row = [];
    for (let C = r.s.c; C <= r.e.c; C++) row.push(cellValue(ws[XLSX.utils.encode_cell({ r: R, c: C })]));
    out.push(row);
  }
  return out;
}

const firstText = (row) => (row || []).find((v) => v !== null && v !== undefined) ?? null;

// Find the value to the right of a label anywhere in the first rows.
function labelValue(rows, label) {
  for (const row of rows.slice(0, 6)) {
    const i = row.findIndex((v) => typeof v === "string" && v.trim() === label);
    if (i >= 0) {
      for (let j = i + 1; j < row.length; j++) if (row[j] !== null) return row[j];
    }
  }
  return null;
}

export function parseWorkbook(buf) {
  const wb = XLSX.read(buf, { type: "buffer", cellNF: true, cellDates: false });
  const meta = { settings: { iqama: 40, contracts: 80, docs: 30 }, updated: null, title: null, subtitle: null };
  const sheets = [];

  wb.SheetNames.forEach((name, idx) => {
    const rows = sheetRows(wb.Sheets[name]);
    if (!rows.length) return;

    // The first sheet is the statistics dashboard: only take its settings.
    if (idx === 0 && rows.some((r) => r.includes("تنبيه الإقامة (يوم)"))) {
      const n = (v, d) => (typeof v === "number" && v > 0 ? v : d);
      meta.settings.iqama = n(labelValue(rows, "تنبيه الإقامة (يوم)"), 40);
      meta.settings.contracts = n(labelValue(rows, "تنبيه العقود (يوم)"), 80);
      meta.settings.docs = n(labelValue(rows, "تنبيه باقي الوثائق (يوم)"), 30);
      meta.title = firstText(rows[0]);
      meta.subtitle = firstText(rows[1]);
      const upd = rows.slice(0, 4).map(firstText).find((t) => typeof t === "string" && t.includes("آخر تحديث"));
      meta.updated = upd || null;
      return;
    }

    const h = rows.findIndex((r) => r[0] === "#");
    if (h < 0) return;
    // Keep columns up to the last non-empty header.
    let width = rows[h].length;
    while (width > 0 && rows[h][width - 1] === null) width--;
    const headers = rows[h].slice(0, width).map((v, i) => (v === null ? `عمود ${i + 1}` : String(v)));
    const data = rows
      .slice(h + 1)
      .map((r) => r.slice(0, width))
      .filter((r) => r.slice(1).some((v) => v !== null) && r[0] !== "#");

    sheets.push({
      name,
      title: firstText(rows[0]) || name,
      subtitle: rows.slice(1, h).map(firstText).filter(Boolean).join(" • ") || null,
      headers,
      rows: data,
    });
  });

  if (!sheets.length) throw new Error("لم يتم العثور على جداول في الملف");
  return { meta, sheets };
}
