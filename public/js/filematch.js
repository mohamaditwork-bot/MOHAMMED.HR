// Matching folders/files from a zip to employees, and sorting files into categories.
// Pure functions (no DOM) so they can be tested in Node.

const AR_DIAC = /[ً-ْـ]/g;
export function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(AR_DIAC, "")
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_\-.()[\],0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SYN = [
  [/^(mohammed|mohamed|muhammad|mohammad|muhammed|mohamad|mohd|md)$/, "mohammed"],
  [/^(ahmed|ahmad|ahmd)$/, "ahmed"],
  [/^(abdul|abdel|abd|abdal)$/, "abd"],
  [/^محمد$/, "mohammed"], [/^احمد$/, "ahmed"],
];
const STOP = new Set(["al", "el", "bin", "ibn", "bint", "abu", "mr", "mrs", "ms", "مستر", "بن", "بنت", "ال", "ابو"]);
// Words that describe the file, not the person.
const FILE_WORDS = new Set(["id", "iqama", "copy", "scan", "picture", "photo", "pic", "cv", "resume", "iban", "passport", "contract", "experience", "certificate", "letter", "new", "old",
  "هويه", "هوية", "اقامه", "اقامة", "عقد", "قوي", "قوى", "صوره", "صورة", "جواز", "سيره", "شهاده", "خبره", "زوجه", "زوجة", "ابن", "بنت", "ايبان", "بنك", "نسخه"]);

export function tokens(s) {
  const out = [];
  for (let w of normName(s).split(" ")) {
    if (!w || STOP.has(w) || FILE_WORDS.has(w)) continue;
    if (/^(al|el)[a-z]{3,}$/.test(w)) w = w.slice(2);
    if (/^ال[؀-ۿ]{3,}$/.test(w)) w = w.slice(2);
    if (/^abd(ul|el|al)?[a-z]{3,}$/.test(w)) { out.push("abd"); w = w.replace(/^abd(ul|el|al)?/, ""); }
    if (/^عبد[؀-ۿ]{2,}$/.test(w)) { out.push("abd"); w = w.slice(3); }
    for (const [re, to] of SYN) if (re.test(w)) { w = to; break; }
    if (w.length >= 2) out.push(w);
  }
  return out;
}

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const same = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && lev(a, b) <= 1);

// Score 0..1 of a text (folder or file name) against one employee.
export function scoreName(text, emp) {
  const t = tokens(text).filter((x) => x !== "abd" && x !== "mohammed" && x !== "ahmed");
  const all = tokens(text);
  if (!all.length) return 0;
  const names = [...tokens(emp.name_en), ...tokens(emp.name_ar)];
  const hits = all.filter((w) => names.some((n) => same(w, n))).length;
  const strong = t.filter((w) => names.some((n) => same(w, n))).length;
  if (!strong && all.length > 1) return 0; // only common first names in common is not enough
  return hits / all.length;
}

export function bestEmployee(texts, employees) {
  let best = null;
  for (const e of employees) {
    let s = 0;
    for (const tx of texts) s = Math.max(s, scoreName(tx, e));
    if (!best || s > best.score) best = { emp: e, score: s };
  }
  return best && best.score >= 0.6 ? best : null;
}

// ID numbers in names or the folder → exact match.
export function byIdNumber(texts, employees) {
  for (const tx of texts) {
    for (const n of String(tx).match(/\b[12]\d{9}\b/g) || []) {
      const e = employees.find((x) => x.id_no === n);
      if (e) return e;
    }
  }
  return null;
}

export function categorize(fileName) {
  const n = normName(fileName);
  const has = (re) => re.test(n);
  if (has(/زوجه|زوج |wife|husband|\bson\b|daughter|ابن|بنت|ولد|افراد الاسره|family|dependent|تابع/)) return "dependent";
  if (has(/health|baladya|baladiya|بلديه|شهاده صحيه|صحيه/)) return "health";
  if (has(/passport|جواز/)) return "passport";
  if (has(/(^|[^a-z])(loi|jd)(?![a-z])|offer|عرض وظيفي|وصف وظيفي|job description/)) return "offer";
  if (has(/مباشره|مباشرة|joining|join date/)) return "joining";
  if (has(/عنوان الوطني|العنوان|address/)) return "address";
  if (has(/نموذج|\bform\b/)) return "form";
  if (has(/عقد|contract|قوي|qiwa/)) return "contract";
  if (has(/\biban\b|ايبان|بنك|bank/)) return "iban";
  if (has(/\bcv\b|resume|سيره|سيرة/)) return "cv";
  if (has(/experi|expir|خبره|خبرة|\bexp\b/)) return "experience";
  if (has(/certificate|degree|diploma|qualification|secondr|secondary|ثانوي|جامع|شهاده|مؤهل/)) return "certificate";
  if (has(/picture|photo|\bpic\b|صوره شخصيه|personal/)) return "photo";
  if (has(/\bid\b|iqama|هويه|اقامه|residen|الهويه الوطنيه/)) return "iqama";
  return "other";
}

// Within one folder: "Picture6.png"-style files count as the photo only when no explicit photo file exists.
export function categorizeFolder(files) {
  const cats = files.map((f) => categorize(f.name));
  const explicit = files.some((f, i) => cats[i] === "photo" && /photo|صوره|صورة/i.test(f.name));
  return cats.map((c, i) => (c === "photo" && explicit && /^picture\d*\./i.test(files[i].name) ? "other" : c));
}

export const CAT_TO_DOC = { iqama: "iqama", passport: "passport", contract: "contract", health: "health" };

// Group zip entries (paths) into employee folders: the folder that directly holds the files.
export function groupEntries(paths) {
  const groups = new Map();
  for (const p of paths) {
    const parts = p.split("/").filter(Boolean);
    if (parts.length < 1) continue;
    const file = parts[parts.length - 1];
    if (/^\.|^__MACOSX$|thumbs\.db/i.test(file) || parts.includes("__MACOSX")) continue;
    const folder = parts.slice(0, -1).join("/") || "(root)";
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push({ path: p, name: file });
  }
  return groups;
}

// Match one folder: by ID number, then folder name, then the person names inside file names, then job title.
export function matchFolder(folder, files, employees) {
  const parts = folder.split("/");
  const leaf = parts[parts.length - 1];
  const viaId = byIdNumber([folder, ...files.map((f) => f.name)], employees);
  if (viaId) return { emp: viaId, how: "id", score: 1 };
  // Folder name and the person's names inside file names are weighed together,
  // so "MD Rajib" with "MD RAZIB BUYIA.pdf" goes to Razib, not to a similar "Rakib".
  const own = files.filter((f) => categorize(f.name) !== "dependent").map((f) => f.name);
  let best = null;
  for (const e of employees) {
    const fs = scoreName(leaf, e);
    let ff = 0, sum = 0;
    for (const n of own) { const v = scoreName(n, e); ff = Math.max(ff, v); sum += v; }
    if (fs < 0.6 && ff < 0.6) continue;
    // Best single file + how consistently ALL files point to this person.
    const total = fs + ff * 0.8 + (own.length ? (sum / own.length) * 0.6 : 0) + (e.kind === "staff" ? 0.05 : 0);
    if (!best || total > best.total) best = { emp: e, score: Math.max(fs, ff), total, how: fs >= 0.6 ? "folder" : "files" };
  }
  if (best) return { emp: best.emp, score: best.score, how: best.how };
  const lt = normName(leaf);
  const byTitle = employees.filter((e) => normName(e.job_title) === lt);
  if (byTitle.length === 1) return { emp: byTitle[0], score: 0.7, how: "title" };
  return null;
}
