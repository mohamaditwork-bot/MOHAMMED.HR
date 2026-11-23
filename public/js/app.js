// HR control platform — single page app (vanilla ES modules, no build step).
import { t, f, getLang, setLang } from "./i18n.js";
import { renderDoc, GRADES, DECISIONS, STATUS as APR_STATUS } from "./appraisal-doc.js";
import {
  DOC_TYPES, DEFAULT_SETTINGS, docStatus, buildAlerts, ratio, groupRatio, isSaudi, saudisNeeded, ruleCoverage, leavingReason, renewalReady,
} from "./logic.js";

// ================= helpers =================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const fmtDate = (v) => (typeof v === "string" && ISO.test(v.slice(0, 10)) ? v.slice(0, 10).split("-").reverse().join("-") : v ?? "");
const fmtNum = (n, d = 0) => (n === null || n === undefined || n === "" || isNaN(Number(n)) ? "" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d }));
const pct = (x) => (isFinite(x) ? x.toFixed(1) + "%" : "—");
const norm = (s) => String(s ?? "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";
const L = () => getLang();

let ME = null;
let FEATURES = { ai: false, email: false };
let D = null; // all data
let EMP = new Map(); // id -> employee
let charts = [];
const tableState = {};

const canEdit = () => ME && (ME.role === "editor" || ME.role === "admin");
const isAdmin = () => ME && ME.role === "admin";
const settings = () => ({ ...DEFAULT_SETTINGS, ...(D?.settings || {}) });

async function api(path, opts = {}) {
  const o = { ...opts };
  if (o.body && typeof o.body !== "string" && !(o.body instanceof Blob) && !(o.body instanceof ArrayBuffer)) {
    o.body = JSON.stringify(o.body);
    o.headers = { "content-type": "application/json", ...(o.headers || {}) };
  }
  const r = await fetch(path, o);
  if (r.status === 401) {
    location.replace("/");
    throw new Error("401");
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || d.reason || "Error"), { status: r.status, data: d });
  return d;
}

function toast(msg, err = false, ms = 2600) {
  const el = document.createElement("div");
  el.className = "toast" + (err === "warn" ? " warn" : err ? " err" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

async function reload() {
  D = await api("/api/all");
  // Used / expired exit-re-entry visas are history: keep them out of every screen.
  const today = new Date().toISOString().slice(0, 10);
  D.documents = D.documents.filter((d) => !(d.doc_type === "exit_reentry" && d.expiry_date && d.expiry_date < today));
  EMP = new Map(D.employees.map((e) => [e.id, e]));
}

const empName = (e) => (e ? (L() === "en" && e.name_en ? e.name_en : e.name_ar) : "");
const docLabel = (k) => (DOC_TYPES[k] ? DOC_TYPES[k][L()] : k);
const stPill = (s) => `<span class="pill s-${s}">${esc(t("st." + s))}</span>`;
const daysCell = (d) => (d === null || d === undefined ? "" : `<span class="num ${d < 0 ? "d-exp" : ""}">${d}</span>`);

// ================= icons =================
const I = {
  dashboard: "M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z",
  employees: "M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h7v-2.5c0-.9.4-1.7 1-2.4A9 9 0 0 0 8 13zm8 0c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z",
  labor: "M12 2 1 7l11 5 9-4.1V15h2V7zm-7 9.2V15c0 2.2 3.1 4 7 4s7-1.8 7-4v-3.8l-7 3.2z",
  documents: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-1 7V3.5L18.5 9zM8 13h8v2H8zm0 4h8v2H8z",
  saudization: "M4 20h16v2H4zM6 10h3v8H6zm5-4h3v12h-3zm5 7h3v5h-3z",
  recruitment: "M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zM6 10V7H4v3H1v2h3v3h2v-3h3v-2zm9 4c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z",
  insurance: "M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5zm-1 6h2v4h4v2h-4v4h-2v-4H7v-2h4z",
  dependents: "M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-7 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm14 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 13c3 0 7 1.5 7 4v3H5v-3c0-2.5 4-4 7-4z",
  tasks: "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z",
  platforms: "M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z",
  assistant: "M12 2a2 2 0 0 1 2 2c0 .7-.4 1.4-1 1.7V7h5a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3h5V5.7A2 2 0 0 1 12 2zM9 11.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
  import: "M5 20h14v-2H5zM19 9h-4V3H9v6H5l7 7z",
  settings: "M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 0 0 1.7 1L11 21h4l.4-2.7a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z",
  users: "M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z",
  leaves: "M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14zM7 11h5v5H7z",
  movements: "M16 17.01V10h-2v7.01h-3L15 21l4-3.99zM9 3 5 6.99h3V14h2V6.99h3z",
  appraisals: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-1 7V3.5L18.5 9zM7 18l2.5-3 1.8 2.2L14 14l3 4z",
  reports: "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM9 17H7v-7h2zm4 0h-2V7h2zm4 0h-2v-4h2z",
  trash: "M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z",
  audit: "M13 3a9 9 0 0 0-9 9H1l4 4 4-4H6a7 7 0 1 1 2.1 5l-1.4 1.4A9 9 0 1 0 13 3zm-1 5v5l4.3 2.5.7-1.2-3.5-2.1V8z",
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${I[k] || I.dashboard}"/></svg>`;

const NAV = [
  ["nav.main", ["dashboard", "reports", "assistant"]],
  ["nav.people", ["employees", "labor", "leaves", "movements", "appraisals", "dependents"]],
  ["nav.compliance", ["documents", "insurance", "platforms", "tasks"]],
  ["nav.growth", ["saudization", "recruitment"]],
  ["nav.tools", ["import", "trash"]],
  ["nav.admin", ["settings", "users", "audit"], true],
];

function renderNav() {
  const st = settings();
  const alerts = buildAlerts(D.employees, D.documents, st, undefined, { appraisals: D.appraisals || [], attachments: D.attachments || [] });
  const counts = {
    employees: D.employees.filter((e) => e.kind === "staff" && e.status !== "left").length,
    labor: D.employees.filter((e) => e.kind === "labor" && e.status !== "left").length,
    documents: alerts.length,
    tasks: D.tasks.filter((x) => x.status === "open").length,
    recruitment: D.applicants.filter((a) => !["hired", "rejected"].includes(a.stage)).length,
    leaves: D.leaves.filter((l) => l.status === "pending").length,
    appraisals: (D.appraisals || []).filter((a) => a.status !== "completed").length,
  };
  let h = "";
  for (const [g, items, adminOnly] of NAV) {
    if (adminOnly && !isAdmin()) continue;
    h += `<div class="nav-group">${esc(t(g))}</div>`;
    for (const k of items) {
      const c = counts[k];
      const badge = c ? `<span class="badge ${k === "documents" || k === "tasks" || k === "leaves" ? "alert" : ""}">${c}</span>` : "";
      h += `<a href="#${k}" data-k="${k}">${icon(k)}<span>${esc(t("p." + k))}</span>${badge}</a>`;
    }
  }
  $("#nav").innerHTML = h;
  $$("#nav a").forEach((el) => el.addEventListener("click", () => { tableState.report = null; }));
  $("#me").innerHTML = `<b>${esc(ME.name)}</b><span style="color:#a8a9d2">${esc(t("role." + ME.role))}</span><div>
    <button id="pwBtn">${esc(t("change.password"))}</button><button id="outBtn">${esc(t("logout"))}</button></div>`;
  $("#pwBtn").onclick = openPassword;
  $("#outBtn").onclick = async () => {
    await fetch("/api/logout", { method: "POST" });
    location.replace("/");
  };
  markActive();
}

function paintChrome() {
  const st = settings();
  $("#topTitle").textContent = t("app");
  $("#topSub").textContent = L() === "en" ? st.hotel_name_en : st.hotel_name_ar;
  $("#sideSub").textContent = t("hr");
  $("#gq").placeholder = t("search.global");
  $("#langBtn").textContent = t("lang");
  $("#themeBtn").title = t("theme");
  $("#printBtn").title = t("print");
}

const PAGES = {};
function currentPage() {
  const k = (location.hash || "#dashboard").slice(1).split("/")[0];
  if (["settings", "users", "audit"].includes(k) && !isAdmin()) return "dashboard";
  return PAGES[k] ? k : "dashboard";
}
function markActive() {
  const k = currentPage();
  $$("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.k === k));
}

function route() {
  charts.forEach((c) => c.dispose());
  charts = [];
  const k = currentPage();
  markActive();
  $("#side").classList.remove("open");
  document.title = t("p." + k) + " — " + t("app");
  $("#printTitle").textContent = t("p." + k);
  $("#footTxt").textContent = `${settings()[L() === "en" ? "hotel_name_en" : "hotel_name_ar"] || "Novotel"} — ${t("app")}`;
  $("#footMeta").textContent = `© ${new Date().getFullYear()} • ${t("print.generated")}: ${fmtDate(new Date().toISOString())}`;
  $("#printMeta").textContent = `${settings()[L() === "en" ? "hotel_name_en" : "hotel_name_ar"]} • ${t("print.generated")}: ${fmtDate(new Date().toISOString())} • ${t("print.by")}: ${ME.name}`;
  PAGES[k]();
}

function head(title, sub, actions = "") {
  return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}</div><div class="acts">${actions}</div></div>`;
}

// ================= charts =================
function chart(el, option) {
  if (!window.echarts || !el) return;
  const c = echarts.init(el, isDark() ? "dark" : null, { renderer: "svg" });
  const font = getComputedStyle(document.body).fontFamily;
  c.setOption({ backgroundColor: "transparent", textStyle: { fontFamily: font }, ...option });
  charts.push(c);
}
window.addEventListener("resize", () => charts.forEach((c) => c.resize()));
const PALETTE = ["#23234f", "#c9a24b", "#2f62c9", "#1d8048", "#e8892a", "#8e44ad", "#16a3a3", "#c4372a", "#7f8c8d", "#5d6dd6"];
const palette = () => (isDark() ? ["#9ea3ff", "#e3bf6b", "#8fb1ff", "#5ed492", "#ffb35c", "#c792ea", "#4fd1d1", "#ff7b6e", "#b0b7c3", "#7f8cff"] : PALETTE);

// ================= generic table =================
// cfg: { id, rows, cols:[{k,label,get,render,num,wrap}], filters:[{k,label,get}], chipKey, chipGet, chipLabel, onRow, exportName, actions }
function dataTable(root, cfg) {
  const st = (tableState[cfg.id] ||= { q: "", chip: "", f: {}, sort: null });
  const getv = (col, r) => (col.get ? col.get(r) : r[col.k]);
  const chipVals = cfg.chipGet ? [...new Set(cfg.rows.map(cfg.chipGet).filter((v) => v !== null && v !== undefined && v !== ""))] : [];
  const filters = (cfg.filters || []).map((fl) => ({
    ...fl,
    vals: [...new Set(cfg.rows.map(fl.get).filter((v) => v !== null && v !== undefined && v !== ""))].sort((a, b) => String(a).localeCompare(String(b), "ar")),
  }));

  root.innerHTML = `
    ${chipVals.length > 1 ? `<div class="chips">${["", ...chipVals].map((v) => `<button class="chip" data-v="${esc(v)}">${esc(v === "" ? t("all") : cfg.chipLabel ? cfg.chipLabel(v) : v)} <b>${v === "" ? cfg.rows.length : cfg.rows.filter((r) => cfg.chipGet(r) === v).length}</b></button>`).join("")}</div>` : ""}
    <div class="toolbar">
      <input class="input q" placeholder="${esc(t("search"))}" value="${esc(st.q)}">
      ${filters.filter((fl) => fl.vals.length > 1).map((fl) => `<select class="input" data-f="${fl.k}"><option value="">${esc(fl.label)}</option>${fl.vals.map((v) => `<option value="${esc(v)}" ${st.f[fl.k] === String(v) ? "selected" : ""}>${esc(fl.fmt ? fl.fmt(v) : v)}</option>`).join("")}</select>`).join("")}
      ${cfg.actions || ""}
      <button class="btn ghost sm xl">${esc(t("export"))}</button>
      <span class="count"></span>
    </div>
    <div class="tbl"><table><thead><tr>${cfg.cols.map((c, i) => `<th data-i="${i}" class="${c.num ? "num" : ""}">${esc(c.label)} ${st.sort && st.sort.i === i ? (st.sort.d > 0 ? "▲" : "▼") : ""}</th>`).join("")}</tr></thead><tbody></tbody></table></div>`;

  const filtered = () => {
    const q = norm(st.q);
    let rows = cfg.rows.filter((r) => {
      if (st.chip && cfg.chipGet && String(cfg.chipGet(r)) !== st.chip) return false;
      for (const fl of filters) if (st.f[fl.k] && String(fl.get(r)) !== st.f[fl.k]) return false;
      if (!q) return true;
      return cfg.cols.some((c) => norm(fmtDate(getv(c, r))).includes(q)) || (cfg.searchExtra && norm(cfg.searchExtra(r)).includes(q));
    });
    if (st.sort) {
      const c = cfg.cols[st.sort.i];
      rows = [...rows].sort((a, b) => {
        const x = getv(c, a), y = getv(c, b);
        if (x === null || x === undefined || x === "") return 1;
        if (y === null || y === undefined || y === "") return -1;
        const nx = Number(x), ny = Number(y);
        return (!isNaN(nx) && !isNaN(ny) && x !== "" ? nx - ny : String(x).localeCompare(String(y), "ar")) * st.sort.d;
      });
    }
    return rows;
  };
  const draw = () => {
    const rows = filtered();
    $("tbody", root).innerHTML = rows.length
      ? rows.map((r) => `<tr class="${cfg.onRow ? "click" : ""}" data-id="${esc(r.id)}">${cfg.cols.map((c) => `<td class="${c.num ? "num" : ""} ${c.wrap ? "wrap" : ""}">${c.render ? c.render(r) : esc(fmtDate(getv(c, r)))}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${cfg.cols.length}" class="empty">${esc(t("none"))}</td></tr>`;
    $(".count", root).textContent = `${rows.length} ${t("of")} ${cfg.rows.length}`;
    $$(".chip", root).forEach((c) => c.classList.toggle("on", c.dataset.v === st.chip));
    if (cfg.onRow) $$("tbody tr[data-id]", root).forEach((tr) => tr.addEventListener("click", (e) => {
      if (e.target.closest("button,a,select,input")) return;
      cfg.onRow(cfg.rows.find((r) => String(r.id) === tr.dataset.id));
    }));
    if (cfg.afterDraw) cfg.afterDraw(root);
  };
  $(".q", root).addEventListener("input", (e) => { st.q = e.target.value; draw(); });
  $$("select[data-f]", root).forEach((s) => s.addEventListener("change", () => { st.f[s.dataset.f] = s.value; draw(); }));
  $$(".chip", root).forEach((c) => c.addEventListener("click", () => { st.chip = c.dataset.v; draw(); }));
  $$("th[data-i]", root).forEach((th) => th.addEventListener("click", () => {
    const i = +th.dataset.i;
    st.sort = st.sort && st.sort.i === i ? (st.sort.d > 0 ? { i, d: -1 } : null) : { i, d: 1 };
    dataTable(root, cfg);
  }));
  $(".xl", root).addEventListener("click", () => exportXlsx(cfg.exportName || cfg.id, cfg.cols.filter((c) => !c.noExport), filtered(), getv));
  draw();
}

function exportXlsx(name, cols, rows, getv) {
  if (!window.XLSX) return toast("Excel library is still loading", true);
  const aoa = [cols.map((c) => c.label), ...rows.map((r) => cols.map((c) => {
    const v = c.exportGet ? c.exportGet(r) : getv(c, r);
    return typeof v === "string" && ISO.test(v) ? fmtDate(v) : v ?? "";
  }))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (L() === "ar") ws["!views"] = [{ RTL: true }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, String(name).slice(0, 30));
  XLSX.writeFile(wb, `${name}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Does the employee's exit/re-entry visa cover this leave?
function visaCovers(l) {
  const d = D.documents.find((x) => x.employee_id === l.employee_id && x.doc_type === "exit_reentry");
  return !!(d && d.issue_date && d.expiry_date && d.issue_date <= l.start_date && d.expiry_date >= l.end_date);
}

// ================= forms =================
const OPTS = {
  gender: () => [["ذكر", L() === "en" ? "Male" : "ذكر"], ["أنثى", L() === "en" ? "Female" : "أنثى"]],
  status: () => [["active", t("emp.active")], ["left", t("emp.left")]],
  kind: () => [["staff", t("p.employees")], ["labor", t("p.labor")]],
  doc_type: () => Object.keys(DOC_TYPES).map((k) => [k, docLabel(k)]),
  employee_id: () => D.employees.slice().sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar")).map((e) => [String(e.id), `${empName(e)} — ${e.id_no || ""}`]),
  job_id: () => D.jobs.map((j) => [String(j.id), j.title]),
  stage: () => ["new", "screening", "interview", "offer", "hired", "rejected"].map((s) => [s, t("stage." + s)]),
  jobstatus: () => ["open", "on_hold", "closed"].map((s) => [s, t("job." + s)]),
  taskstatus: () => [["open", t("task.open")], ["done", t("task.done")]],
  category: () => ["general", "renewal", "insurance", "missing_date", "platform"].map((s) => [s, t("cat." + s)]),
  saudi_only: () => [["false", t("no")], ["true", t("yes")]],
  leave_type: () => ["annual", "sick", "emergency", "unpaid", "hajj", "maternity", "other"].map((k) => [k, t("lv." + k)]),
  yesno: () => [["false", t("no")], ["true", t("yes")]],
  leave_status: () => ["pending", "approved", "rejected"].map((k) => [k, t("ls." + k)]),
  move_type: () => ["promotion", "transfer", "salary", "title", "contract", "warning", "termination", "resignation", "other"].map((k) => [k, t("mv." + k)]),
};

const FORMS = {
  staff: [
    ["", ["name_ar*", "name_en", "emp_no", "id_no", "nationality", "gender:gender", "birth_date:date", "mobile", "email", "national_address"]],
    ["job", ["sector", "department", "job_title", "iqama_job", "qiwa_job", "join_date:date", "grade", "leave_days:number", "status:status"]],
    ["salary", ["basic_salary:number", "housing", "transport", "total_salary:number", "bank", "iban"]],
    ["other", ["qualification", "specialty", "experience", "gosi", "notes:textarea"]],
  ],
  labor: [
    ["", ["name_ar*", "name_en", "emp_no", "id_no", "company", "nationality", "birth_date:date", "mobile"]],
    ["job", ["department", "job_title", "iqama_job", "work_hours:number", "join_date:date", "start_date:date", "basic_salary:number", "status:status", "notes:textarea"]],
  ],
  documents: [["", ["employee_id*:employee_id", "doc_type*:doc_type", "number", "issue_date:date", "expiry_date:date", "notes:textarea"]]],
  dependents: [["", ["employee_id:employee_id", "name*", "iqama_no", "relation", "passport_expiry:date", "notes:textarea"]]],
  insurance: [["", ["employee_id:employee_id", "member_name*", "id_no", "relation", "class", "gender:gender", "nationality", "birth_date:date", "mobile", "member_no", "notes:textarea"]]],
  tasks: [["", ["title*", "category:category", "status:taskstatus", "person", "id_no", "due_date:date", "details:textarea"]]],
  jobs: [["", ["title*", "department", "openings:number", "saudi_only:saudi_only", "status:jobstatus", "salary_range", "description:textarea"]]],
  applicants: [["", ["name*", "job_id:job_id", "stage:stage", "nationality", "id_no", "mobile", "email", "rating:number", "source", "expected_salary:number", "notes:textarea", "cv_text:textarea"]]],
  leaves: [["", ["employee_id*:employee_id", "leave_type:leave_type", "start_date*:date", "end_date*:date", "outside_ksa:yesno", "status:leave_status", "notes:textarea"]]],
  movements: [["", ["employee_id*:employee_id", "move_type*:move_type", "move_date*:date", "from_value", "to_value", "notes:textarea"]]],
  saud_rules: [["", ["name*", "required_pct:number", "source", "effective_date:date", "occupations:textarea", "notes:textarea"]]],
};
const SEC = { job: ["بيانات الوظيفة", "Job"], salary: ["الراتب والبنك", "Salary & bank"], other: ["أخرى", "Other"] };

function fieldHtml(spec, row) {
  const [name, type = "text"] = spec.split(":");
  const req = name.endsWith("*");
  const k = name.replace("*", "");
  let v = row?.[k];
  if (v === null || v === undefined) v = "";
  if (typeof v === "boolean") v = String(v);
  const label = `<label class="fl">${esc(f(k))}${req ? " *" : ""}</label>`;
  const full = type === "textarea" ? "full" : "";
  let input;
  if (OPTS[type]) {
    input = `<select class="input" name="${k}" ${req ? "required" : ""}><option value=""></option>${OPTS[type]().map(([val, lab]) => `<option value="${esc(val)}" ${String(v) === String(val) ? "selected" : ""}>${esc(lab)}</option>`).join("")}</select>`;
  } else if (type === "textarea") {
    input = `<textarea class="input" name="${k}">${esc(v)}</textarea>`;
  } else {
    const it = type === "date" ? "date" : type === "number" ? "number" : k === "email" ? "email" : "text";
    const ltr = ["date", "number"].includes(type) || ["id_no", "iqama_no", "mobile", "iban", "email", "emp_no", "member_no", "number"].includes(k);
    input = `<input class="input" type="${it}" ${it === "number" ? 'step="any"' : ""} name="${k}" value="${esc(String(v).slice(0, it === "date" ? 10 : undefined))}" ${req ? "required" : ""} ${ltr ? 'dir="ltr"' : ""}>`;
  }
  return `<div class="${full}">${label}${input}</div>`;
}

// Opens an add/edit form for any table. preset = values for a new record.
function openForm(table, row, { form, title, preset, onSaved } = {}) {
  const groups = FORMS[form || table];
  const data = row || preset || {};
  const m = modal(`
    <header><div><h3>${esc(title || (row ? t("edit") : t("add")))}</h3>${row ? `<small>${esc(row.name_ar || row.name || row.title || row.member_name || "")}</small>` : ""}</div><button class="x" data-close>×</button></header>
    <form class="body" id="frm">${groups.map(([sec, fields]) => `${sec ? `<div class="form-sec">${esc(SEC[sec][L() === "en" ? 1 : 0])}</div>` : ""}<div class="form-grid">${fields.map((s) => fieldHtml(s, data)).join("")}</div>`).join("")}
      <p class="msg err" id="ferr"></p></form>
    <footer>${row && canEdit() ? `<button class="btn danger sm" id="fdel" style="margin-inline-end:auto">${esc(t("delete"))}</button>` : ""}
      <button class="btn ghost" data-close>${esc(t("cancel"))}</button><button class="btn" id="fsave">${esc(t("save"))}</button></footer>`);
  if (!canEdit()) {
    $$("input,select,textarea", m.root).forEach((x) => (x.disabled = true));
    $("#fsave", m.root).remove();
  }
  $("#fsave", m.root)?.addEventListener("click", async () => {
    const frm = $("#frm", m.root);
    if (!frm.reportValidity()) return;
    const body = Object.fromEntries(new FormData(frm).entries());
    if (preset) for (const [k, v] of Object.entries(preset)) if (!(k in body)) body[k] = v;
    if (row) body.id = row.id;
    try {
      const out = await api(`/api/rows?table=${table}`, { method: row ? "PUT" : "POST", body });
      m.close();
      if (out.warning) toast("✈️ " + out.warning, "warn", 9000); else toast(t("saved"));
      await refresh();
      onSaved && onSaved(out.row);
    } catch (e) {
      $("#ferr", m.root).textContent = e.message;
    }
  });
  $("#fdel", m.root)?.addEventListener("click", async () => {
    if (!confirm(t("confirm.delete"))) return;
    try {
      await api(`/api/rows?table=${table}`, { method: "DELETE", body: { id: row.id } });
      m.close();
      toast(t("deleted"));
      await refresh();
    } catch (e) {
      $("#ferr", m.root).textContent = e.message;
    }
  });
}

async function refresh() {
  await reload();
  renderNav();
  route();
}

function modal(html, cls = "") {
  const root = $("#modalRoot");
  const wrap = document.createElement("div");
  wrap.className = "modal-bg";
  wrap.innerHTML = `<div class="modal ${cls}" role="dialog">${html}</div>`;
  root.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) close(); });
  $$("[data-close]", wrap).forEach((b) => b.addEventListener("click", close));
  const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
  return { root: wrap, close };
}

function printModal(m) {
  document.body.classList.add("printing-modal");
  window.print();
  setTimeout(() => document.body.classList.remove("printing-modal"), 500);
}

// ================= DASHBOARD =================
PAGES.dashboard = () => {
  const st = settings();
  const active = D.employees.filter((e) => e.status !== "left");
  const staff = active.filter((e) => e.kind === "staff");
  const labor = active.filter((e) => e.kind === "labor");
  const r = ratio(staff);
  const docSt = D.documents.filter((d) => EMP.get(d.employee_id)?.status !== "left").map((d) => ({ d, s: docStatus(d, st) }));
  const cnt = (s) => docSt.filter((x) => x.s.status === s).length;
  const alerts = buildAlerts(D.employees, D.documents, st, undefined, { appraisals: D.appraisals || [], attachments: D.attachments || [] });
  const openJobs = D.jobs.filter((j) => j.status === "open");
  const activeApps = D.applicants.filter((a) => !["hired", "rejected"].includes(a.stage));
  const need = saudisNeeded(r, st.saudization_target);
  const kpi = (l, v, h, cls = "", go = "") => `<div class="card kpi ${cls} ${go ? "click" : ""}" ${go ? `data-go="${go}"` : ""}><div class="l">${esc(l)}</div><div class="v num">${v}</div><div class="h">${esc(h || "")}</div></div>`;

  if (!D.employees.length) {
    $("#view").innerHTML = `${welcome()}
      <div class="card empty-state"><div class="big">📂</div><h2>${esc(t("empty.title"))}</h2><p>${esc(t("empty.desc"))}</p>
      ${canEdit() ? `<a class="btn" href="#import">⬆ ${esc(t("empty.go"))}</a>` : ""}</div>`;
    return;
  }
  $("#view").innerHTML = `${welcome()}
    ${head(t("p.dashboard"), `${t("today")}: ${fmtDate(new Date().toISOString())}`, `${FEATURES.ai ? `<button class="btn" id="aiIns">✦ ${esc(t("ai.generate"))}</button>` : ""}<button class="btn ghost" data-act="print">${esc(t("print"))}</button>`)}
    <div id="aiOut"></div>
    <div class="grid kpis">
      ${kpi(t("k.staff"), r.total, "", "", "employees")}
      ${kpi(t("k.saudi"), r.saudi, "", "green")}
      ${kpi(t("k.ratio"), pct(r.pct), st.saudization_target ? `${t("k.target")}: ${st.saudization_target}%` : "", "blue", "saudization")}
      ${kpi(t("k.nonsaudi"), r.non_saudi, "")}
      ${kpi(t("k.labor"), labor.length, `${new Set(labor.map((e) => e.company).filter(Boolean)).size} ${t("k.companies")}`, "", "labor")}
      ${kpi(t("k.workforce"), staff.length + labor.length, "")}
      ${kpi(t("k.expired"), cnt("expired"), "", "red", "documents/expired")}
      ${kpi(t("k.near"), cnt("near"), `${t("set.iqama")} ${st.iqama} • ${t("set.contracts")} ${st.contracts} • ${t("set.docs")} ${st.docs}`, "orange", "documents/near")}
      ${kpi(t("k.nodate"), cnt("none"), "", "", "documents/none")}
      ${kpi(t("k.openjobs"), openJobs.reduce((s, j) => s + (Number(j.openings) || 1), 0), `${activeApps.length} ${t("k.applicants")}`, "", "recruitment")}
      ${kpi(t("k.tasks"), D.tasks.filter((x) => x.status === "open").length, "", "", "tasks")}
      ${need !== null ? kpi(t("k.needed"), need, `${t("k.target")} ${st.saudization_target}%`, need ? "orange" : "green", "saudization") : ""}
    </div>
    <div class="grid g3">
      <div class="card"><h3>${esc(t("c.saud"))}</h3><div class="chart" id="chSaud"></div></div>
      <div class="card"><h3>${esc(t("c.docs"))}</h3><div class="chart" id="chDocs"></div></div>
      <div class="card"><h3>${esc(t("c.nat"))}</h3><div class="chart" id="chNat"></div></div>
    </div>
    <div class="grid g2">
      <div class="card"><h3>${esc(t("c.dept"))}</h3><div class="chart" id="chDept" style="height:360px"></div></div>
      <div class="card"><h3>${esc(t("urgent"))} <span class="pill s-expired">${alerts.length}</span></h3>
        <div class="tbl compact" style="max-height:360px;overflow:auto"><table><thead><tr><th>${esc(f("name"))}</th><th>${esc(t("doc.type"))}</th><th>${esc(t("doc.expiry"))}</th><th class="num">${esc(t("doc.days"))}</th></tr></thead>
        <tbody>${alerts.slice(0, 60).map((a) => `<tr class="click" data-emp="${a.employee.id}"><td>${esc(empName(a.employee))}<br><small class="muted">${esc(a.employee.kind === "labor" ? a.employee.company || "" : a.employee.department || "")}</small></td><td>${esc(docLabel(a.doc.doc_type))}</td><td class="num">${esc(fmtDate(a.expiry))}</td><td class="num">${daysCell(a.days)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">✓</td></tr>`}</tbody></table></div></div>
    </div>
    <div class="grid g2">
      <div class="card"><h3>${esc(t("c.company"))}</h3><div class="chart" id="chComp"></div></div>
      <div class="card"><h3>${esc(t("c.funnel"))}</h3><div class="chart" id="chFunnel"></div></div>
    </div>`;

  $$("[data-go]").forEach((el) => el.addEventListener("click", () => {
    const [p, s] = el.dataset.go.split("/");
    if (s) tableState.docs = { ...(tableState.docs || { q: "", f: {}, sort: null }), chip: t("st." + s) };
    location.hash = p;
  }));
  $$("[data-emp]").forEach((el) => el.addEventListener("click", () => openProfile(+el.dataset.emp)));
  $("#aiIns")?.addEventListener("click", () => aiPanel($("#aiOut"), "insights", t("ai.insights")));

  const pal = palette();
  const label = { color: isDark() ? "#e8e9f3" : "#191a2c" };
  chart($("#chSaud"), {
    color: [pal[3], pal[1]],
    tooltip: { trigger: "item" },
    legend: { bottom: 0, textStyle: label },
    series: [{ type: "pie", radius: ["55%", "78%"], center: ["50%", "45%"], label: { show: true, position: "center", formatter: () => pct(r.pct), fontSize: 26, fontWeight: 800, color: label.color },
      data: [{ name: t("k.saudi"), value: r.saudi }, { name: t("k.nonsaudi"), value: r.non_saudi }] }],
  });
  const types = Object.keys(DOC_TYPES).filter((k) => docSt.some((x) => x.d.doc_type === k));
  const series = ["expired", "near", "ok", "used", "none"].map((s, i) => ({
    name: t("st." + s), type: "bar", stack: "a", barMaxWidth: 26,
    itemStyle: { color: ["#c4372a", "#e8892a", "#1d8048", "#7f8fb5", "#9aa0b4"][i] },
    data: types.map((k) => docSt.filter((x) => x.d.doc_type === k && x.s.status === s).length),
  }));
  chart($("#chDocs"), { tooltip: { trigger: "axis" }, legend: { bottom: 0, textStyle: label }, grid: { top: 10, left: 8, right: 8, bottom: 40, containLabel: true },
    xAxis: { type: "category", data: types.map(docLabel), axisLabel: { interval: 0, rotate: 30, color: label.color } }, yAxis: { type: "value", axisLabel: label }, series });
  const nat = groupRatio(staff, "nationality");
  const topNat = nat.slice(0, 7);
  const restNat = nat.slice(7).reduce((s, g) => s + g.total, 0);
  chart($("#chNat"), { color: pal, tooltip: { trigger: "item" }, legend: { type: "scroll", bottom: 0, textStyle: label },
    series: [{ type: "pie", radius: "68%", center: ["50%", "44%"], label: { show: false }, data: [...topNat.map((g) => ({ name: g.key, value: g.total })), ...(restNat ? [{ name: L() === "en" ? "Other" : "أخرى", value: restNat }] : [])] }] });
  const dept = groupRatio(staff, "department").slice(0, 14).reverse();
  chart($("#chDept"), { tooltip: { trigger: "axis" }, legend: { bottom: 0, textStyle: label }, grid: { top: 10, left: 8, right: 16, bottom: 36, containLabel: true },
    xAxis: { type: "value", axisLabel: label }, yAxis: { type: "category", data: dept.map((g) => g.key), axisLabel: label },
    series: [{ name: t("k.saudi"), type: "bar", stack: "s", itemStyle: { color: pal[3] }, data: dept.map((g) => g.saudi) },
      { name: t("k.nonsaudi"), type: "bar", stack: "s", itemStyle: { color: pal[1] }, data: dept.map((g) => g.non_saudi) }] });
  const comp = groupRatio(labor, "company");
  chart($("#chComp"), { color: [pal[2]], tooltip: { trigger: "axis" }, grid: { top: 10, left: 8, right: 8, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: comp.map((g) => g.key), axisLabel: label }, yAxis: { type: "value", axisLabel: label }, series: [{ type: "bar", barMaxWidth: 40, data: comp.map((g) => g.total) }] });
  const stages = ["new", "screening", "interview", "offer", "hired"];
  chart($("#chFunnel"), { color: pal, tooltip: { trigger: "item" },
    series: [{ type: "funnel", left: "10%", width: "80%", sort: "none", minSize: "20%", label: { position: "inside", color: "#fff", fontWeight: 700 }, data: stages.map((s) => ({ name: t("stage." + s), value: D.applicants.filter((a) => a.stage === s).length })) }] });
};

// ================= AI helpers =================
function md(s) {
  // tiny markdown: headings, bold, bullets
  return esc(s)
    .replace(/^### (.*)$/gm, "<h3>$1</h3>").replace(/^## (.*)$/gm, "<h3>$1</h3>").replace(/^# (.*)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^\s*[-*] (.*)$/gm, "• $1");
}

async function aiPanel(box, mode, title, extra = {}) {
  if (!FEATURES.ai) return toast(t("ai.off"), true);
  box.innerHTML = `<div class="card" style="margin-bottom:16px"><h3>✦ ${esc(title)}</h3><div class="ai-box muted"><span class="dots">${esc(t("ai.thinking"))}</span></div></div>`;
  try {
    const out = await api("/api/ai", { method: "POST", body: { mode, lang: L(), ...extra } });
    $(".ai-box", box).classList.remove("muted");
    $(".ai-box", box).innerHTML = md(out.text || "");
    return out;
  } catch (e) {
    $(".ai-box", box).innerHTML = `<span class="d-exp">${esc(e.message)}</span>`;
  }
}

// ================= EMPLOYEES / LABOR =================
const rowActions = {
  k: "act", label: "", noExport: true, get: () => "",
  render: (e) => `<span class="row-acts"><button class="btn ghost sm" data-prof="${e.id}">${esc(t("actions.view"))}</button>${canEdit() ? `<button class="btn ghost sm" data-edit="${e.id}">${esc(t("edit"))}</button>` : ""}</span>`,
};
function bindRowActions(root) {
  $$("[data-prof]", root).forEach((b) => b.addEventListener("click", () => openProfile(+b.dataset.prof)));
  $$("[data-edit]", root).forEach((b) => b.addEventListener("click", () => { const e = EMP.get(+b.dataset.edit); openForm("employees", e, { form: e.kind }); }));
}

function peoplePage(kind) {
  const rows = D.employees.filter((e) => e.kind === kind);
  // Every document's status per employee, most urgent first — so the column can say WHICH document.
  const RANK = { expired: 3, near: 2, none: 1, ok: 0, used: 0 };
  const docsBy = new Map();
  for (const d of D.documents) {
    const s = docStatus(d, settings());
    if (!RANK[s.status]) continue;
    (docsBy.get(d.employee_id) || docsBy.set(d.employee_id, []).get(d.employee_id)).push({ d, s, rank: RANK[s.status] });
  }
  for (const list of docsBy.values()) list.sort((a, b) => b.rank - a.rank || (a.s.days ?? 0) - (b.s.days ?? 0));
  const issues = (e) => docsBy.get(e.id) || [];
  const worst = (e) => issues(e)[0]?.s.status || "ok";
  const chipKey = (e) => ({ expired: "pp.chip.expired", near: "pp.chip.near", none: "pp.chip.none" }[worst(e)] || "pp.chip.ok");
  const issueText = ({ d, s }) => s.status === "none"
    ? t("pp.nodate").replace("{d}", docLabel(d.doc_type))
    : `${docLabel(d.doc_type)} ${t(s.status === "expired" ? "pp.expired" : "pp.near")} ${fmtDate(s.expiry)}`;
  const docCell = (e) => {
    const list = issues(e);
    if (!list.length) return `<span class="pill s-ok">✔ ${esc(t("pp.allok"))}</span>`;
    const first = list[0];
    const icon = { expired: "⛔", near: "⏳", none: "⚪" }[first.s.status];
    return `<button class="doc-issue s-${first.s.status}" data-docs="${e.id}" title="${esc(list.map(issueText).join("\n"))}">${icon} ${esc(issueText(first))}${list.length > 1 ? ` <b>+${list.length - 1}</b>` : ""}</button>`;
  };
  const cols = kind === "staff"
    ? [
      { k: "emp_no", label: f("emp_no"), num: true },
      { k: "name", label: f("name"), get: (e) => empName(e), render: (e) => `<b>${esc(empName(e))}</b><br><small class="muted">${esc(L() === "en" ? e.name_ar : e.name_en || "")}</small>` },
      { k: "docs", label: t("pp.docs"), get: (e) => issues(e).map(issueText).join(" • ") || t("pp.allok"), render: docCell, wrap: true },
      { k: "id_no", label: f("id_no"), num: true },
      { k: "nationality", label: f("nationality"), render: (e) => `${esc(e.nationality || "")}${isSaudi(e.nationality) ? ' <span class="pill s-ok">KSA</span>' : ""}` },
      { k: "department", label: f("department") },
      { k: "job_title", label: f("job_title") },
      { k: "join_date", label: f("join_date"), num: true },
      { k: "total_salary", label: f("total_salary"), num: true, render: (e) => fmtNum(e.total_salary) },
      { k: "status", label: f("status"), get: (e) => t("emp." + e.status), render: (e) => `<span class="pill ${e.status === "left" ? "s-none" : "s-info"}">${esc(t("emp." + e.status))}</span>` },
      rowActions,
    ]
    : [
      { k: "emp_no", label: f("emp_no"), num: true },
      { k: "name", label: f("name"), get: (e) => empName(e), render: (e) => `<b>${esc(empName(e))}</b>` },
      { k: "docs", label: t("pp.docs"), get: (e) => issues(e).map(issueText).join(" • ") || t("pp.allok"), render: docCell, wrap: true },
      { k: "id_no", label: f("id_no"), num: true },
      { k: "company", label: f("company") },
      { k: "nationality", label: f("nationality") },
      { k: "department", label: f("department") },
      { k: "job_title", label: f("job_title") },
      { k: "basic_salary", label: f("basic_salary"), num: true, render: (e) => fmtNum(e.basic_salary) },
      { k: "status", label: f("status"), get: (e) => t("emp." + e.status), render: (e) => `<span class="pill ${e.status === "left" ? "s-none" : "s-info"}">${esc(t("emp." + e.status))}</span>` },
      rowActions,
    ];
  const title = t(kind === "staff" ? "p.employees" : "p.labor");
  $("#view").innerHTML = head(title, `${rows.filter((e) => e.status !== "left").length} ${t("emp.active")}`,
    `${canEdit() ? `<button class="btn" id="addEmp">+ ${esc(t("add"))}</button>` : ""}<button class="btn ghost" data-act="print">${esc(t("print"))}</button>`) + `<div class="card" id="tb"></div><p class="muted small legend">${t("pp.legend")}</p>`;
  $("#addEmp")?.addEventListener("click", () => openForm("employees", null, { form: kind, preset: { kind, status: "active" }, title: `${t("add")} — ${title}` }));
  dataTable($("#tb"), {
    id: "people-" + kind, rows, cols, exportName: title,
    filters: kind === "staff"
      ? [{ k: "department", label: t("filter.dept"), get: (e) => e.department }, { k: "nationality", label: t("filter.nat"), get: (e) => e.nationality }]
      : [{ k: "company", label: t("filter.company"), get: (e) => e.company }, { k: "nationality", label: t("filter.nat"), get: (e) => e.nationality }],
    chipGet: (e) => t(chipKey(e)),
    onRow: (e) => openProfile(e.id),
    afterDraw: (root) => {
      bindRowActions(root);
      $$("[data-docs]", root).forEach((b) => b.addEventListener("click", (ev) => { ev.stopPropagation(); openProfile(+b.dataset.docs, "docs"); }));
    },
    searchExtra: (e) => [e.name_ar, e.name_en, e.mobile, e.iqama_job].join(" "),
  });
}
PAGES.employees = () => peoplePage("staff");
PAGES.labor = () => peoplePage("labor");

function openProfile(id, tab) {
  const e = EMP.get(id);
  if (!e) return;
  const st = settings();
  const docs = D.documents.filter((d) => d.employee_id === id).map((d) => ({ ...d, s: docStatus(d, st) }));
  const deps = D.dependents.filter((d) => d.employee_id === id);
  const ins = D.insurance.filter((x) => x.employee_id === id);
  const p = e.platform || {};
  const lvs = D.leaves.filter((l) => l.employee_id === id);
  const mvs = D.movements.filter((x) => x.employee_id === id);
  const fls = D.attachments.filter((x) => x.employee_id === id);
  const bal = leaveBalance(e);
  const aprs = (D.appraisals || []).filter((a) => a.employee_id === id);
  const counts = { apr: aprs.length, docs: docs.length, files: fls.length, leaves: lvs.length, moves: mvs.length, deps: deps.length, ins: ins.length };
  const skip = new Set(["id", "kind", "platform", "created_at", "updated_at"]);
  const kv = Object.entries(e)
    .filter(([k, v]) => !skip.has(k) && v !== null && v !== "")
    .map(([k, v]) => `<div><span>${esc(f(k))}</span><b>${esc(k === "status" ? t("emp." + v) : typeof v === "number" || /salary/.test(k) ? fmtNum(v, 2) : fmtDate(v))}</b></div>`)
    .join("");
  const m = modal(`
    <header><div class="prof-h"><div><h3>${esc(empName(e))}</h3><small>${esc([e.job_title, e.department, e.company, e.id_no].filter(Boolean).join(" • "))}</small></div></div>
      <div style="display:flex;gap:6px">${canEdit() ? `<button class="btn sm" id="pEdit">${esc(t("edit"))}</button>` : ""}<button class="btn ghost sm" id="pPrint">${esc(t("print"))}</button><button class="x" data-close>×</button></div></header>
    <div class="body">
      <div class="print-head"><img src="/logo-navy.png" alt=""><div class="t"><b>${esc(empName(e))}</b>${esc(settings()[L() === "en" ? "hotel_name_en" : "hotel_name_ar"])} • ${esc(fmtDate(new Date().toISOString()))}</div></div>
      <div class="tabs no-print">${["info", "docs", "leaves", "moves", "apr", "deps", "ins", "plat"].map((k, i) => `<button data-tab="${k}" class="${i ? "" : "on"}">${esc({ info: t("details"), docs: t("p.documents"), files: t("files"), leaves: t("p.leaves"), moves: t("p.movements"), apr: t("p.appraisals"), deps: t("p.dependents"), ins: t("p.insurance"), plat: t("p.platforms") }[k])}${counts[k] ? ` (${counts[k]})` : ""}</button>`).join("")}</div>
      <div data-pane="info"><div class="kv">${kv}</div></div>
      <div data-pane="docs" class="hidden">
        ${canEdit() ? `<button class="btn sm no-print" id="pAddDoc" style="margin-bottom:10px">+ ${esc(t("doc.add"))}</button>` : ""}
        <div class="tbl compact"><table><thead><tr><th>${esc(t("doc.type"))}</th><th>${esc(t("doc.number"))}</th><th>${esc(t("doc.issue"))}</th><th>${esc(t("doc.expiry"))}</th><th class="num">${esc(t("doc.days"))}</th><th>${esc(t("doc.status"))}</th></tr></thead>
        <tbody>${docs.map((d) => `<tr class="click" data-doc="${d.id}"><td>${esc(docLabel(d.doc_type))}</td><td class="num">${esc(d.number || "")}</td><td class="num">${esc(fmtDate(d.issue_date))}</td><td class="num">${esc(fmtDate(d.s.expiry || d.expiry_date))}</td><td class="num">${daysCell(d.s.days)}</td><td>${stPill(d.s.status)}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">${esc(t("none"))}</td></tr>`}</tbody></table></div>
      </div>
      <div data-pane="leaves" class="hidden">
        <div class="kv" style="margin-bottom:12px"><div><span>${esc(t("lv.entitled"))}</span><b>${bal.entitled}</b></div><div><span>${esc(t("lv.used"))}</span><b>${bal.used}</b></div><div><span>${esc(t("lv.remaining"))}</span><b class="${bal.remaining < 0 ? "d-exp" : ""}">${bal.remaining}</b></div></div>
        ${canEdit() ? `<button class="btn sm no-print" id="pAddLv" style="margin-bottom:10px">+ ${esc(t("lv.add"))}</button>` : ""}
        <div class="tbl compact"><table><thead><tr><th>${esc(f("leave_type"))}</th><th>${esc(f("start_date"))}</th><th>${esc(f("end_date"))}</th><th class="num">${esc(f("days"))}</th><th>${esc(f("status"))}</th></tr></thead>
        <tbody>${lvs.map((l) => `<tr class="click" data-lv="${l.id}"><td>${esc(t("lv." + l.leave_type))}</td><td class="num">${esc(fmtDate(l.start_date))}</td><td class="num">${esc(fmtDate(l.end_date))}</td><td class="num">${fmtNum(l.days)}</td><td>${lvPill(l.status)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">${esc(t("none"))}</td></tr>`}</tbody></table></div>
      </div>
      <div data-pane="moves" class="hidden">
        ${canEdit() ? `<button class="btn sm no-print" id="pAddMv" style="margin-bottom:10px">+ ${esc(t("mv.add"))}</button>` : ""}
        <div class="tbl compact"><table><thead><tr><th>${esc(f("move_date"))}</th><th>${esc(f("move_type"))}</th><th>${esc(f("from_value"))}</th><th>${esc(f("to_value"))}</th><th>${esc(f("notes"))}</th></tr></thead>
        <tbody>${mvs.map((x) => `<tr class="click" data-mv="${x.id}"><td class="num">${esc(fmtDate(x.move_date))}</td><td>${esc(t("mv." + x.move_type))}</td><td>${esc(x.from_value || "")}</td><td>${esc(x.to_value || "")}</td><td class="wrap">${esc(x.notes || "")}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">${esc(t("none"))}</td></tr>`}</tbody></table></div>
      </div>
      <div data-pane="apr" class="hidden">
        ${canEdit() ? `<button class="btn sm no-print" id="pAddApr" style="margin-bottom:10px">+ ${esc(t("apr.new"))}</button>` : ""}
        ${aprTable(aprs, false)}
      </div>
      <div data-pane="deps" class="hidden">
        ${canEdit() ? `<button class="btn sm no-print" id="pAddDep" style="margin-bottom:10px">+ ${esc(t("add"))}</button>` : ""}
        <div class="tbl compact"><table><thead><tr><th>${esc(f("name"))}</th><th>${esc(f("iqama_no"))}</th><th>${esc(f("relation"))}</th><th>${esc(f("passport_expiry"))}</th></tr></thead>
        <tbody>${deps.map((d) => `<tr class="click" data-dep="${d.id}"><td>${esc(d.name)}</td><td class="num">${esc(d.iqama_no || "")}</td><td>${esc(d.relation || "")}</td><td class="num">${esc(fmtDate(d.passport_expiry))}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">${esc(t("none"))}</td></tr>`}</tbody></table></div>
      </div>
      <div data-pane="ins" class="hidden">
        <div class="tbl compact"><table><thead><tr><th>${esc(f("member_name"))}</th><th>${esc(f("relation"))}</th><th>${esc(f("class"))}</th><th>${esc(f("member_no"))}</th></tr></thead>
        <tbody>${ins.map((x) => `<tr><td>${esc(x.member_name)}</td><td>${esc(x.relation || "")}</td><td>${esc(x.class || "")}</td><td class="num">${esc(x.member_no || "")}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">${esc(t("none"))}</td></tr>`}</tbody></table></div>
      </div>
      <div data-pane="plat" class="hidden"><div class="kv">${[["qiwa_staff", "قوى - موظفي المنشأة", "Qiwa establishment"], ["qiwa_contract", "قوى - عقد ساري", "Qiwa contract"], ["gosi", "التأمينات", "GOSI"], ["muqeem", "مقيم", "Muqeem"], ["work_permit", "رخصة العمل", "Work permit"], ["result", "النتيجة", "Result"], ["note", "الملاحظة", "Note"]]
        .map(([k, ar, en]) => `<div><span>${esc(L() === "en" ? en : ar)}</span><b>${markCell(p[k])}</b></div>`).join("")}</div></div>
    </div>`);
  $("#pAddApr", m.root)?.addEventListener("click", () => { m.close(); newAppraisal(id); });
  bindApr(m.root, () => m.close());
  $$("[data-tab]", m.root).forEach((b) => b.addEventListener("click", () => {
    $$("[data-tab]", m.root).forEach((x) => x.classList.toggle("on", x === b));
    $$("[data-pane]", m.root).forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== b.dataset.tab));
  }));
  $("#pPrint", m.root).addEventListener("click", () => {
    $$("[data-pane]", m.root).forEach((p) => p.classList.remove("hidden"));
    printModal(m);
  });
  $("#pEdit", m.root)?.addEventListener("click", () => { m.close(); openForm("employees", e, { form: e.kind }); });
  $("#pAddDoc", m.root)?.addEventListener("click", () => { m.close(); openForm("documents", null, { preset: { employee_id: String(id) }, title: t("doc.add") }); });
  $("#pAddDep", m.root)?.addEventListener("click", () => { m.close(); openForm("dependents", null, { preset: { employee_id: String(id) } }); });
  $$("[data-doc]", m.root).forEach((tr) => tr.addEventListener("click", () => { m.close(); openForm("documents", D.documents.find((d) => d.id === +tr.dataset.doc)); }));
  $$("[data-dep]", m.root).forEach((tr) => tr.addEventListener("click", () => { m.close(); openForm("dependents", D.dependents.find((d) => d.id === +tr.dataset.dep)); }));
  $("#pAddLv", m.root)?.addEventListener("click", () => { m.close(); openForm("leaves", null, { preset: { employee_id: String(id), leave_type: "annual", status: "pending" }, title: t("lv.add") }); });
  $("#pAddMv", m.root)?.addEventListener("click", () => { m.close(); openForm("movements", null, { preset: { employee_id: String(id), move_date: new Date().toISOString().slice(0, 10) }, title: t("mv.add") }); });
  $$("[data-lv]", m.root).forEach((tr) => tr.addEventListener("click", () => { m.close(); openForm("leaves", D.leaves.find((x) => x.id === +tr.dataset.lv)); }));
  $$("[data-mv]", m.root).forEach((tr) => tr.addEventListener("click", () => { m.close(); openForm("movements", D.movements.find((x) => x.id === +tr.dataset.mv)); }));
  if (tab) $(`[data-tab="${tab}"]`, m.root)?.click();
}

// ================= leaves helpers =================
const lvPill = (s) => `<span class="pill ${s === "approved" ? "s-ok" : s === "rejected" ? "s-none" : "s-near"}">${esc(t("ls." + s))}</span>`;
function leaveBalance(e) {
  const year = String(new Date().getFullYear());
  const used = D.leaves
    .filter((l) => l.employee_id === e.id && l.leave_type === "annual" && l.status === "approved" && String(l.start_date).startsWith(year))
    .reduce((a, l) => a + (Number(l.days) || 0), 0);
  const entitled = Number(e.leave_days) || 0;
  return { entitled, used, remaining: entitled - used };
}

function markCell(v) {
  if (v === "✔") return `<span class="mark-ok">✔</span>`;
  if (v === "✖") return `<span class="mark-no">✖</span>`;
  if (v === "؟") return `<span class="mark-q">؟</span>`;
  if (v === "مطابق") return `<span class="pill s-ok">${L() === "en" ? "Matched" : v}</span>`;
  if (v === "يحتاج مراجعة") return `<span class="pill s-near">${L() === "en" ? "Needs review" : v}</span>`;
  return esc(v ?? "");
}

// ================= DOCUMENTS =================
PAGES.documents = () => {
  const st = settings();
  const rows = D.documents
    .filter((d) => EMP.has(d.employee_id))
    .map((d) => ({ ...d, s: docStatus(d, st), e: EMP.get(d.employee_id) }));
  $("#view").innerHTML = head(t("p.documents"), `${t("set.iqama")} ${st.iqama} • ${t("set.contracts")} ${st.contracts} • ${t("set.docs")} ${st.docs} ${t("days")}`,
    `${canEdit() ? `<button class="btn ghost" id="renewNow">🔁 ${esc(t("rn.btn").replace("{n}", st.contract_renew_days ?? 75))}</button><button class="btn" id="addDoc">+ ${esc(t("doc.add"))}</button>` : ""}<button class="btn ghost" data-act="print">${esc(t("print"))}</button>`) + `<div class="card" id="tb"></div>`;
  $("#addDoc")?.addEventListener("click", () => openForm("documents", null, { title: t("doc.add") }));
  $("#renewNow")?.addEventListener("click", renewContractsNow);
  dataTable($("#tb"), {
    id: "docs", rows, exportName: t("p.documents"),
    cols: [
      { k: "owner", label: t("doc.owner"), get: (r) => empName(r.e), render: (r) => `<b>${esc(empName(r.e))}</b><br><small class="muted">${esc(r.e.id_no || "")}</small>` },
      { k: "where", label: `${f("department")} / ${f("company")}`, get: (r) => (r.e.kind === "labor" ? r.e.company : r.e.department) },
      { k: "type", label: t("doc.type"), get: (r) => docLabel(r.doc_type) },
      { k: "number", label: t("doc.number"), num: true },
      { k: "expiry", label: t("doc.expiry"), num: true, get: (r) => r.s.expiry || r.expiry_date },
      { k: "days", label: t("doc.days"), num: true, get: (r) => r.s.days, render: (r) => (r.s.status === "used" ? "—" : daysCell(r.s.days)) },
      { k: "status", label: t("doc.status"), get: (r) => t("st." + r.s.status), render: (r) => stPill(r.s.status) + (r.doc_type === "contract" && (r.s.status === "near" || r.s.status === "expired") ? (renewalReady(r, (D.appraisals || []).filter((a) => a.employee_id === r.employee_id), D.attachments || []) ? ` <span class="pill s-ok" title="${esc(t("rn.ready.t"))}">📝 ${esc(t("rn.ready"))}</span>` : leavingReason(r) ? "" : ` <span class="pill s-near">⚠️ ${esc(t("rn.noform"))}</span>`) : "") },
      { k: "act", label: "", noExport: true, get: () => "", render: (r) => canEdit() ? `<span class="row-acts"><button class="btn ghost sm" data-renew="${r.id}">${esc(t("doc.renew"))}</button>${r.doc_type === "contract" ? `<button class="btn ${r.details?.no_renew ? "danger" : "ghost"} sm" data-leave="${r.id}" title="${esc(t("rn.leave.t"))}">🚪 ${esc(r.details?.no_renew ? t("rn.leaving") : t("rn.leave"))}</button>` : ""}</span>` : "" },
    ],
    filters: [{ k: "type", label: t("filter.type"), get: (r) => docLabel(r.doc_type) }, { k: "kind", label: `${t("p.employees")} / ${t("p.labor")}`, get: (r) => t(r.e.kind === "labor" ? "p.labor" : "p.employees") }],
    chipGet: (r) => t("st." + r.s.status),
    onRow: (r) => openForm("documents", D.documents.find((d) => d.id === r.id)),
    afterDraw: (root) => {
      $$("[data-renew]", root).forEach((b) => b.addEventListener("click", () => renewDoc(+b.dataset.renew)));
      $$("[data-leave]", root).forEach((b) => b.addEventListener("click", () => toggleLeaving(+b.dataset.leave)));
    },
  });
};

async function toggleLeaving(id) {
  const d = D.documents.find((x) => x.id === id);
  const det = { ...(d.details || {}) };
  if (det.no_renew) { delete det.no_renew; delete det.no_renew_reason; }
  else {
    const why = prompt(t("rn.why"), "");
    if (why === null) return;
    det.no_renew = true; det.no_renew_reason = why.trim();
  }
  try { await api("/api/rows?table=documents", { method: "PUT", body: { id, details: det } }); toast(t("saved")); await refresh(); } catch (e) { toast(e.message, true); }
}

async function renewContractsNow() {
  let prev;
  try { prev = await api("/api/renew", { method: "POST", body: { dry_run: true } }); } catch (e) { return toast(e.message, true); }
  const m = modal(`<header><h3>🔁 ${esc(t("rn.title").replace("{n}", prev.days))}</h3><button class="x" data-close>×</button></header>
    <div class="body">
      <h4>✅ ${esc(t("rn.will"))} (${prev.renewed.length})</h4>
      <div class="tbl compact" style="max-height:300px;overflow:auto"><table><thead><tr><th>${esc(f("name"))}</th><th>${esc(t("rn.old"))}</th><th>${esc(t("rn.new"))}</th></tr></thead><tbody>
      ${prev.renewed.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${esc(fmtDate(r.from))}</td><td class="num"><b>${esc(fmtDate(r.start))} ← ${esc(fmtDate(r.end))}</b></td></tr>`).join("") || `<tr><td colspan="3" class="empty">${esc(t("none"))}</td></tr>`}</tbody></table></div>
      <h4 style="margin-top:14px">⚠️ ${esc(t("rn.needs"))} (${(prev.needs || []).length})</h4>
      <div class="tbl compact" style="max-height:260px;overflow:auto"><table><tbody>${(prev.needs || []).map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${esc(fmtDate(r.expiry))}</td><td><button class="btn ghost sm" data-force="${r.employee_id}">🔁 ${esc(t("rn.force"))}</button></td></tr>`).join("") || `<tr><td class="empty">${esc(t("none"))}</td></tr>`}</tbody></table></div>
      <h4 style="margin-top:14px">🚪 ${esc(t("rn.skip"))} (${prev.skipped.length})</h4>
      <ul>${prev.skipped.map((r) => `<li><b>${esc(r.name)}</b> — ${esc(fmtDate(r.expiry))} — ${esc(r.reason)}</li>`).join("") || `<li class="muted">${esc(t("none"))}</li>`}</ul>
      <p class="muted small">${esc(t("rn.help"))}</p></div>
    <footer><button class="btn ghost" data-close>${esc(t("cancel"))}</button>${prev.renewed.length ? `<button class="btn" id="rnGo">🔁 ${esc(t("rn.go").replace("{n}", prev.renewed.length))}</button>` : ""}</footer>`, "wide");
  $$("[data-force]", m.root).forEach((b) => b.addEventListener("click", async () => {
    if (!confirm(t("rn.force.q"))) return;
    try { await api("/api/renew", { method: "POST", body: { force: [+b.dataset.force] } }); m.close(); toast(t("saved")); await refresh(); renewContractsNow(); } catch (e) { toast(e.message, true); }
  }));
  $("#rnGo", m.root)?.addEventListener("click", async () => {
    try { const o = await api("/api/renew", { method: "POST", body: {} }); m.close(); toast(t("rn.done").replace("{n}", o.renewed.length)); await refresh(); } catch (e) { toast(e.message, true); }
  });
}

function renewDoc(id) {
  const d = D.documents.find((x) => x.id === id);
  const m = modal(`<header><h3>${esc(t("doc.renew"))} — ${esc(docLabel(d.doc_type))}</h3><button class="x" data-close>×</button></header>
    <div class="body"><p>${esc(empName(EMP.get(d.employee_id)))}</p><div class="form-grid">
      <div><label class="fl">${esc(t("doc.issue"))}</label><input class="input" type="date" id="rIssue" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div><label class="fl">${esc(t("doc.expiry"))}</label><input class="input" type="date" id="rExp"></div>
      <div><label class="fl">${esc(t("doc.number"))}</label><input class="input" id="rNum" value="${esc(d.number || "")}" dir="ltr"></div></div>
      <div class="chips" style="margin-top:12px">${[3, 6, 12, 24].map((n) => `<button class="chip" data-m="${n}">+${n} ${L() === "en" ? "months" : "شهر"}</button>`).join("")}</div><p class="msg err" id="rErr"></p></div>
    <footer><button class="btn ghost" data-close>${esc(t("cancel"))}</button><button class="btn" id="rSave">${esc(t("save"))}</button></footer>`, "sm");
  $$("[data-m]", m.root).forEach((b) => b.addEventListener("click", () => {
    const base = new Date(($("#rIssue", m.root).value || new Date().toISOString().slice(0, 10)) + "T00:00:00Z");
    base.setUTCMonth(base.getUTCMonth() + +b.dataset.m);
    base.setUTCDate(base.getUTCDate() - 1);
    $("#rExp", m.root).value = base.toISOString().slice(0, 10);
  }));
  $("#rSave", m.root).addEventListener("click", async () => {
    try {
      await api("/api/rows?table=documents", { method: "PUT", body: { id, issue_date: $("#rIssue", m.root).value, expiry_date: $("#rExp", m.root).value, number: $("#rNum", m.root).value } });
      m.close(); toast(t("saved")); await refresh();
    } catch (e) { $("#rErr", m.root).textContent = e.message; }
  });
}

// ================= SAUDIZATION =================
PAGES.saudization = () => {
  const st = settings();
  const staff = D.employees.filter((e) => e.kind === "staff" && e.status !== "left");
  const r = ratio(staff);
  const target = st.saudization_target;
  const need = saudisNeeded(r, target);
  const depts = groupRatio(staff, "department");
  const today = new Date().toISOString().slice(0, 10);
  const showAllRules = !!tableState.allRules;
  const ruleRows = D.saud_rules.map((rule) => ({ rule, c: ruleCoverage(rule, staff) }))
    .sort((a, b) => (b.c.missing - a.c.missing) || (b.c.total - a.c.total) || String(a.rule.effective_date || "").localeCompare(String(b.rule.effective_date || "")));
  const titles = groupRatio(staff, "job_title");
  const rows2 = (list) => list.map((g) => `<tr><td>${esc(g.key)}</td><td class="num">${g.total}</td><td class="num">${g.saudi}</td><td class="num">${g.non_saudi}</td>
    <td><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1"><i style="width:${g.pct.toFixed(0)}%;background:${target && g.pct < target ? "#e8892a" : ""}"></i></div><span class="num">${pct(g.pct)}</span></div></td>
    ${target ? `<td class="num">${saudisNeeded(g, target)}</td>` : ""}</tr>`).join("");
  const thead = `<tr><th></th><th class="num">${esc(t("total"))}</th><th class="num">${esc(t("k.saudi"))}</th><th class="num">${esc(t("k.nonsaudi"))}</th><th>${esc(t("k.ratio"))}</th>${target ? `<th class="num">${esc(t("s.need"))}</th>` : ""}</tr>`;

  $("#view").innerHTML = `
    ${head(t("p.saudization"), t("s.note"), `${FEATURES.ai ? `<button class="btn" id="aiSaud">✦ ${esc(t("s.ai"))}</button>` : ""}<button class="btn ghost" data-act="print">${esc(t("print"))}</button>`)}
    <div id="aiOut"></div>
    <div class="grid kpis">
      <div class="card kpi blue"><div class="l">${esc(t("s.overall"))}</div><div class="v num">${pct(r.pct)}</div><div class="h">${r.saudi} / ${r.total}</div></div>
      <div class="card kpi green"><div class="l">${esc(t("k.saudi"))}</div><div class="v num">${r.saudi}</div></div>
      <div class="card kpi"><div class="l">${esc(t("k.nonsaudi"))}</div><div class="v num">${r.non_saudi}</div></div>
      <div class="card kpi ${need ? "orange" : "green"}"><div class="l">${esc(t("k.target"))}</div><div class="v num">${target ?? "—"}${target ? "%" : ""}</div><div class="h">${need !== null ? `${t("s.need")}: ${need}` : ""}</div></div>
    </div>
    <div class="grid g2">
      <div class="card">
        <h3>${esc(t("s.sim"))}</h3>
        <div class="form-grid">
          ${isAdmin() ? `<div><label class="fl">${esc(t("s.target.set"))}</label><div style="display:flex;gap:6px"><input class="input" type="number" min="0" max="100" step="0.1" id="tgt" value="${target ?? ""}" dir="ltr"><button class="btn sm" id="tgtSave">${esc(t("save"))}</button></div></div>` : ""}
          <div><label class="fl">${esc(t("s.sim.hire"))}</label><input class="input" type="number" min="0" id="simH" value="0" dir="ltr"></div>
          <div><label class="fl">${esc(t("s.sim.replace"))}</label><input class="input" type="number" min="0" id="simR" value="0" dir="ltr"></div>
        </div>
        <div style="margin-top:14px;font-size:15px">${esc(t("s.sim.result"))}: <b class="num" id="simOut" style="font-size:22px">${pct(r.pct)}</b></div>
      </div>
      <div class="card"><h3>${esc(t("s.bydept"))}</h3><div class="chart" id="chD"></div></div>
    </div>
    <div class="card" style="margin-bottom:16px"><h3>${esc(t("s.bydept"))}</h3><div class="tbl compact"><table><thead>${thead}</thead><tbody>${rows2(depts)}</tbody>
      <tfoot><tr><td>${esc(t("total"))}</td><td class="num">${r.total}</td><td class="num">${r.saudi}</td><td class="num">${r.non_saudi}</td><td class="num">${pct(r.pct)}</td>${target ? `<td class="num">${need}</td>` : ""}</tr></tfoot></table></div></div>
    <div class="card" style="margin-bottom:16px"><h3>${esc(t("s.rules"))} ${canEdit() ? `<button class="btn sm no-print" id="addRule">+ ${esc(t("s.rule.add"))}</button>` : ""}</h3>
      <div class="tbl compact"><table><thead><tr><th></th><th>${esc(f("occupations").split("(")[0])}</th><th class="num">${esc(f("required_pct"))}</th><th class="num">${esc(t("s.covered"))}</th><th class="num">${esc(t("k.saudi"))}</th><th class="num">${esc(t("s.required"))}</th><th class="num">${esc(t("s.missing"))}</th><th></th><th>${esc(f("effective_date"))}</th></tr></thead>
      <tbody>${ruleRows.filter((x) => showAllRules || x.c.total).map(({ rule, c }) => { const ok = !c.missing; const fut = rule.effective_date && rule.effective_date > today; return `<tr class="click" data-rule="${rule.id}" title="${esc(rule.notes || "")}"><td><b>${esc(rule.name)}</b></td><td class="wrap">${esc(rule.occupations || "")}</td><td class="num">${rule.required_pct ?? ""}${rule.required_pct !== null ? "%" : ""}</td><td class="num">${c.total}</td><td class="num">${c.saudi}</td><td class="num">${c.total ? c.required : "—"}</td><td class="num">${c.missing ? `<b class="d-exp">${c.missing}</b>` : c.total ? "0" : "—"}</td><td>${c.total ? `<span class="pill ${ok ? "s-ok" : fut ? "s-near" : "s-expired"}">${esc(t(ok ? "s.compliant" : fut ? "s.upcoming" : "s.below"))}</span>` : ""}</td><td class="num">${esc(fmtDate(rule.effective_date))}</td></tr>`; }).join("") || `<tr><td colspan="9" class="empty">${esc(t("none"))}</td></tr>`}</tbody></table></div>
      ${ruleRows.some((x) => !x.c.total) ? `<button class="btn ghost sm no-print" id="allRules" style="margin-top:10px">${esc(showAllRules ? t("s.rules.less") : t("s.rules.all").replace("{n}", ruleRows.filter((x) => !x.c.total).length))}</button>` : ""}
      ${D.saud_rules.some((x) => x.source) ? `<p class="muted small" style="margin-bottom:0">${esc(t("s.method"))} — ${esc([...new Set(D.saud_rules.map((x) => x.source).filter(Boolean))].join(" • "))}</p>` : ""}</div>
    <div class="card"><h3>${esc(t("s.bytitle"))}</h3><div class="tbl compact" style="max-height:480px;overflow:auto"><table><thead>${thead}</thead><tbody>${rows2(titles)}</tbody></table></div></div>`;

  const sim = () => {
    const h = Math.max(0, +$("#simH").value || 0), rp = Math.max(0, Math.min(r.non_saudi, +$("#simR").value || 0));
    const total = r.total + h, saudi = r.saudi + h + rp;
    $("#simOut").textContent = pct(total ? (saudi / total) * 100 : 0);
  };
  $("#simH").addEventListener("input", sim);
  $("#simR").addEventListener("input", sim);
  $("#tgtSave")?.addEventListener("click", async () => {
    await api("/api/settings", { method: "PUT", body: { saudization_target: $("#tgt").value } });
    toast(t("saved")); await refresh();
  });
  $("#addRule")?.addEventListener("click", () => openForm("saud_rules", null, { title: t("s.rule.add") }));
  $("#allRules")?.addEventListener("click", () => { tableState.allRules = !tableState.allRules; route(); });
  $$("[data-rule]").forEach((tr) => tr.addEventListener("click", () => openForm("saud_rules", D.saud_rules.find((x) => x.id === +tr.dataset.rule))));
  $("#aiSaud")?.addEventListener("click", () => aiPanel($("#aiOut"), "saudization", t("s.ai")));
  const pal = palette();
  const top = depts.slice(0, 12);
  const label = { color: isDark() ? "#e8e9f3" : "#191a2c" };
  chart($("#chD"), { tooltip: { trigger: "axis", valueFormatter: (v) => v + "%" }, grid: { top: 16, left: 8, right: 8, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: top.map((g) => g.key), axisLabel: { interval: 0, rotate: 35, color: label.color } }, yAxis: { type: "value", max: 100, axisLabel: { ...label, formatter: "{value}%" } },
    series: [{ type: "bar", barMaxWidth: 30, data: top.map((g) => ({ value: +g.pct.toFixed(1), itemStyle: { color: target && g.pct < target ? "#e8892a" : pal[3] } })),
      markLine: target ? { symbol: "none", data: [{ yAxis: target }], lineStyle: { color: "#c4372a", type: "dashed" }, label: { formatter: `${target}%` } } : undefined }] });
};

// ================= RECRUITMENT =================
PAGES.recruitment = () => {
  const stages = ["new", "screening", "interview", "offer", "hired", "rejected"];
  const tab = tableState.recTab || "pipeline";
  const jobFilter = tableState.recJob || "";
  const apps = D.applicants.filter((a) => !jobFilter || String(a.job_id) === jobFilter);
  const jobName = (id) => D.jobs.find((j) => j.id === id)?.title || "—";
  $("#view").innerHTML = `
    ${head(t("p.recruitment"), "", `${canEdit() ? `<button class="btn" id="addApp">+ ${esc(t("r.app.add"))}</button><button class="btn ghost" id="addJob">+ ${esc(t("r.job.add"))}</button>` : ""}<button class="btn ghost" data-act="print">${esc(t("print"))}</button>`)}
    <div class="grid kpis">${D.jobs.filter((j) => j.status !== "closed").map((j) => {
      const a = D.applicants.filter((x) => x.job_id === j.id);
      return `<div class="card kpi click ${j.status === "open" ? "blue" : ""}" data-job="${j.id}"><div class="l">${esc(j.department || "")} ${j.saudi_only ? `<span class="pill s-ok">${esc(t("r.saudi_only"))}</span>` : ""}</div>
        <div style="font-weight:800;font-size:17px;margin:6px 0">${esc(j.title)}</div><div class="h">${esc(t("r.openings"))}: ${j.openings ?? 1} • ${esc(t("r.applicants"))}: ${a.length} • ${esc(t("job." + j.status))}</div></div>`;
    }).join("") || `<div class="card muted">${esc(t("none"))}</div>`}</div>
    <div class="tabs no-print"><button data-t="pipeline" class="${tab === "pipeline" ? "on" : ""}">${esc(t("r.pipeline"))}</button><button data-t="list" class="${tab === "list" ? "on" : ""}">${esc(t("r.applicants"))}</button><button data-t="jobs" class="${tab === "jobs" ? "on" : ""}">${esc(t("r.jobs"))}</button>
      <select class="input" id="jf" style="width:auto;margin-inline-start:auto"><option value="">${esc(t("all"))}</option>${D.jobs.map((j) => `<option value="${j.id}" ${String(j.id) === jobFilter ? "selected" : ""}>${esc(j.title)}</option>`).join("")}</select></div>
    <div id="recBody"></div>`;
  const body = $("#recBody");
  if (tab === "pipeline") {
    body.innerHTML = `<div class="kanban">${stages.map((s) => {
      const list = apps.filter((a) => a.stage === s);
      return `<div class="kcol" data-stage="${s}"><h4><span>${esc(t("stage." + s))}</span><span class="badge" style="background:var(--grey-bg)">${list.length}</span></h4>
        ${list.map((a) => `<div class="kcard" data-app="${a.id}" draggable="${canEdit()}"><b>${esc(a.name)}</b><small>${esc(jobName(a.job_id))}</small><br>
        <small>${esc(a.nationality || "")}${isSaudi(a.nationality) ? ' <span class="pill s-ok">KSA</span>' : ""}</small>${a.rating ? `<div class="stars">${"★".repeat(Math.min(5, a.rating))}</div>` : ""}${a.ai_summary ? '<small class="pill s-info">✦ AI</small>' : ""}</div>`).join("")}</div>`;
    }).join("")}</div>`;
    if (canEdit()) {
      $$(".kcard", body).forEach((c) => c.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", c.dataset.app)));
      $$(".kcol", body).forEach((col) => {
        col.addEventListener("dragover", (e) => e.preventDefault());
        col.addEventListener("drop", async (e) => {
          e.preventDefault();
          const id = +e.dataTransfer.getData("text/plain");
          await api("/api/rows?table=applicants", { method: "PUT", body: { id, stage: col.dataset.stage } });
          await refresh();
        });
      });
    }
    $$(".kcard", body).forEach((c) => c.addEventListener("click", () => openApplicant(+c.dataset.app)));
  } else if (tab === "list") {
    body.innerHTML = `<div class="card" id="tb"></div>`;
    dataTable($("#tb"), {
      id: "apps", rows: apps, exportName: t("r.applicants"),
      cols: [
        { k: "name", label: f("name"), render: (a) => `<b>${esc(a.name)}</b>` },
        { k: "job", label: f("job_id"), get: (a) => jobName(a.job_id) },
        { k: "stage", label: f("stage"), get: (a) => t("stage." + a.stage), render: (a) => `<span class="pill ${a.stage === "hired" ? "s-ok" : a.stage === "rejected" ? "s-none" : "s-info"}">${esc(t("stage." + a.stage))}</span>` },
        { k: "nationality", label: f("nationality") },
        { k: "mobile", label: f("mobile"), num: true },
        { k: "rating", label: f("rating"), num: true },
        { k: "expected_salary", label: f("expected_salary"), num: true, render: (a) => fmtNum(a.expected_salary) },
        { k: "source", label: f("source") },
      ],
      chipGet: (a) => t("stage." + a.stage),
      onRow: (a) => openApplicant(a.id),
    });
  } else {
    body.innerHTML = `<div class="card" id="tb"></div>`;
    dataTable($("#tb"), {
      id: "jobs", rows: D.jobs, exportName: t("r.jobs"),
      cols: [
        { k: "title", label: f("title"), render: (j) => `<b>${esc(j.title)}</b>` },
        { k: "department", label: f("department") },
        { k: "openings", label: f("openings"), num: true },
        { k: "saudi_only", label: f("saudi_only"), get: (j) => t(j.saudi_only ? "yes" : "no") },
        { k: "status", label: f("status"), get: (j) => t("job." + j.status) },
        { k: "apps", label: t("r.applicants"), num: true, get: (j) => D.applicants.filter((a) => a.job_id === j.id).length },
        { k: "salary_range", label: f("salary_range") },
      ],
      onRow: (j) => openForm("jobs", j),
    });
  }
  $$("[data-t]").forEach((b) => b.addEventListener("click", () => { tableState.recTab = b.dataset.t; route(); }));
  $("#jf").addEventListener("change", (e) => { tableState.recJob = e.target.value; route(); });
  $$("[data-job]").forEach((c) => c.addEventListener("click", () => openForm("jobs", D.jobs.find((j) => j.id === +c.dataset.job))));
  $("#addApp")?.addEventListener("click", () => openForm("applicants", null, { title: t("r.app.add"), preset: { stage: "new", job_id: jobFilter || "" } }));
  $("#addJob")?.addEventListener("click", () => openForm("jobs", null, { title: t("r.job.add"), preset: { status: "open", openings: 1, saudi_only: "false" } }));
};

function openApplicant(id) {
  const a = D.applicants.find((x) => x.id === id);
  if (!a) return;
  const job = D.jobs.find((j) => j.id === a.job_id);
  const m = modal(`
    <header><div><h3>${esc(a.name)}</h3><small>${esc(job ? job.title : "")} • ${esc(t("stage." + a.stage))}</small></div><button class="x" data-close>×</button></header>
    <div class="body">
      <div class="kv">${["nationality", "id_no", "mobile", "email", "source", "expected_salary", "rating"].filter((k) => a[k] !== null && a[k] !== "").map((k) => `<div><span>${esc(f(k))}</span><b>${esc(k === "expected_salary" ? fmtNum(a[k]) : a[k])}</b></div>`).join("")}</div>
      ${a.notes ? `<div class="form-sec">${esc(f("notes"))}</div><div class="ai-box">${esc(a.notes)}</div>` : ""}
      ${canEdit() ? `<div class="form-sec">${esc(f("stage"))}</div><div class="chips">${["new", "screening", "interview", "offer", "hired", "rejected"].map((s) => `<button class="chip ${s === a.stage ? "on" : ""}" data-st="${s}">${esc(t("stage." + s))}</button>`).join("")}</div>` : ""}
      <div class="form-sec">✦ ${esc(f("ai_summary"))}</div><div id="aiA">${a.ai_summary ? `<div class="ai-box">${md(a.ai_summary)}</div>` : `<p class="muted">—</p>`}</div>
    </div>
    <footer>${canEdit() ? `<button class="btn ghost" id="aEdit">${esc(t("edit"))}</button>` : ""}${FEATURES.ai ? `<button class="btn ghost" id="aAi">✦ ${esc(t("r.screen"))}</button>` : ""}${canEdit() && a.stage !== "rejected" ? `<button class="btn success" id="aHire">${esc(t("r.hire"))}</button>` : ""}</footer>`);
  $$("[data-st]", m.root).forEach((b) => b.addEventListener("click", async () => {
    await api("/api/rows?table=applicants", { method: "PUT", body: { id, stage: b.dataset.st } });
    m.close(); toast(t("saved")); await refresh();
  }));
  $("#aEdit", m.root)?.addEventListener("click", () => { m.close(); openForm("applicants", a); });
  $("#aAi", m.root)?.addEventListener("click", async () => {
    const out = await aiPanel($("#aiA", m.root), "screen", t("r.screen"), { applicant_id: id });
    if (out) await reload();
  });
  $("#aHire", m.root)?.addEventListener("click", () => {
    m.close();
    openForm("employees", null, {
      form: "staff", title: t("r.hire"),
      preset: { kind: "staff", status: "active", name_ar: a.name, nationality: a.nationality || "", id_no: a.id_no || "", mobile: a.mobile || "", email: a.email || "", job_title: job?.title || "", department: job?.department || "", join_date: new Date().toISOString().slice(0, 10) },
      onSaved: async () => { await api("/api/rows?table=applicants", { method: "PUT", body: { id, stage: "hired" } }); await refresh(); },
    });
  });
}

// ================= SIMPLE LIST PAGES =================
function listPage(key, table, cols, opts = {}) {
  const rows = opts.rows || D[table];
  $("#view").innerHTML = head(t("p." + key), opts.sub || "", `${canEdit() && !opts.noAdd ? `<button class="btn" id="addRow">+ ${esc(t("add"))}</button>` : ""}<button class="btn ghost" data-act="print">${esc(t("print"))}</button>`) + `<div class="card" id="tb"></div>`;
  $("#addRow")?.addEventListener("click", () => openForm(table, null, { preset: opts.preset }));
  dataTable($("#tb"), { id: key, rows, cols, exportName: t("p." + key), onRow: opts.onRow || ((r) => openForm(table, D[table].find((x) => x.id === r.id))), ...opts.table });
}

PAGES.insurance = () => listPage("insurance", "insurance", [
  { k: "member_name", label: f("member_name"), render: (x) => `<b>${esc(x.member_name)}</b>` },
  { k: "id_no", label: f("id_no"), num: true },
  { k: "relation", label: f("relation") },
  { k: "emp", label: f("employee_id"), get: (x) => empName(EMP.get(x.employee_id)) },
  { k: "class", label: f("class") },
  { k: "gender", label: f("gender") },
  { k: "nationality", label: f("nationality") },
  { k: "birth_date", label: f("birth_date"), num: true },
  { k: "member_no", label: f("member_no"), num: true },
  { k: "notes", label: f("notes"), wrap: true },
], { sub: `${D.insurance.filter((x) => x.relation === "الموظف").length} ${t("p.employees")} • ${D.insurance.filter((x) => x.relation !== "الموظف").length} ${t("p.dependents")}`, table: { chipGet: (x) => x.class, filters: [{ k: "relation", label: f("relation"), get: (x) => x.relation }] } });

PAGES.dependents = () => listPage("dependents", "dependents", [
  { k: "name", label: f("name"), render: (x) => `<b>${esc(x.name)}</b>` },
  { k: "iqama_no", label: f("iqama_no"), num: true },
  { k: "relation", label: f("relation") },
  { k: "emp", label: f("employee_id"), get: (x) => empName(EMP.get(x.employee_id)) },
  { k: "passport_expiry", label: f("passport_expiry"), num: true },
  { k: "st", label: t("doc.status"), get: (x) => t("st." + docStatus({ doc_type: "passport", expiry_date: x.passport_expiry }, settings()).status), render: (x) => stPill(docStatus({ doc_type: "passport", expiry_date: x.passport_expiry }, settings()).status) },
]);

PAGES.tasks = () => listPage("tasks", "tasks", [
  { k: "status", label: f("status"), get: (x) => t("task." + x.status), render: (x) => `<span class="pill ${x.status === "done" ? "s-ok" : "s-near"}">${esc(t("task." + x.status))}</span>` },
  { k: "category", label: f("category"), get: (x) => t("cat." + x.category) },
  { k: "title", label: f("title"), render: (x) => `<b>${esc(x.title)}</b>` },
  { k: "person", label: f("person") },
  { k: "id_no", label: f("id_no"), num: true },
  { k: "details", label: f("details"), wrap: true },
  { k: "due_date", label: f("due_date"), num: true },
  { k: "act", label: "", noExport: true, get: () => "", render: (x) => canEdit() && x.status === "open" ? `<button class="btn ghost sm" data-done="${x.id}">✓ ${esc(t("task.done"))}</button>` : "" },
], {
  preset: { status: "open", category: "general" },
  table: {
    chipGet: (x) => t("task." + x.status),
    filters: [{ k: "category", label: f("category"), get: (x) => t("cat." + x.category) }],
    afterDraw: (root) => $$("[data-done]", root).forEach((b) => b.addEventListener("click", async () => {
      await api("/api/rows?table=tasks", { method: "PUT", body: { id: +b.dataset.done, status: "done" } });
      toast(t("saved")); await refresh();
    })),
  },
});

PAGES.platforms = () => {
  const rows = D.employees.filter((e) => e.kind === "staff" && e.platform);
  const p = (e, k) => e.platform?.[k];
  listPage("platforms", "employees", [
    { k: "name", label: f("name"), get: (e) => empName(e), render: (e) => `<b>${esc(empName(e))}</b>` },
    { k: "id_no", label: f("id_no"), num: true },
    { k: "department", label: f("department") },
    { k: "q1", label: L() === "en" ? "Qiwa staff" : "قوى - المنشأة", get: (e) => p(e, "qiwa_staff"), render: (e) => markCell(p(e, "qiwa_staff")) },
    { k: "q2", label: L() === "en" ? "Qiwa contract" : "قوى - عقد", get: (e) => p(e, "qiwa_contract"), render: (e) => markCell(p(e, "qiwa_contract")) },
    { k: "g", label: "GOSI / التأمينات", get: (e) => p(e, "gosi"), render: (e) => markCell(p(e, "gosi")) },
    { k: "m", label: L() === "en" ? "Muqeem" : "مقيم", get: (e) => p(e, "muqeem"), render: (e) => markCell(p(e, "muqeem")) },
    { k: "w", label: L() === "en" ? "Work permit" : "رخصة العمل", get: (e) => p(e, "work_permit"), render: (e) => markCell(p(e, "work_permit")) },
    { k: "r", label: L() === "en" ? "Result" : "النتيجة", get: (e) => p(e, "result"), render: (e) => markCell(p(e, "result")) },
    { k: "n", label: L() === "en" ? "Note" : "الملاحظة", wrap: true, get: (e) => p(e, "note") },
  ], { rows, noAdd: true, onRow: (e) => openProfile(e.id), table: { chipGet: (e) => p(e, "result") || "—" } });
};

// ================= ASSISTANT =================
const chatLog = [];
const AI_QUICK = [["exec", "📊"], ["saud", "🇸🇦"], ["docs", "⏰"], ["contracts", "📝"], ["leaves", "✈️"], ["letter", "✉️"]];
const saveChat = () => { try { sessionStorage.setItem("hr_chat", JSON.stringify(chatLog.slice(-30))); } catch {} };
PAGES.assistant = () => {
  if (!chatLog.length) { try { chatLog.push(...JSON.parse(sessionStorage.getItem("hr_chat") || "[]")); } catch {} }
  const on = FEATURES.ai;
  $("#view").innerHTML = `
    <div class="ai-shell">
      <div class="ai-top">
        <div class="ai-id"><div class="ai-orb">✦</div><div><b>${esc(t("ai.title"))}</b><span class="ai-status ${on ? "on" : "off"}">● ${esc(t(on ? "ai.online" : "ai.offline"))}${on ? ` — ${FEATURES.ai_provider === "gemini" ? "Google Gemini (مجاني)" : "Claude"}` : ""}</span></div></div>
        <div class="ai-actions">${chatLog.length ? `<button class="btn ghost sm" id="aiNew">＋ ${esc(t("ai.new"))}</button>` : ""}${!on && isAdmin() ? `<a class="btn sm" href="#settings">🔑 ${esc(t("ai.enable"))}</a>` : ""}</div>
      </div>
      ${on ? "" : `<div class="note">${esc(t("ai.off"))}</div>`}
      <div class="ai-log" id="log"></div>
      <div class="ai-quick" id="quick">${AI_QUICK.map(([k, i]) => `<button class="ai-q" data-q="${k}" ${on ? "" : "disabled"}><span>${i}</span>${esc(t("ai.q." + k))}</button>`).join("")}</div>
      <form id="cf" class="ai-input"><textarea class="input" id="cq" rows="1" placeholder="${esc(t("ai.placeholder"))}" ${on ? "" : "disabled"}></textarea><button class="btn ai-send" ${on ? "" : "disabled"} aria-label="${esc(t("ai.send"))}">➤</button></form>
      <p class="muted small ai-privacy">🔒 ${esc(t(FEATURES.ai_provider === "gemini" ? "ai.privacy.strict" : "ai.privacy"))}</p>
    </div>`;
  const log = $("#log");
  const paint = () => {
    log.innerHTML = (chatLog.length ? "" : `<div class="ai-welcome"><div class="ai-orb big">✦</div><h2>${esc(t("ai.hello").replace("{n}", (ME.name || "").split(" ")[0]))}</h2><p>${esc(t("ai.intro"))}</p></div>`) +
      chatLog.map((m, i) => m.role === "user"
        ? `<div class="msg-row user"><div class="bubble user">${esc(m.content)}</div></div>`
        : `<div class="msg-row ai"><div class="ai-orb sm">✦</div><div class="bubble ai"><div class="md">${md(m.content)}</div>
            <div class="b-acts no-print"><button class="link" data-copy="${i}">⧉ ${esc(t("ai.copy"))}</button><button class="link" data-print="${i}">🖨 ${esc(t("print"))}</button></div></div></div>`).join("") +
      (paint.busy ? `<div class="msg-row ai"><div class="ai-orb sm spin">✦</div><div class="bubble ai"><span class="typing"><i></i><i></i><i></i></span> <span class="muted small">${esc(t("ai.thinking"))}</span></div></div>` : "");
    log.scrollTop = log.scrollHeight;
    $$("[data-copy]", log).forEach((b) => b.onclick = () => { navigator.clipboard?.writeText(chatLog[+b.dataset.copy].content); toast(t("ai.copied")); });
    $$("[data-print]", log).forEach((b) => b.onclick = () => {
      const m = modal(`<header><h3>✦ ${esc(t("ai.title"))}</h3><button class="x" data-close>×</button></header><div class="body"><div class="report-doc"><div class="report-head"><img src="/logo-navy.png" alt=""><div><b>${esc(t("ai.title"))}</b><span>${esc(settings()[L() === "en" ? "hotel_name_en" : "hotel_name_ar"])}</span></div><div class="rmeta">${esc(fmtDate(new Date().toISOString()))}<br>${esc(ME.name)}</div></div><div class="md">${md(chatLog[+b.dataset.print].content)}</div></div></div>`, "wide");
      printModal(m);
    });
  };
  const send = async (text) => {
    if (!text.trim() || paint.busy || !FEATURES.ai) return;
    chatLog.push({ role: "user", content: text.trim() });
    paint.busy = true; paint(); saveChat();
    try {
      const out = await api("/api/ai", { method: "POST", body: { mode: "chat", lang: L(), messages: chatLog } });
      chatLog.push({ role: "assistant", content: out.text || "—" });
    } catch (e) {
      chatLog.push({ role: "assistant", content: "⚠ " + e.message });
    }
    paint.busy = false; paint(); saveChat();
    if (chatLog.length === 2) route();
  };
  const q = $("#cq");
  const grow = () => { q.style.height = "auto"; q.style.height = Math.min(180, q.scrollHeight) + "px"; };
  q.addEventListener("input", grow);
  q.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#cf").requestSubmit(); } });
  $("#cf").addEventListener("submit", (e) => { e.preventDefault(); const v = q.value; q.value = ""; grow(); send(v); });
  $$("[data-q]").forEach((b) => b.addEventListener("click", () => {
    const p = t("ai.q." + b.dataset.q + ".p");
    if (b.dataset.q === "letter") { q.value = p; q.focus(); grow(); } else send(p);
  }));
  $("#aiNew")?.addEventListener("click", () => { chatLog.length = 0; saveChat(); route(); });
  paint();
};

// ================= IMPORT / EXPORT =================
PAGES.import = () => {
  const tables = [["employees", t("p.employees")], ["documents", t("p.documents")], ["dependents", t("p.dependents")], ["insurance", t("p.insurance")], ["tasks", t("p.tasks")], ["jobs", t("r.jobs")], ["applicants", t("r.applicants")]];
  $("#view").innerHTML = `${head(t("p.import"), "")}
    <div class="grid g2">
      <div class="card"><h3>${esc(t("i.title"))}</h3><p class="muted" style="margin-top:0">${esc(t("i.desc"))}</p>
        ${canEdit() ? `<label class="drop" id="drop"><input type="file" id="file" accept=".xlsx" multiple hidden><div>⬆ ${esc(t("i.drop"))}</div></label><p class="msg" id="im"></p>` : `<p class="muted">${esc(t("no.permission"))}</p>`}
        <p class="muted small" style="margin-bottom:0">${esc(t("i.types"))}</p></div>
      <div class="card"><h3>${esc(t("e.title"))}</h3><p class="muted" style="margin-top:0">${esc(t("e.desc"))}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${tables.map(([k, l]) => `<button class="btn ghost" data-x="${k}">⬇ ${esc(l)}</button>`).join("")}</div></div>
    </div>
    <div id="impRep"></div>`;
  const up = async (files) => {
    files = [...(files || [])];
    if (!files.length) return;
    const im = $("#im"), rep = $("#impRep");
    im.className = "msg"; rep.innerHTML = "";
    const cards = [];
    for (const [i, file] of files.entries()) {
      im.textContent = `${t("loading")} (${i + 1}/${files.length}) ${file.name}`;
      try {
        const out = await api("/api/import", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file });
        const u = out.update;
        cards.push(u
          ? { ok: true, name: file.name, label: u.label, summary: u.summary, changes: u.changes }
          : { ok: true, name: file.name, label: t("i.main"), summary: Object.entries(out.stats).map(([k, v]) => `${k}: ${v}`).join(" • "), changes: [] });
      } catch (e) { cards.push({ ok: false, name: file.name, label: "✖", summary: e.message, changes: [] }); }
      rep.innerHTML = `<div class="card" style="margin-top:16px"><h3>📋 ${esc(t("i.report"))}</h3>${cards.map((c) => `
        <div class="imp-item ${c.ok ? "" : "bad"}"><div class="imp-h"><b>${esc(c.label)}</b><span class="muted small">${esc(c.name)}</span></div>
        <div class="imp-s">${esc(c.summary)}</div>${c.changes.length ? `<ul class="imp-c">${c.changes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>`).join("")}
        <div style="margin-top:10px"><button class="btn ghost" id="impPrint">🖨 ${esc(t("print"))}</button></div></div>`;
      $("#impPrint").onclick = () => window.print();
    }
    im.className = cards.every((c) => c.ok) ? "msg ok" : "msg err";
    im.textContent = `${t("i.done")} ✔ (${cards.filter((c) => c.ok).length}/${files.length})`;
    await reload(); renderNav();
  };
  const drop = $("#drop");
  if (drop) {
    $("#file").addEventListener("change", (e) => up(e.target.files));
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); up(e.dataTransfer.files); });
  }
  $$("[data-x]").forEach((b) => b.addEventListener("click", () => {
    const rows = D[b.dataset.x];
    if (!rows.length) return toast(t("none"), true);
    const keys = Object.keys(rows[0]).filter((k) => !["platform", "details"].includes(k));
    exportXlsx(b.textContent.replace("⬇", "").trim(), keys.map((k) => ({ k, label: f(k) })), rows.map((r) => ({ ...r, employee_id: r.employee_id ? empName(EMP.get(r.employee_id)) : r.employee_id })), (c, r) => r[c.k]);
  }));
};

// ================= SETTINGS / USERS / AUDIT =================
PAGES.settings = () => {
  const st = settings();
  $("#view").innerHTML = `${head(t("p.settings"), "")}
    <div class="grid g2">
      <div class="card"><h3>${esc(t("set.thresholds"))}</h3>
        <div class="form-grid">
          <div><label class="fl">${esc(t("set.iqama"))}</label><input class="input" type="number" id="sI" value="${st.iqama}" dir="ltr"></div>
          <div><label class="fl">${esc(t("set.contracts"))}</label><input class="input" type="number" id="sC" value="${st.contracts}" dir="ltr"></div>
          <div><label class="fl">${esc(t("set.docs"))}</label><input class="input" type="number" id="sD" value="${st.docs}" dir="ltr"></div>
          <div><label class="fl">${esc(t("s.target.set"))}</label><input class="input" type="number" id="sT" value="${st.saudization_target ?? ""}" dir="ltr"></div>
          <div class="full"><label><input type="checkbox" id="sR" ${st.contract_autorenew ? "checked" : ""}> ${esc(t("set.autorenew"))}</label></div>
          ${isAdmin() ? `<div class="full"><label><input type="checkbox" id="s2fa" ${st.twofa_required ? "checked" : ""}> ${esc(t("set.2fa"))}</label></div>` : ""}
          <div><label class="fl">${esc(t("set.renewdays"))}</label><input class="input" type="number" id="sRD" value="${st.contract_renew_days ?? 75}" dir="ltr"></div>
          <div><label class="fl">${esc(t("set.hotel"))} (AR)</label><input class="input" id="sHA" value="${esc(st.hotel_name_ar)}"></div>
          <div><label class="fl">${esc(t("set.hotel"))} (EN)</label><input class="input" id="sHE" value="${esc(st.hotel_name_en)}" dir="ltr"></div>
        </div></div>
      <div class="card"><h3>✉ ${esc(t("set.emails"))}</h3>
        ${FEATURES.email ? `<p class="muted" style="margin-top:0">${esc(t("set.daily"))}</p>` : `<div class="note">${esc(t("set.email.off"))}</div>`}
        <label class="fl">${esc(t("set.owner"))}</label>
        <input class="input" type="email" id="sE" dir="ltr" placeholder="name@gmail.com" value="${esc(st.owner_email || "")}" ${isAdmin() ? "" : "disabled"}>
        <div class="note ok-note" style="margin-top:10px">🔒 ${esc(t("set.onlyme"))}</div>
        <div style="margin-top:10px"><button class="btn ghost" id="sTest" ${FEATURES.email ? "" : "disabled"}>${esc(t("set.test"))}</button> <span class="msg" id="sTm"></span></div></div>
    </div>
    <button class="btn" id="sSave">${esc(t("save"))}</button> <span class="msg" id="sm"></span>
    ${isAdmin() ? `<div class="card" style="margin-top:18px"><h3>💾 ${esc(t("sec.backup"))}</h3><p class="muted" style="margin-top:0">${esc(t("sec.backup.d"))}</p>
      <div class="key-in"><input class="input" id="bkCode" inputmode="numeric" maxlength="6" placeholder="${esc(t("sec.code"))}" dir="ltr" style="max-width:200px"><button class="btn" id="bkGo">⬇ ${esc(t("sec.backup.go"))}</button></div><p class="msg" id="bkMsg"></p>
      ${D.storage ? `<p class="muted small">${esc(t("sec.storage"))}: <b class="num">${(D.storage / 1048576).toFixed(0)} MB</b> / 512 MB ${D.storage > 400 * 1048576 ? `<span class="pill s-expired">${esc(t("sec.storage.warn"))}</span>` : ""}</p>` : ""}</div>` : ""}
    ${isAdmin() ? `<div class="card keys-card" style="margin-top:18px"><h3>🔑 ${esc(t("k.title"))}</h3><p class="muted" style="margin-top:0">${esc(t("k.desc"))}</p>
      <div class="key-row key-main"><div class="key-h"><b>✦ ${esc(t("k.gem"))}</b> <span class="pill s-info">${esc(t("k.free"))}</span> <span id="kGeSt"></span></div>
        <ol class="key-steps"><li>${t("k.gem.1")}</li><li>${t("k.gem.2")}</li><li>${t("k.gem.3")}</li></ol>
        <div class="key-in"><input class="input" type="password" id="kGe" placeholder="AIza..." dir="ltr" autocomplete="off"><button class="btn" id="kGeSave">${esc(t("k.save"))}</button><button class="btn ghost sm" id="kGeDel">${esc(t("k.remove"))}</button></div>
        <p class="muted small" style="margin:6px 0 0">🔒 ${esc(t("k.gem.priv"))}</p><p class="msg" id="kGeMsg"></p></div>
      <div class="key-row"><div class="key-h"><b>✦ ${esc(t("k.ai"))}</b> <span class="pill s-none">${esc(t("k.paid"))}</span> <span id="kAiSt"></span></div>
        <ol class="key-steps"><li>${t("k.ai.1")}</li><li>${t("k.ai.2")}</li><li>${t("k.ai.3")}</li></ol>
        <div class="key-in"><input class="input" type="password" id="kAi" placeholder="sk-ant-..." dir="ltr" autocomplete="off"><button class="btn" id="kAiSave">${esc(t("k.save"))}</button><button class="btn ghost sm" id="kAiDel">${esc(t("k.remove"))}</button></div><p class="msg" id="kAiMsg"></p></div>
      <div class="key-row"><div class="key-h"><b>✉ ${esc(t("k.email"))}</b> <span id="kReSt"></span></div>
        <ol class="key-steps"><li>${t("k.re.1")}</li><li>${t("k.re.2")}</li></ol>
        <div class="key-in"><input class="input" type="password" id="kRe" placeholder="re_..." dir="ltr" autocomplete="off"><button class="btn" id="kReSave">${esc(t("k.save"))}</button><button class="btn ghost sm" id="kReDel">${esc(t("k.remove"))}</button></div><p class="msg" id="kReMsg"></p></div>
    </div>` : ""}`;
  $("#bkGo")?.addEventListener("click", async () => {
    const m = $("#bkMsg"); m.className = "msg"; m.textContent = t("loading");
    try {
      const o = await api("/api/backup", { method: "POST", body: { code: $("#bkCode").value.trim() } });
      const wb = XLSX.utils.book_new();
      for (const [k, rows] of Object.entries(o.data)) {
        if (!Array.isArray(rows) || !rows.length) continue;
        const flat = rows.map((r) => Object.fromEntries(Object.entries(r).map(([a, v]) => [a, v && typeof v === "object" ? JSON.stringify(v) : v])));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), k.slice(0, 30));
      }
      XLSX.writeFile(wb, `HR-backup-${o.at.slice(0, 10)}.xlsx`);
      $("#bkCode").value = ""; m.className = "msg ok"; m.textContent = "✔ " + t("sec.backup.ok");
    } catch (e) { m.className = "msg err"; m.textContent = e.message; }
  });
  if (isAdmin()) {
    const pill = (src) => src ? `<span class="pill s-ok">✔ ${esc(t(src === "hosting" ? "k.on.host" : "k.on.site"))}</span>` : `<span class="pill s-expired">${esc(t("k.off"))}</span>`;
    api("/api/settings").then((o) => { $("#kGeSt").innerHTML = pill(o.keys?.gemini); $("#kAiSt").innerHTML = pill(o.keys?.ai); $("#kReSt").innerHTML = pill(o.keys?.email); }).catch(() => {});
    const saveKey = async (field, inp, msg, value) => {
      const m = $(msg); m.className = "msg"; m.textContent = t("k.checking");
      try {
        await api("/api/secrets", { method: "PUT", body: { [field]: value } });
        $(inp).value = ""; m.className = "msg ok"; m.textContent = value ? "✔ " + t("k.saved") : t("k.removed");
        const me = await api("/api/me"); FEATURES = me.features || FEATURES; route();
        toast(value ? "✔ " + t("k.saved") : t("k.removed"));
      } catch (e) { m.className = "msg err"; m.textContent = e.message; }
    };
    $("#kGeSave").onclick = () => $("#kGe").value.trim() && saveKey("gemini_key", "#kGe", "#kGeMsg", $("#kGe").value.trim());
    $("#kGeDel").onclick = () => confirm(t("confirm.delete")) && saveKey("gemini_key", "#kGe", "#kGeMsg", "");
    $("#kAiSave").onclick = () => $("#kAi").value.trim() && saveKey("anthropic_key", "#kAi", "#kAiMsg", $("#kAi").value.trim());
    $("#kReSave").onclick = () => $("#kRe").value.trim() && saveKey("resend_key", "#kRe", "#kReMsg", $("#kRe").value.trim());
    $("#kAiDel").onclick = () => confirm(t("confirm.delete")) && saveKey("anthropic_key", "#kAi", "#kAiMsg", "");
    $("#kReDel").onclick = () => confirm(t("confirm.delete")) && saveKey("resend_key", "#kRe", "#kReMsg", "");
  }
  $("#sSave").addEventListener("click", async () => {
    try {
      await api("/api/settings", { method: "PUT", body: { iqama: $("#sI").value, contracts: $("#sC").value, docs: $("#sD").value, saudization_target: $("#sT").value, contract_autorenew: $("#sR").checked, ...($("#s2fa") ? { twofa_required: $("#s2fa").checked } : {}), contract_renew_days: $("#sRD").value, owner_email: $("#sE").value, hotel_name_ar: $("#sHA").value, hotel_name_en: $("#sHE").value } });
      toast(t("saved")); await refresh();
    } catch (e) { $("#sm").textContent = e.message; }
  });
  $("#sTest").addEventListener("click", async () => {
    const m = $("#sTm");
    try {
      await api("/api/settings", { method: "PUT", body: { owner_email: $("#sE").value } });
      const out = await api("/api/alerts", { method: "POST" });
      m.className = "msg ok"; m.textContent = `✔ ${out.count} → ${out.to.join(", ")}`;
    } catch (e) { m.className = "msg err"; m.textContent = e.message; }
  });
};

PAGES.users = async () => {
  $("#view").innerHTML = `${head(t("p.users"), "", `<button class="btn" id="uAdd">+ ${esc(t("u.add"))}</button>`)}<div class="card" id="tb"><div class="empty">${esc(t("loading"))}</div></div>`;
  const draw = (users) => dataTable($("#tb"), {
    id: "users", rows: users.map((u) => ({ ...u, id: u.id })), exportName: t("p.users"),
    cols: [{ k: "id", label: t("u.id"), num: true }, { k: "name", label: t("u.name") }, { k: "role", label: t("u.role"), get: (u) => t("role." + u.role) },
      { k: "twofa", label: t("sec.2fa"), get: (u) => (u.twofa ? "✔" : "✖"), render: (u) => `<span class="pill ${u.twofa ? "s-ok" : "s-near"}">${esc(u.twofa ? t("sec.on") : t("sec.pending"))}</span>${u.must_change ? ` <span class="pill s-none">${esc(t("sec.mustpw"))}</span>` : ""}` }],
    onRow: (u) => userForm(u, draw),
  });
  $("#uAdd").addEventListener("click", () => userForm(null, draw));
  draw((await api("/api/users")).users);
};

function userForm(u, draw) {
  const m = modal(`<header><h3>${esc(u ? t("edit") : t("u.add"))}</h3><button class="x" data-close>×</button></header>
    <div class="body"><div class="form-grid">
      <div><label class="fl">${esc(t("u.id"))}</label><input class="input" id="uid" value="${esc(u?.id || "")}" ${u ? "disabled" : ""} dir="ltr" inputmode="numeric"></div>
      <div><label class="fl">${esc(t("u.name"))}</label><input class="input" id="un" value="${esc(u?.name || "")}"></div>
      <div><label class="fl">${esc(t("u.role"))}</label><select class="input" id="ur">${["viewer", "editor", "admin"].map((r) => `<option value="${r}" ${u?.role === r ? "selected" : ""}>${esc(t("role." + r))}</option>`).join("")}</select></div>
      <div><label class="fl">${esc(t("u.pw"))}</label><input class="input" id="up" dir="ltr" autocomplete="new-password"></div></div><p class="msg err" id="ue"></p></div>
    <footer>${u && u.id !== ME.id ? `<button class="btn danger sm" id="udel" style="margin-inline-end:auto">${esc(t("delete"))}</button>` : ""}${u?.twofa ? `<button class="btn ghost sm" id="u2fa">📱 ${esc(t("sec.reset2fa"))}</button>` : ""}<button class="btn ghost" data-close>${esc(t("cancel"))}</button><button class="btn" id="us">${esc(t("save"))}</button></footer>`, "sm");
  $("#uid", m.root).addEventListener("change", () => {
    const e = D.employees.find((x) => x.id_no === $("#uid", m.root).value.trim());
    if (e && !$("#un", m.root).value) $("#un", m.root).value = e.name_ar;
  });
  $("#us", m.root).addEventListener("click", async () => {
    try {
      const body = { id: u ? u.id : $("#uid", m.root).value.trim(), name: $("#un", m.root).value.trim(), role: $("#ur", m.root).value };
      if ($("#up", m.root).value) body.password = $("#up", m.root).value;
      draw((await api("/api/users", { method: "POST", body })).users);
      m.close(); toast(t("saved"));
    } catch (e) { $("#ue", m.root).textContent = e.message; }
  });
  $("#u2fa", m.root)?.addEventListener("click", async () => {
    if (!confirm(t("sec.reset2fa.q"))) return;
    try { draw((await api("/api/users", { method: "POST", body: { id: u.id, reset2fa: true } })).users); m.close(); toast(t("saved")); } catch (e) { $("#ue", m.root).textContent = e.message; }
  });
  $("#udel", m.root)?.addEventListener("click", async () => {
    if (!confirm(t("confirm.delete"))) return;
    try { draw((await api("/api/users", { method: "DELETE", body: { id: u.id } })).users); m.close(); } catch (e) { $("#ue", m.root).textContent = e.message; }
  });
}

const TR_ENT = { employees: "p.employees", documents: "p.documents", dependents: "p.dependents", insurance: "p.insurance", tasks: "p.tasks", leaves: "p.leaves", movements: "p.movements", appraisals: "p.appraisals", attachments: "files", jobs: "r.jobs", applicants: "r.applicants", saud_rules: "s.rules" };
PAGES.trash = async () => {
  $("#view").innerHTML = `${head(t("p.trash"), t("tr.desc"))}<div class="card" id="tb"><div class="empty">${esc(t("loading"))}</div></div>`;
  const rows = (await api("/api/trash")).rows;
  if (!rows.length) { $("#tb").innerHTML = `<p class="muted">${esc(t("tr.none"))}</p>`; return; }
  dataTable($("#tb"), {
    id: "trash", rows, exportName: t("p.trash"),
    cols: [
      { k: "deleted_at", label: t("a.at"), num: true, render: (r) => esc(new Date(r.deleted_at).toLocaleString(L() === "en" ? "en-GB" : "ar-SA-u-ca-gregory-nu-latn")) },
      { k: "entity", label: t("tr.entity"), get: (r) => t(TR_ENT[r.entity] || r.entity) },
      { k: "label", label: f("name"), render: (r) => `<b>${esc(r.label || "#" + r.entity_id)}</b>${r.extra_count ? `<br><small class="muted">${esc(t("tr.with").replace("{n}", r.extra_count))}</small>` : ""}` },
      { k: "deleted_by", label: t("tr.by") },
      { k: "act", label: "", noExport: true, get: () => "", render: (r) => canEdit() ? `<span class="row-acts"><button class="btn success sm" data-rest="${r.id}">↩ ${esc(t("tr.restore"))}</button>${isAdmin() ? `<button class="btn ghost sm" data-purge="${r.id}">✕ ${esc(t("tr.purge"))}</button>` : ""}</span>` : "" },
    ],
    chipGet: (r) => t(TR_ENT[r.entity] || r.entity),
    afterDraw: (root) => {
      $$("[data-rest]", root).forEach((b) => b.addEventListener("click", async () => {
        try { await api("/api/trash", { method: "POST", body: { id: +b.dataset.rest } }); toast(t("tr.restored")); await reload(); renderNav(); route(); } catch (e) { toast(e.message, true, 6000); }
      }));
      $$("[data-purge]", root).forEach((b) => b.addEventListener("click", async () => {
        if (!confirm(t("confirm.delete"))) return;
        try { await api("/api/trash", { method: "DELETE", body: { id: +b.dataset.purge } }); toast(t("deleted")); route(); } catch (e) { toast(e.message, true); }
      }));
    },
  });
};

PAGES.audit = async () => {
  $("#view").innerHTML = `${head(t("p.audit"), "")}<div class="card" id="tb"><div class="empty">${esc(t("loading"))}</div></div>`;
  const rows = (await api("/api/audit")).rows;
  dataTable($("#tb"), {
    id: "audit", rows, exportName: t("p.audit"),
    cols: [
      { k: "at", label: t("a.at"), num: true, get: (r) => r.at, render: (r) => esc(new Date(r.at).toLocaleString(L() === "en" ? "en-GB" : "ar-SA-u-ca-gregory-nu-latn")) },
      { k: "user_name", label: t("a.user") },
      { k: "action", label: t("a.action") },
      { k: "entity", label: t("a.entity"), get: (r) => [r.entity, r.entity_id].filter(Boolean).join(" #") },
      { k: "details", label: t("details"), wrap: true, get: (r) => (r.details ? JSON.stringify(r.details).slice(0, 200) : "") },
    ],
    chipGet: (r) => r.action,
  });
};


// ================= WELCOME / QUICK ADD =================
function welcome() {
  const h = new Date().getHours();
  const first = String(ME.name || "").split(" ")[0];
  return `<div class="welcome"><div><h2>${esc(t(h < 12 ? "welcome.morning" : "welcome.evening"))}، ${esc(first)} 👋</h2><p>${esc(t("welcome.sub"))}</p></div>
    <div class="welcome-date">${esc(new Date().toLocaleDateString(L() === "en" ? "en-GB" : "ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</div></div>`;
}

function setupQuickAdd() {
  if (!canEdit()) return;
  const wrap = document.createElement("div");
  wrap.className = "fab no-print";
  wrap.innerHTML = `<div class="fab-menu hidden">
      <button data-q="staff">👤 ${esc(t("p.employees"))}</button>
      <button data-q="labor">👷 ${esc(t("p.labor"))}</button>
      <button data-q="doc">📄 ${esc(t("doc.add"))}</button>
      <button data-q="leave">🌴 ${esc(t("lv.add"))}</button>
      <button data-q="move">↕ ${esc(t("mv.add"))}</button>
      <button data-q="app">🧑‍💼 ${esc(t("r.app.add"))}</button>
    </div><button class="fab-btn" title="${esc(t("quick.add"))}">+</button>`;
  document.body.appendChild(wrap);
  const menu = $(".fab-menu", wrap);
  $(".fab-btn", wrap).addEventListener("click", () => menu.classList.toggle("hidden"));
  document.addEventListener("click", (e) => { if (!e.target.closest(".fab")) menu.classList.add("hidden"); });
  const today = new Date().toISOString().slice(0, 10);
  const go = {
    staff: () => openForm("employees", null, { form: "staff", preset: { kind: "staff", status: "active" }, title: `${t("add")} — ${t("p.employees")}` }),
    labor: () => openForm("employees", null, { form: "labor", preset: { kind: "labor", status: "active" }, title: `${t("add")} — ${t("p.labor")}` }),
    doc: () => openForm("documents", null, { title: t("doc.add") }),
    leave: () => openForm("leaves", null, { preset: { leave_type: "annual", status: "pending" }, title: t("lv.add") }),
    move: () => openForm("movements", null, { preset: { move_date: today }, title: t("mv.add") }),
    app: () => openForm("applicants", null, { preset: { stage: "new" }, title: t("r.app.add") }),
  };
  $$("[data-q]", wrap).forEach((b) => b.addEventListener("click", () => { menu.classList.add("hidden"); go[b.dataset.q](); }));
}

// ================= LEAVES =================
PAGES.leaves = () => {
  const today = new Date().toISOString().slice(0, 10);
  const year = String(new Date().getFullYear());
  const tab = tableState.lvTab || "list";
  const onToday = D.leaves.filter((l) => l.status === "approved" && l.start_date <= today && l.end_date >= today);
  const pending = D.leaves.filter((l) => l.status === "pending");
  const daysYear = D.leaves.filter((l) => l.status === "approved" && String(l.start_date).startsWith(year)).reduce((a, l) => a + (Number(l.days) || 0), 0);
  $("#view").innerHTML = `${head(t("p.leaves"), "", `${canEdit() ? `<button class="btn" id="addLv">+ ${esc(t("lv.add"))}</button>` : ""}<button class="btn ghost" data-act="print">${esc(t("print"))}</button>`)}
    <div class="grid kpis">
      <div class="card kpi blue"><div class="l">${esc(t("lv.ontoday"))}</div><div class="v num">${onToday.length}</div><div class="h">${esc(onToday.map((l) => empName(EMP.get(l.employee_id))).slice(0, 3).join("، "))}</div></div>
      <div class="card kpi orange"><div class="l">${esc(t("lv.pendingk"))}</div><div class="v num">${pending.length}</div></div>
      <div class="card kpi green"><div class="l">${esc(t("lv.daysyear"))}</div><div class="v num">${fmtNum(daysYear)}</div></div>
    </div>
    <div class="tabs no-print"><button data-t="list" class="${tab === "list" ? "on" : ""}">${esc(t("lv.list"))}</button><button data-t="bal" class="${tab === "bal" ? "on" : ""}">${esc(t("lv.balance"))}</button></div>
    <div class="card" id="tb"></div>`;
  $("#addLv")?.addEventListener("click", () => openForm("leaves", null, { preset: { leave_type: "annual", status: "pending" }, title: t("lv.add") }));
  $$("[data-t]").forEach((b) => b.addEventListener("click", () => { tableState.lvTab = b.dataset.t; route(); }));
  if (tab === "list") {
    dataTable($("#tb"), {
      id: "leaves", rows: D.leaves.filter((l) => EMP.has(l.employee_id)), exportName: t("p.leaves"),
      cols: [
        { k: "emp", label: f("employee_id"), get: (l) => empName(EMP.get(l.employee_id)), render: (l) => `<b>${esc(empName(EMP.get(l.employee_id)))}</b><br><small class="muted">${esc(EMP.get(l.employee_id)?.department || "")}</small>` },
        { k: "type", label: f("leave_type"), get: (l) => t("lv." + l.leave_type) + (l.outside_ksa ? " ✈️" : ""), render: (l) => esc(t("lv." + l.leave_type)) + (l.outside_ksa ? ` <span class="pill ${visaCovers(l) ? "s-ok" : "s-expired"}" title="${esc(t("lv.visa"))}">✈️ ${esc(visaCovers(l) ? t("lv.visaok") : t("lv.visano"))}</span>` : "") },
        { k: "start_date", label: f("start_date"), num: true },
        { k: "end_date", label: f("end_date"), num: true },
        { k: "days", label: f("days"), num: true, render: (l) => fmtNum(l.days) },
        { k: "status", label: f("status"), get: (l) => t("ls." + l.status), render: (l) => lvPill(l.status) },
        { k: "act", label: "", noExport: true, get: () => "", render: (l) => canEdit() && l.status === "pending" ? `<span class="row-acts"><button class="btn success sm" data-ap="${l.id}">✓ ${esc(t("approve"))}</button><button class="btn ghost sm" data-rj="${l.id}">✕ ${esc(t("reject"))}</button></span>` : "" },
      ],
      chipGet: (l) => t("ls." + l.status),
      filters: [{ k: "type", label: f("leave_type"), get: (l) => t("lv." + l.leave_type) }],
      onRow: (l) => openForm("leaves", D.leaves.find((x) => x.id === l.id)),
      afterDraw: (root) => {
        const set = (id, status) => api("/api/rows?table=leaves", { method: "PUT", body: { id, status } }).then((o) => { o.warning ? toast("✈️ " + o.warning, "warn", 9000) : toast(t("saved")); return refresh(); });
        $$("[data-ap]", root).forEach((b) => b.addEventListener("click", () => set(+b.dataset.ap, "approved")));
        $$("[data-rj]", root).forEach((b) => b.addEventListener("click", () => set(+b.dataset.rj, "rejected")));
      },
    });
  } else {
    const rows = D.employees.filter((e) => e.kind === "staff" && e.status !== "left").map((e) => ({ ...e, bal: leaveBalance(e) }));
    dataTable($("#tb"), {
      id: "lvbal", rows, exportName: t("lv.balance"),
      cols: [
        { k: "name", label: f("name"), get: (e) => empName(e), render: (e) => `<b>${esc(empName(e))}</b>` },
        { k: "department", label: f("department") },
        { k: "ent", label: t("lv.entitled"), num: true, get: (e) => e.bal.entitled },
        { k: "used", label: t("lv.used"), num: true, get: (e) => e.bal.used },
        { k: "rem", label: t("lv.remaining"), num: true, get: (e) => e.bal.remaining, render: (e) => `<span class="${e.bal.remaining < 0 ? "d-exp" : ""}">${e.bal.remaining}</span>` },
      ],
      filters: [{ k: "department", label: t("filter.dept"), get: (e) => e.department }],
      onRow: (e) => openProfile(e.id, "leaves"),
    });
  }
};

// ================= MOVEMENTS =================
PAGES.movements = () => {
  $("#view").innerHTML = `${head(t("p.movements"), "", `${canEdit() ? `<button class="btn" id="addMv">+ ${esc(t("mv.add"))}</button>` : ""}<button class="btn ghost" data-act="print">${esc(t("print"))}</button>`)}<div class="card" id="tb"></div>`;
  $("#addMv")?.addEventListener("click", () => openForm("movements", null, { preset: { move_date: new Date().toISOString().slice(0, 10) }, title: t("mv.add") }));
  dataTable($("#tb"), {
    id: "moves", rows: D.movements.filter((x) => EMP.has(x.employee_id)), exportName: t("p.movements"),
    cols: [
      { k: "move_date", label: f("move_date"), num: true },
      { k: "emp", label: f("employee_id"), get: (x) => empName(EMP.get(x.employee_id)), render: (x) => `<b>${esc(empName(EMP.get(x.employee_id)))}</b>` },
      { k: "type", label: f("move_type"), get: (x) => t("mv." + x.move_type) },
      { k: "from_value", label: f("from_value") },
      { k: "to_value", label: f("to_value") },
      { k: "notes", label: f("notes"), wrap: true },
    ],
    chipGet: (x) => t("mv." + x.move_type),
    onRow: (x) => openForm("movements", D.movements.find((m) => m.id === x.id)),
  });
};

// ================= APPRAISALS (e-signature) =================
const signLink = (tok) => `${location.origin}/sign.html?t=${encodeURIComponent(tok)}`;
const aprPill = (s) => `<span class="pill ${s === "completed" ? "s-ok" : s === "employee" ? "s-info" : "s-near"}">${esc(APR_STATUS[s]?.[L() === "en" ? 1 : 0] || s)}</span>`;
const bil = (m, k) => (m[k] ? m[k][L() === "en" ? 1 : 0] : "—");

function aprTable(rows, withEmp = true) {
  if (!rows.length) return `<p class="muted">${esc(t("apr.none"))}</p>`;
  return `<div class="tbl compact"><table><thead><tr>${withEmp ? `<th>${esc(f("employee_id"))}</th>` : ""}<th>${esc(t("apr.period"))}</th><th>${esc(t("apr.manager"))}</th><th>${esc(f("status"))}</th><th class="num">${esc(t("apr.score"))}</th><th>${esc(t("apr.decision"))}</th><th class="no-print"></th></tr></thead><tbody>
    ${rows.map((a) => {
      const tok = a.status === "manager" ? a.token_mgr : a.status === "employee" ? a.token_emp : null;
      return `<tr>${withEmp ? `<td><b>${esc(empName(EMP.get(a.employee_id)))}</b><br><small class="muted">${esc(EMP.get(a.employee_id)?.job_title || "")}</small></td>` : ""}
      <td>${esc(a.period || "—")}</td><td>${esc(a.manager_name || "")}</td><td>${aprPill(a.status)}</td>
      <td class="num">${a.total != null ? esc(a.total) + "%" : "—"}<br><small class="muted">${esc(a.grade ? bil(GRADES, a.grade) : "")}</small></td>
      <td><span class="dec-t ${esc(a.decision || "")}">${esc(a.decision ? bil(DECISIONS, a.decision) : "—")}</span></td>
      <td class="no-print"><span class="row-acts">
        ${tok ? `<button class="btn sm" data-aprlink="${a.id}" data-tok="${esc(tok)}" data-st="${a.status}">🔗 ${esc(t(a.status === "manager" ? "apr.sendmgr" : "apr.sendemp"))}</button>` : ""}
        ${a.status !== "manager" ? `<button class="btn ghost sm" data-aprview="${a.id}">📄 ${esc(t("apr.view"))}</button>` : ""}
        ${canEdit() ? `<button class="btn ghost sm" data-aprdel="${a.id}" title="${esc(t("delete"))}">✕</button>` : ""}</span></td></tr>`;
    }).join("")}</tbody></table></div>`;
}

function bindApr(root, before = () => {}) {
  $$("[data-aprlink]", root).forEach((b) => b.addEventListener("click", () => { before(); shareLink(+b.dataset.aprlink, b.dataset.tok, b.dataset.st); }));
  $$("[data-aprview]", root).forEach((b) => b.addEventListener("click", () => { before(); viewAppraisal(+b.dataset.aprview); }));
  $$("[data-aprdel]", root).forEach((b) => b.addEventListener("click", async () => {
    if (!confirm(t("confirm.delete"))) return;
    try { await api("/api/appraisals", { method: "DELETE", body: { id: +b.dataset.aprdel } }); before(); toast(t("deleted")); await refresh(); } catch (e) { toast(e.message, true); }
  }));
}

function shareLink(id, tok, stage) {
  const a = (D.appraisals || []).find((x) => x.id === id);
  const e = EMP.get(a?.employee_id);
  const link = signLink(tok);
  const who = stage === "manager" ? (a?.manager_name || "") : empName(e);
  const msg = stage === "manager"
    ? `السلام عليكم ${who}،\nنرجو تقييم أداء الموظف/ة ${empName(e)} وتحديد قرار تجديد العقد والتوقيع إلكترونيًا عبر الرابط:\n${link}\n— الموارد البشرية، نوفوتيل المدينة`
    : `السلام عليكم ${who}،\nنرجو الاطلاع على تقييم أدائك وقرار تجديد العقد والتوقيع إلكترونيًا عبر الرابط:\n${link}\n— الموارد البشرية، نوفوتيل المدينة`;
  const m = modal(`<header><h3>🔗 ${esc(t(stage === "manager" ? "apr.sendmgr" : "apr.sendemp"))} — ${esc(who)}</h3><button class="x" data-close>×</button></header>
    <div class="body"><p class="muted" style="margin-top:0">${esc(t("apr.linkhelp"))}</p>
      <input class="input" readonly value="${esc(link)}" style="direction:ltr" id="lnk">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn" id="lcp">📋 ${esc(t("apr.copy"))}</button>
        <a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">💬 WhatsApp</a>
        <a class="btn ghost" href="mailto:?subject=${encodeURIComponent("تقييم الأداء وتجديد العقد — " + empName(e))}&body=${encodeURIComponent(msg)}">✉️ ${esc(t("apr.email"))}</a>
        <a class="btn ghost" target="_blank" rel="noopener" href="${esc(link)}">↗ ${esc(t("apr.open"))}</a>
        ${canEdit() ? `<button class="btn ghost" id="lnew">↻ ${esc(t("apr.renew"))}</button>` : ""}
      </div><p class="muted small">${esc(t("apr.expires"))}: ${esc(fmtDate(a?.expires_at))}</p></div>`);
  $("#lcp", m.root).onclick = () => { navigator.clipboard?.writeText(link); $("#lnk", m.root).select(); toast("✔ " + t("apr.copied")); };
  $("#lnew", m.root)?.addEventListener("click", async () => {
    try { const o = await api("/api/appraisals", { method: "PUT", body: { id } }); m.close(); await refresh(); shareLink(id, o.token_mgr || o.token_emp, stage); } catch (err) { toast(err.message, true); }
  });
}

async function viewAppraisal(id) {
  try {
    const v = await api("/api/appraisals?id=" + id);
    const m = modal(`<header><h3>📄 ${esc(t("p.appraisals"))} — ${esc(v.employee.name_ar)}</h3><div style="display:flex;gap:6px"><button class="btn sm" id="aprPr">🖨 ${esc(t("apr.pdf"))}</button><button class="x" data-close>×</button></div></header>
      <div class="body">${renderDoc(v)}</div>`, "wide");
    $("#aprPr", m.root).onclick = () => printModal(m);
  } catch (e) { toast(e.message, true); }
}

function newAppraisal(empId) {
  const y = new Date().getFullYear();
  const m = modal(`<header><h3>+ ${esc(t("apr.new"))}</h3><button class="x" data-close>×</button></header>
    <div class="body"><form id="afrm" class="form-grid">
      <label>${esc(f("employee_id"))} *<select class="input" name="employee_id" required><option value=""></option>${OPTS.employee_id().map(([v, l]) => `<option value="${v}" ${String(empId) === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
      <label>${esc(t("apr.period"))}<input class="input" name="period" value="${y}"></label>
      <label>${esc(t("apr.manager"))} *<input class="input" name="manager_name" required></label>
      <label>${esc(t("apr.mtitle"))}<input class="input" name="manager_title"></label>
    </form><p class="muted small">${esc(t("apr.flow"))}</p><p class="msg err" id="aerr"></p></div>
    <footer><button class="btn ghost" data-close>${esc(t("cancel"))}</button><button class="btn" id="asave">${esc(t("apr.create"))}</button></footer>`);
  $("#asave", m.root).onclick = async () => {
    const frm = $("#afrm", m.root);
    if (!frm.reportValidity()) return;
    try {
      const o = await api("/api/appraisals", { method: "POST", body: Object.fromEntries(new FormData(frm).entries()) });
      m.close(); await refresh(); shareLink(o.id, o.token_mgr, "manager");
    } catch (e) { $("#aerr", m.root).textContent = e.message; }
  };
}

PAGES.appraisals = () => {
  const all = (D.appraisals || []).filter((a) => EMP.has(a.employee_id));
  const tab = tableState.aprTab || "all";
  const rows = all.filter((a) => tab === "all" || (tab === "open" ? a.status !== "completed" : a.status === "completed"));
  const n = (fn) => all.filter(fn).length;
  $("#view").innerHTML = `${head(t("p.appraisals"), t("apr.desc"), `${canEdit() ? `<button class="btn" id="addApr">+ ${esc(t("apr.new"))}</button>` : ""}<button class="btn ghost" data-act="print">${esc(t("print"))}</button>`)}
    <div class="grid kpis">
      <div class="card kpi orange"><div class="l">${esc(APR_STATUS.manager[L() === "en" ? 1 : 0])}</div><div class="v num">${n((a) => a.status === "manager")}</div></div>
      <div class="card kpi blue"><div class="l">${esc(APR_STATUS.employee[L() === "en" ? 1 : 0])}</div><div class="v num">${n((a) => a.status === "employee")}</div></div>
      <div class="card kpi green"><div class="l">${esc(bil(DECISIONS, "renew"))}</div><div class="v num">${n((a) => a.decision === "renew")}</div></div>
      <div class="card kpi red"><div class="l">${esc(bil(DECISIONS, "not_renew"))} / ${esc(bil(DECISIONS, "renew_conditional"))}</div><div class="v num">${n((a) => a.decision && a.decision !== "renew")}</div></div>
    </div>
    <div class="tabs no-print">${["all", "open", "done"].map((k) => `<button data-t="${k}" class="${tab === k ? "on" : ""}">${esc(t("apr.t." + k))}</button>`).join("")}</div>
    <div class="card">${aprTable(rows)}</div>`;
  $("#addApr")?.addEventListener("click", () => newAppraisal(""));
  $$("[data-t]").forEach((b) => b.addEventListener("click", () => { tableState.aprTab = b.dataset.t; route(); }));
  bindApr($("#view"));
};

// ================= REPORTS =================
const REPORTS = ["leavers", "saud", "docs", "staff", "payroll", "leaves", "labor"];
const REP_ICON = { leavers: "🚪", saud: "📊", docs: "⏰", staff: "👥", payroll: "💰", leaves: "🌴", labor: "👷" };

PAGES.reports = () => {
  const which = tableState.report;
  if (which && REPORTS.includes(which)) return showReport(which);
  $("#view").innerHTML = `${head(t("rep.title"), t("rep.desc"))}
    <div class="grid g3">${REPORTS.map((k) => `<div class="card report-card" data-rep="${k}"><div class="ri">${REP_ICON[k]}</div><h3>${esc(t("rep." + k))}</h3><p class="muted">${esc(t("rep." + k + ".d"))}</p><button class="btn sm">${esc(t("rep.open"))}</button></div>`).join("")}</div>`;
  $$("[data-rep]").forEach((c) => c.addEventListener("click", () => { tableState.report = c.dataset.rep; route(); }));
};

function reportTable(headers, rows, foot) {
  return `<table class="rtable"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${headers.length}" class="empty">${esc(t("none"))}</td></tr>`}</tbody>${foot ? `<tfoot><tr>${foot.map((c) => `<td>${c}</td>`).join("")}</tr></tfoot>` : ""}</table>`;
}

function buildReport(k) {
  const st = settings();
  const staff = D.employees.filter((e) => e.kind === "staff" && e.status !== "left");
  const labor = D.employees.filter((e) => e.kind === "labor" && e.status !== "left");
  const n = (v) => `<span class="num">${esc(v)}</span>`;
  if (k === "saud") {
    const r = ratio(staff);
    const tgt = st.saudization_target;
    const rows = groupRatio(staff, "department").map((g) => [esc(g.key), n(g.total), n(g.saudi), n(g.non_saudi), n(pct(g.pct)), ...(tgt ? [n(saudisNeeded(g, tgt))] : [])]);
    return `<div class="rsum"><div><span>${esc(t("k.staff"))}</span><b>${r.total}</b></div><div><span>${esc(t("k.saudi"))}</span><b>${r.saudi}</b></div><div><span>${esc(t("k.nonsaudi"))}</span><b>${r.non_saudi}</b></div><div><span>${esc(t("k.ratio"))}</span><b>${pct(r.pct)}</b></div>${tgt ? `<div><span>${esc(t("k.target"))}</span><b>${tgt}%</b></div><div><span>${esc(t("k.needed"))}</span><b>${saudisNeeded(r, tgt)}</b></div>` : ""}</div>
      ${reportTable([f("department"), t("total"), t("k.saudi"), t("k.nonsaudi"), t("k.ratio"), ...(tgt ? [t("s.need")] : [])], rows, [esc(t("rep.total")), n(r.total), n(r.saudi), n(r.non_saudi), n(pct(r.pct)), ...(tgt ? [n(saudisNeeded(r, tgt))] : [])])}
      <p class="muted small">${esc(t("s.note"))}</p>`;
  }
  if (k === "docs") {
    const al = buildAlerts(D.employees, D.documents, st, undefined, { appraisals: D.appraisals || [], attachments: D.attachments || [] });
    const sec = (s) => {
      const list = al.filter((a) => a.status === s);
      return `<h3 class="rsec">${esc(t("st." + s))} (${list.length})</h3>` + reportTable([f("name"), f("id_no"), `${f("department")} / ${f("company")}`, t("doc.type"), t("doc.expiry"), t("doc.days")],
        list.map((a) => [esc(empName(a.employee)), n(a.employee.id_no || ""), esc(a.employee.kind === "labor" ? a.employee.company || "" : a.employee.department || ""), esc(docLabel(a.doc.doc_type)), n(fmtDate(a.expiry)), `<span class="num ${a.days < 0 ? "d-exp" : "d-near"}">${a.days}</span>`]));
    };
    return sec("expired") + sec("near");
  }
  if (k === "staff") {
    const groups = groupRatio(staff, "department");
    return groups.map((g) => {
      const list = staff.filter((e) => ((e.department && String(e.department).trim()) || "—") === g.key);
      return `<h3 class="rsec">${esc(g.key)} (${list.length})</h3>` + reportTable([f("emp_no"), f("name"), f("job_title"), f("nationality"), f("join_date")],
        list.map((e) => [n(e.emp_no || ""), esc(empName(e)), esc(e.job_title || ""), esc(e.nationality || ""), n(fmtDate(e.join_date))]));
    }).join("");
  }
  if (k === "payroll") {
    const sum = (key) => staff.reduce((a, e) => a + (Number(e[key]) || 0), 0);
    return reportTable([f("emp_no"), f("name"), f("department"), f("basic_salary"), f("housing"), f("transport"), f("total_salary"), f("bank"), f("iban")],
      staff.map((e) => [n(e.emp_no || ""), esc(empName(e)), esc(e.department || ""), n(fmtNum(e.basic_salary)), n(fmtNum(e.housing) || e.housing || ""), n(fmtNum(e.transport) || e.transport || ""), n(fmtNum(e.total_salary)), esc(e.bank || ""), n(e.iban || "")]),
      [esc(t("rep.total")), "", "", n(fmtNum(sum("basic_salary"))), "", "", n(fmtNum(sum("total_salary"))), "", ""]);
  }
  if (k === "leaves") {
    const year = String(new Date().getFullYear());
    const bal = reportTable([f("name"), f("department"), t("lv.entitled"), t("lv.used"), t("lv.remaining")],
      staff.map((e) => { const b = leaveBalance(e); return [esc(empName(e)), esc(e.department || ""), n(b.entitled), n(b.used), `<span class="num ${b.remaining < 0 ? "d-exp" : ""}">${b.remaining}</span>`]; }));
    const lv = D.leaves.filter((l) => l.status === "approved" && String(l.start_date).startsWith(year) && EMP.has(l.employee_id));
    return `<h3 class="rsec">${esc(t("lv.balance"))}</h3>${bal}<h3 class="rsec">${esc(t("lv.list"))} (${lv.length})</h3>` + reportTable([f("name"), f("leave_type"), f("start_date"), f("end_date"), f("days")],
      lv.map((l) => [esc(empName(EMP.get(l.employee_id))), esc(t("lv." + l.leave_type)), n(fmtDate(l.start_date)), n(fmtDate(l.end_date)), n(fmtNum(l.days))]));
  }
  if (k === "leavers") {
    const list = D.documents.filter((d) => d.doc_type === "contract" && EMP.get(d.employee_id)?.status !== "left")
      .map((d) => ({ d, e: EMP.get(d.employee_id), why: leavingReason(d, (D.appraisals || []).filter((a) => a.employee_id === d.employee_id && a.status !== "manager")) }))
      .filter((x) => x.why).sort((a, b) => String(a.d.expiry_date).localeCompare(String(b.d.expiry_date)));
    return `<div class="rsum"><div><span>${esc(t("rep.leavers.n"))}</span><b>${list.length}</b></div></div>` +
      (list.length ? list.map(({ d, e, why }) => `<h3 class="rsec">${esc(empName(e))} — ${esc(e.job_title || "")}</h3>
        <table class="rtable"><tbody>
          <tr><th>${esc(f("emp_no"))}</th><td class="num">${esc(e.emp_no || "")}</td><th>${esc(f("id_no"))}</th><td class="num">${esc(e.id_no || "")}</td></tr>
          <tr><th>${esc(f("department"))}</th><td>${esc(e.department || "")}</td><th>${esc(f("nationality"))}</th><td>${esc(e.nationality || "")}</td></tr>
          <tr><th>${esc(f("join_date"))}</th><td class="num">${esc(fmtDate(e.join_date))}</td><th>${esc(t("rep.leavers.end"))}</th><td class="num"><b>${esc(fmtDate(d.expiry_date))}</b></td></tr>
          <tr><th>${esc(t("rep.leavers.why"))}</th><td colspan="3">${esc(why)}</td></tr>
          <tr><th>${esc(t("p.documents"))}</th><td colspan="3">${D.documents.filter((x) => x.employee_id === e.id).map((x) => `${esc(docLabel(x.doc_type))}: <span class="num">${esc(fmtDate(x.expiry_date) || "—")}</span>`).join(" • ")}</td></tr>
        </tbody></table>`).join("") : `<p class="muted">${esc(t("rep.leavers.none"))}</p>`);
  }
  if (k === "labor") {
    const stOf = (e, type) => { const d = D.documents.find((x) => x.employee_id === e.id && x.doc_type === type); return d ? docStatus(d, st) : { status: "none", expiry: null }; };
    return groupRatio(labor, "company").map((g) => {
      const list = labor.filter((e) => ((e.company && String(e.company).trim()) || "—") === g.key);
      return `<h3 class="rsec">${esc(g.key)} (${list.length})</h3>` + reportTable([f("name"), f("id_no"), f("job_title"), t("set.iqama"), DOC_TYPES.ajeer[L()]],
        list.map((e) => { const i = stOf(e, "iqama"), a = stOf(e, "ajeer"); return [esc(empName(e)), n(e.id_no || ""), esc(e.job_title || ""), `${n(fmtDate(i.expiry) || "")} ${stPill(i.status)}`, `${n(fmtDate(a.expiry) || "")} ${stPill(a.status)}`]; }));
    }).join("");
  }
  return "";
}

function showReport(k) {
  const st = settings();
  const today = fmtDate(new Date().toISOString());
  $("#printTitle").textContent = t("rep." + k);
  $("#view").innerHTML = `${head(t("rep." + k), t("rep." + k + ".d"), `<button class="btn ghost" id="repBack">← ${esc(t("rep.back"))}</button><button class="btn" data-act="print">🖨 ${esc(t("print"))} / PDF</button>`)}
    <div class="report-doc">
      <div class="report-head"><img src="/logo-navy.png" alt="Novotel"><div><b>${esc(t("rep." + k))}</b><span>${esc(st[L() === "en" ? "hotel_name_en" : "hotel_name_ar"])} — ${esc(t("hr"))}</span></div><div class="rmeta">${esc(t("rep.date"))}: <span class="num">${esc(today)}</span><br>${esc(t("rep.prepared"))}: ${esc(ME.name)}</div></div>
      ${buildReport(k)}
      <div class="report-sign"><div>${esc(t("rep.prepared"))}: ${esc(ME.name)}</div><div>${esc(t("rep.sign"))}: ____________________</div><div>${esc(t("rep.date"))}: <span class="num">${esc(today)}</span></div></div>
    </div>`;
  $("#repBack").addEventListener("click", () => { tableState.report = null; route(); });
}

// ================= global search =================
function setupSearch() {
  const q = $("#gq"), res = $("#gres");
  const run = () => {
    const s = norm(q.value);
    if (s.length < 2) return res.classList.add("hidden");
    const out = D.employees.filter((e) => [e.name_ar, e.name_en, e.id_no, e.emp_no].some((v) => v && norm(v).includes(s))).slice(0, 20);
    res.innerHTML = out.length
      ? out.map((e) => `<button data-id="${e.id}">${esc(empName(e))}<small>${esc(t(e.kind === "labor" ? "p.labor" : "p.employees"))} • ${esc(e.id_no || "")} • ${esc(e.kind === "labor" ? e.company || "" : e.department || "")}</small></button>`).join("")
      : `<div class="empty" style="padding:12px">${esc(t("none"))}</div>`;
    res.classList.remove("hidden");
    $$("button", res).forEach((b) => b.addEventListener("click", () => { res.classList.add("hidden"); q.value = ""; openProfile(+b.dataset.id); }));
  };
  q.addEventListener("input", run);
  q.addEventListener("focus", run);
  document.addEventListener("click", (e) => { if (!e.target.closest(".gsearch")) res.classList.add("hidden"); });
}

// ================= password =================
function openPassword() {
  const m = modal(`<header><h3>${esc(t("change.password"))}</h3><button class="x" data-close>×</button></header>
    <form class="body" id="pf"><div class="form-grid">
      <div class="full"><label class="fl">${L() === "en" ? "Current password" : "كلمة المرور الحالية"}</label><input class="input" type="password" id="pc" required dir="ltr" autocomplete="current-password"></div>
      <div class="full"><label class="fl">${esc(t("lg.pw.new"))}</label><input class="input" type="password" id="pn" required minlength="10" dir="ltr" autocomplete="new-password"><p class="muted small" style="margin:4px 0 0">${esc(t("lg.r1"))} • ${esc(t("lg.r2"))} • ${esc(t("lg.r3"))}</p></div>
    </div><p class="msg" id="pm"></p></form>
    <footer><button class="btn ghost sm" id="pall" style="margin-inline-end:auto">🚪 ${esc(t("sec.logoutall"))}</button><button class="btn ghost" data-close>${esc(t("cancel"))}</button><button class="btn" id="ps">${esc(t("save"))}</button></footer>`, "sm");
  $("#pall", m.root).addEventListener("click", async () => {
    if (!confirm(t("sec.logoutall.q"))) return;
    try { await api("/api/password", { method: "POST", body: { logout_all: true } }); location.replace("/"); } catch (e) { $("#pm", m.root).className = "msg err"; $("#pm", m.root).textContent = e.message; }
  });
  $("#ps", m.root).addEventListener("click", async () => {
    try {
      await api("/api/password", { method: "POST", body: { current: $("#pc", m.root).value, next: $("#pn", m.root).value } });
      m.close(); toast(t("saved")); setTimeout(() => location.reload(), 800);
    } catch (e) { $("#pm", m.root).className = "msg err"; $("#pm", m.root).textContent = e.message; }
  });
}

// ================= idle lock (30 minutes) =================
const IDLE_MS = 30 * 60e3, PING_MS = 5 * 60e3, LS_KEY = "hr_last_activity";
let lastActivity = Date.now(), lastPing = Date.now();
const readShared = () => { try { return +localStorage.getItem(LS_KEY) || 0; } catch { return 0; } };
const writeShared = (v) => { try { localStorage.setItem(LS_KEY, String(v)); } catch {} };
function setupIdleLock() {
  const touch = () => {
    lastActivity = Date.now();
    writeShared(lastActivity);
    if (lastActivity - lastPing > PING_MS) {
      lastPing = lastActivity;
      fetch("/api/me").then((r) => { if (r.status === 401) location.replace("/?idle=1"); }).catch(() => {});
    }
  };
  ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"].forEach((ev) => window.addEventListener(ev, touch, { passive: true }));
  writeShared(lastActivity);
  setInterval(async () => {
    if (Date.now() - Math.max(lastActivity, readShared()) >= IDLE_MS) {
      try { await fetch("/api/logout", { method: "POST" }); } catch {}
      location.replace("/?idle=1");
    }
  }, 20e3);
}

// ================= boot =================
(async () => {
  try {
    const me = await api("/api/me");
    if (me.stage && me.stage !== "full") { location.replace("/"); return; }
    ME = me.user;
    FEATURES = me.features || FEATURES;
    await reload();
  } catch (e) {
    if (e.message !== "401") $("#view").innerHTML = `<div class="card empty">⚠ ${esc(e.message)}</div>`;
    return;
  }
  paintChrome();
  renderNav();
  setupSearch();
  setupIdleLock();
  setupQuickAdd();
  $("#menuBtn").onclick = () => $("#side").classList.toggle("open");
  $("#langBtn").onclick = () => { setLang(L() === "ar" ? "en" : "ar"); paintChrome(); renderNav(); route(); };
  $("#themeBtn").onclick = () => {
    const n = isDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", n);
    try { localStorage.setItem("hr_theme", n); } catch {}
    route();
  };
  $("#printBtn").onclick = () => window.print();
  document.addEventListener("click", (e) => { if (e.target.closest('[data-act="print"]')) window.print(); });
  window.addEventListener("hashchange", route);
  route();
})();
