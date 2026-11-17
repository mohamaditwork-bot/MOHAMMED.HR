// HR control platform — single page app (vanilla ES modules, no build step).
import { t, f, getLang, setLang } from "./i18n.js";
import {
  DOC_TYPES, DEFAULT_SETTINGS, docStatus, buildAlerts, ratio, groupRatio, isSaudi, saudisNeeded, ruleCoverage,
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

function toast(msg, err = false) {
  const el = document.createElement("div");
  el.className = "toast" + (err ? " err" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

async function reload() {
  D = await api("/api/all");
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
  audit: "M13 3a9 9 0 0 0-9 9H1l4 4 4-4H6a7 7 0 1 1 2.1 5l-1.4 1.4A9 9 0 1 0 13 3zm-1 5v5l4.3 2.5.7-1.2-3.5-2.1V8z",
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${I[k] || I.dashboard}"/></svg>`;

const NAV = [
  ["nav.main", ["dashboard", "assistant"]],
  ["nav.people", ["employees", "labor", "dependents"]],
  ["nav.compliance", ["documents", "insurance", "platforms", "tasks"]],
  ["nav.growth", ["saudization", "recruitment"]],
  ["nav.tools", ["import"]],
  ["nav.admin", ["settings", "users", "audit"], true],
];

function renderNav() {
  const st = settings();
  const alerts = buildAlerts(D.employees, D.documents, st);
  const counts = {
    employees: D.employees.filter((e) => e.kind === "staff" && e.status !== "left").length,
    labor: D.employees.filter((e) => e.kind === "labor" && e.status !== "left").length,
    documents: alerts.length,
    tasks: D.tasks.filter((x) => x.status === "open").length,
    recruitment: D.applicants.filter((a) => !["hired", "rejected"].includes(a.stage)).length,
  };
  let h = "";
  for (const [g, items, adminOnly] of NAV) {
    if (adminOnly && !isAdmin()) continue;
    h += `<div class="nav-group">${esc(t(g))}</div>`;
    for (const k of items) {
      const c = counts[k];
      const badge = c ? `<span class="badge ${k === "documents" || k === "tasks" ? "alert" : ""}">${c}</span>` : "";
      h += `<a href="#${k}" data-k="${k}">${icon(k)}<span>${esc(t("p." + k))}</span>${badge}</a>`;
    }
  }
  $("#nav").innerHTML = h;
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
      toast(t("saved"));
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
  const alerts = buildAlerts(D.employees, D.documents, st);
  const openJobs = D.jobs.filter((j) => j.status === "open");
  const activeApps = D.applicants.filter((a) => !["hired", "rejected"].includes(a.stage));
  const need = saudisNeeded(r, st.saudization_target);
  const kpi = (l, v, h, cls = "", go = "") => `<div class="card kpi ${cls} ${go ? "click" : ""}" ${go ? `data-go="${go}"` : ""}><div class="l">${esc(l)}</div><div class="v num">${v}</div><div class="h">${esc(h || "")}</div></div>`;

  $("#view").innerHTML = `
    ${head(t("p.dashboard"), `${t("today")}: ${fmtDate(new Date().toISOString())}`, `${FEATURES.ai ? `<button class="btn" id="aiIns">✦ ${esc(t("ai.generate"))}</button>` : ""}<button class="btn ghost" onclick="print()">${esc(t("print"))}</button>`)}
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
  const series = ["expired", "near", "ok", "none"].map((s, i) => ({
    name: t("st." + s), type: "bar", stack: "a", barMaxWidth: 26,
    itemStyle: { color: ["#c4372a", "#e8892a", "#1d8048", "#9aa0b4"][i] },
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
function peoplePage(kind) {
  const rows = D.employees.filter((e) => e.kind === kind);
  const docsBy = new Map();
  for (const d of D.documents) {
    const s = docStatus(d, settings());
    const cur = docsBy.get(d.employee_id);
    const rank = { expired: 3, near: 2, none: 1, ok: 0 }[s.status];
    if (!cur || rank > cur.rank) docsBy.set(d.employee_id, { rank, s });
  }
  const worst = (e) => docsBy.get(e.id)?.s.status || "ok";
  const cols = kind === "staff"
    ? [
      { k: "emp_no", label: f("emp_no"), num: true },
      { k: "name", label: f("name"), get: (e) => empName(e), render: (e) => `<b>${esc(empName(e))}</b><br><small class="muted">${esc(L() === "en" ? e.name_ar : e.name_en || "")}</small>` },
      { k: "id_no", label: f("id_no"), num: true },
      { k: "nationality", label: f("nationality"), render: (e) => `${esc(e.nationality || "")}${isSaudi(e.nationality) ? ' <span class="pill s-ok">KSA</span>' : ""}` },
      { k: "department", label: f("department") },
      { k: "job_title", label: f("job_title") },
      { k: "join_date", label: f("join_date"), num: true },
      { k: "total_salary", label: f("total_salary"), num: true, render: (e) => fmtNum(e.total_salary) },
      { k: "docs", label: t("doc.status"), get: (e) => t("st." + worst(e)), render: (e) => stPill(worst(e)), noExport: false },
      { k: "status", label: f("status"), get: (e) => t("emp." + e.status), render: (e) => `<span class="pill ${e.status === "left" ? "s-none" : "s-info"}">${esc(t("emp." + e.status))}</span>` },
    ]
    : [
      { k: "emp_no", label: f("emp_no"), num: true },
      { k: "name", label: f("name"), get: (e) => empName(e), render: (e) => `<b>${esc(empName(e))}</b>` },
      { k: "id_no", label: f("id_no"), num: true },
      { k: "company", label: f("company") },
      { k: "nationality", label: f("nationality") },
      { k: "department", label: f("department") },
      { k: "job_title", label: f("job_title") },
      { k: "basic_salary", label: f("basic_salary"), num: true, render: (e) => fmtNum(e.basic_salary) },
      { k: "docs", label: t("doc.status"), get: (e) => t("st." + worst(e)), render: (e) => stPill(worst(e)) },
      { k: "status", label: f("status"), get: (e) => t("emp." + e.status), render: (e) => `<span class="pill ${e.status === "left" ? "s-none" : "s-info"}">${esc(t("emp." + e.status))}</span>` },
    ];
  const title = t(kind === "staff" ? "p.employees" : "p.labor");
  $("#view").innerHTML = head(title, `${rows.filter((e) => e.status !== "left").length} ${t("emp.active")}`,
    `${canEdit() ? `<button class="btn" id="addEmp">+ ${esc(t("add"))}</button>` : ""}<button class="btn ghost" onclick="print()">${esc(t("print"))}</button>`) + `<div class="card" id="tb"></div>`;
  $("#addEmp")?.addEventListener("click", () => openForm("employees", null, { form: kind, preset: { kind, status: "active" }, title: `${t("add")} — ${title}` }));
  dataTable($("#tb"), {
    id: "people-" + kind, rows, cols, exportName: title,
    filters: kind === "staff"
      ? [{ k: "department", label: t("filter.dept"), get: (e) => e.department }, { k: "nationality", label: t("filter.nat"), get: (e) => e.nationality }]
      : [{ k: "company", label: t("filter.company"), get: (e) => e.company }, { k: "nationality", label: t("filter.nat"), get: (e) => e.nationality }],
    chipGet: (e) => t("st." + worst(e)),
    onRow: (e) => openProfile(e.id),
    searchExtra: (e) => [e.name_ar, e.name_en, e.mobile, e.iqama_job].join(" "),
  });
}
PAGES.employees = () => peoplePage("staff");
PAGES.labor = () => peoplePage("labor");

function openProfile(id) {
  const e = EMP.get(id);
  if (!e) return;
  const st = settings();
  const docs = D.documents.filter((d) => d.employee_id === id).map((d) => ({ ...d, s: docStatus(d, st) }));
  const deps = D.dependents.filter((d) => d.employee_id === id);
  const ins = D.insurance.filter((x) => x.employee_id === id);
  const p = e.platform || {};
  const skip = new Set(["id", "kind", "platform", "created_at", "updated_at"]);
  const kv = Object.entries(e)
    .filter(([k, v]) => !skip.has(k) && v !== null && v !== "")
    .map(([k, v]) => `<div><span>${esc(f(k))}</span><b>${esc(k === "status" ? t("emp." + v) : typeof v === "number" || /salary/.test(k) ? fmtNum(v, 2) : fmtDate(v))}</b></div>`)
    .join("");
  const m = modal(`
    <header><div><h3>${esc(empName(e))}</h3><small>${esc([e.job_title, e.department, e.company, e.id_no].filter(Boolean).join(" • "))}</small></div>
      <div style="display:flex;gap:6px">${canEdit() ? `<button class="btn sm" id="pEdit">${esc(t("edit"))}</button>` : ""}<button class="btn ghost sm" id="pPrint">${esc(t("print"))}</button><button class="x" data-close>×</button></div></header>
    <div class="body">
      <div class="print-head"><img src="/logo-navy.png" alt=""><div class="t"><b>${esc(empName(e))}</b>${esc(settings()[L() === "en" ? "hotel_name_en" : "hotel_name_ar"])} • ${esc(fmtDate(new Date().toISOString()))}</div></div>
      <div class="tabs no-print">${["info", "docs", "deps", "ins", "plat"].map((k, i) => `<button data-tab="${k}" class="${i ? "" : "on"}">${esc({ info: t("details"), docs: t("p.documents"), deps: t("p.dependents"), ins: t("p.insurance"), plat: t("p.platforms") }[k])}${k === "docs" ? ` (${docs.length})` : k === "deps" ? ` (${deps.length})` : k === "ins" ? ` (${ins.length})` : ""}</button>`).join("")}</div>
      <div data-pane="info"><div class="kv">${kv}</div></div>
      <div data-pane="docs" class="hidden">
        ${canEdit() ? `<button class="btn sm no-print" id="pAddDoc" style="margin-bottom:10px">+ ${esc(t("doc.add"))}</button>` : ""}
        <div class="tbl compact"><table><thead><tr><th>${esc(t("doc.type"))}</th><th>${esc(t("doc.number"))}</th><th>${esc(t("doc.issue"))}</th><th>${esc(t("doc.expiry"))}</th><th class="num">${esc(t("doc.days"))}</th><th>${esc(t("doc.status"))}</th></tr></thead>
        <tbody>${docs.map((d) => `<tr class="click" data-doc="${d.id}"><td>${esc(docLabel(d.doc_type))}</td><td class="num">${esc(d.number || "")}</td><td class="num">${esc(fmtDate(d.issue_date))}</td><td class="num">${esc(fmtDate(d.s.expiry || d.expiry_date))}</td><td class="num">${daysCell(d.s.days)}</td><td>${stPill(d.s.status)}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">${esc(t("none"))}</td></tr>`}</tbody></table></div>
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
    `${canEdit() ? `<button class="btn" id="addDoc">+ ${esc(t("doc.add"))}</button>` : ""}<button class="btn ghost" onclick="print()">${esc(t("print"))}</button>`) + `<div class="card" id="tb"></div>`;
  $("#addDoc")?.addEventListener("click", () => openForm("documents", null, { title: t("doc.add") }));
  dataTable($("#tb"), {
    id: "docs", rows, exportName: t("p.documents"),
    cols: [
      { k: "owner", label: t("doc.owner"), get: (r) => empName(r.e), render: (r) => `<b>${esc(empName(r.e))}</b><br><small class="muted">${esc(r.e.id_no || "")}</small>` },
      { k: "where", label: `${f("department")} / ${f("company")}`, get: (r) => (r.e.kind === "labor" ? r.e.company : r.e.department) },
      { k: "type", label: t("doc.type"), get: (r) => docLabel(r.doc_type) },
      { k: "number", label: t("doc.number"), num: true },
      { k: "expiry", label: t("doc.expiry"), num: true, get: (r) => r.s.expiry || r.expiry_date },
      { k: "days", label: t("doc.days"), num: true, get: (r) => r.s.days, render: (r) => daysCell(r.s.days) },
      { k: "status", label: t("doc.status"), get: (r) => t("st." + r.s.status), render: (r) => stPill(r.s.status) },
      { k: "act", label: "", noExport: true, get: () => "", render: (r) => canEdit() ? `<button class="btn ghost sm" data-renew="${r.id}">${esc(t("doc.renew"))}</button>` : "" },
    ],
    filters: [{ k: "type", label: t("filter.type"), get: (r) => docLabel(r.doc_type) }, { k: "kind", label: `${t("p.employees")} / ${t("p.labor")}`, get: (r) => t(r.e.kind === "labor" ? "p.labor" : "p.employees") }],
    chipGet: (r) => t("st." + r.s.status),
    onRow: (r) => openForm("documents", D.documents.find((d) => d.id === r.id)),
    afterDraw: (root) => $$("[data-renew]", root).forEach((b) => b.addEventListener("click", () => renewDoc(+b.dataset.renew))),
  });
};

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
  const titles = groupRatio(staff, "job_title");
  const rows2 = (list) => list.map((g) => `<tr><td>${esc(g.key)}</td><td class="num">${g.total}</td><td class="num">${g.saudi}</td><td class="num">${g.non_saudi}</td>
    <td><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1"><i style="width:${g.pct.toFixed(0)}%;background:${target && g.pct < target ? "#e8892a" : ""}"></i></div><span class="num">${pct(g.pct)}</span></div></td>
    ${target ? `<td class="num">${saudisNeeded(g, target)}</td>` : ""}</tr>`).join("");
  const thead = `<tr><th></th><th class="num">${esc(t("total"))}</th><th class="num">${esc(t("k.saudi"))}</th><th class="num">${esc(t("k.nonsaudi"))}</th><th>${esc(t("k.ratio"))}</th>${target ? `<th class="num">${esc(t("s.need"))}</th>` : ""}</tr>`;

  $("#view").innerHTML = `
    ${head(t("p.saudization"), t("s.note"), `${FEATURES.ai ? `<button class="btn" id="aiSaud">✦ ${esc(t("s.ai"))}</button>` : ""}<button class="btn ghost" onclick="print()">${esc(t("print"))}</button>`)}
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
      <div class="tbl compact"><table><thead><tr><th></th><th>${esc(f("occupations").split("(")[0])}</th><th class="num">${esc(f("required_pct"))}</th><th class="num">${esc(t("s.covered"))}</th><th class="num">${esc(t("k.saudi"))}</th><th>${esc(t("k.ratio"))}</th><th></th><th>${esc(f("source"))}</th></tr></thead>
      <tbody>${D.saud_rules.map((rule) => { const c = ruleCoverage(rule, staff); const ok = rule.required_pct === null || c.pct >= Number(rule.required_pct); return `<tr class="click" data-rule="${rule.id}"><td><b>${esc(rule.name)}</b></td><td class="wrap">${esc(rule.occupations || "")}</td><td class="num">${rule.required_pct ?? ""}${rule.required_pct !== null ? "%" : ""}</td><td class="num">${c.total}</td><td class="num">${c.saudi}</td><td class="num">${c.total ? pct(c.pct) : "—"}</td><td>${c.total ? `<span class="pill ${ok ? "s-ok" : "s-expired"}">${esc(t(ok ? "s.compliant" : "s.below"))}</span>` : ""}</td><td class="wrap">${esc(rule.source || "")}</td></tr>`; }).join("") || `<tr><td colspan="8" class="empty">${esc(t("none"))}</td></tr>`}</tbody></table></div></div>
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
    ${head(t("p.recruitment"), "", `${canEdit() ? `<button class="btn" id="addApp">+ ${esc(t("r.app.add"))}</button><button class="btn ghost" id="addJob">+ ${esc(t("r.job.add"))}</button>` : ""}<button class="btn ghost" onclick="print()">${esc(t("print"))}</button>`)}
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
  $("#view").innerHTML = head(t("p." + key), opts.sub || "", `${canEdit() && !opts.noAdd ? `<button class="btn" id="addRow">+ ${esc(t("add"))}</button>` : ""}<button class="btn ghost" onclick="print()">${esc(t("print"))}</button>`) + `<div class="card" id="tb"></div>`;
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
PAGES.assistant = () => {
  $("#view").innerHTML = `${head(t("ai.title"), t("ai.privacy"))}
    <div class="card chat">
      ${FEATURES.ai ? "" : `<div class="note">${esc(t("ai.off"))}</div>`}
      <div class="log" id="log"></div>
      <div class="suggest">${["ai.s1", "ai.s2", "ai.s3", "ai.s4"].map((k) => `<button class="chip" data-s="${k}">${esc(t(k))}</button>`).join("")}</div>
      <form id="cf"><input class="input" id="cq" placeholder="${esc(t("ai.placeholder"))}" autocomplete="off" ${FEATURES.ai ? "" : "disabled"}><button class="btn" ${FEATURES.ai ? "" : "disabled"}>${esc(t("ai.send"))}</button></form>
    </div>`;
  const log = $("#log");
  const paint = () => {
    log.innerHTML = chatLog.map((m) => `<div class="bubble ${m.role === "user" ? "user" : "ai"}">${m.role === "user" ? esc(m.content) : md(m.content)}</div>`).join("") +
      (paint.busy ? `<div class="bubble ai muted"><span class="dots">${esc(t("ai.thinking"))}</span></div>` : "");
    log.scrollTop = log.scrollHeight;
  };
  const send = async (text) => {
    if (!text.trim() || paint.busy || !FEATURES.ai) return;
    chatLog.push({ role: "user", content: text.trim() });
    paint.busy = true; paint();
    try {
      const out = await api("/api/ai", { method: "POST", body: { mode: "chat", lang: L(), messages: chatLog } });
      chatLog.push({ role: "assistant", content: out.text || "—" });
    } catch (e) {
      chatLog.push({ role: "assistant", content: "⚠ " + e.message });
    }
    paint.busy = false; paint();
  };
  $("#cf").addEventListener("submit", (e) => { e.preventDefault(); const q = $("#cq").value; $("#cq").value = ""; send(q); });
  $$("[data-s]").forEach((b) => b.addEventListener("click", () => send(t(b.dataset.s))));
  paint();
};

// ================= IMPORT / EXPORT =================
PAGES.import = () => {
  const tables = [["employees", t("p.employees")], ["documents", t("p.documents")], ["dependents", t("p.dependents")], ["insurance", t("p.insurance")], ["tasks", t("p.tasks")], ["jobs", t("r.jobs")], ["applicants", t("r.applicants")]];
  $("#view").innerHTML = `${head(t("p.import"), "")}
    <div class="grid g2">
      <div class="card"><h3>${esc(t("i.title"))}</h3><p class="muted" style="margin-top:0">${esc(t("i.desc"))}</p>
        ${canEdit() ? `<label class="drop" id="drop"><input type="file" id="file" accept=".xlsx" hidden><div>⬆ ${esc(t("i.drop"))}</div></label><p class="msg" id="im"></p>` : `<p class="muted">${esc(t("no.permission"))}</p>`}</div>
      <div class="card"><h3>${esc(t("e.title"))}</h3><p class="muted" style="margin-top:0">${esc(t("e.desc"))}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${tables.map(([k, l]) => `<button class="btn ghost" data-x="${k}">⬇ ${esc(l)}</button>`).join("")}</div></div>
    </div>`;
  const up = async (file) => {
    if (!file) return;
    const im = $("#im");
    im.className = "msg"; im.textContent = t("loading");
    try {
      const out = await api("/api/import", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file });
      im.className = "msg ok";
      im.textContent = `${t("i.done")} ✔ — ` + Object.entries(out.stats).map(([k, v]) => `${k}: ${v}`).join(" • ");
      await reload(); renderNav();
    } catch (e) { im.className = "msg err"; im.textContent = e.message; }
  };
  const drop = $("#drop");
  if (drop) {
    $("#file").addEventListener("change", (e) => up(e.target.files[0]));
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); up(e.dataTransfer.files[0]); });
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
          <div><label class="fl">${esc(t("set.hotel"))} (AR)</label><input class="input" id="sHA" value="${esc(st.hotel_name_ar)}"></div>
          <div><label class="fl">${esc(t("set.hotel"))} (EN)</label><input class="input" id="sHE" value="${esc(st.hotel_name_en)}" dir="ltr"></div>
        </div></div>
      <div class="card"><h3>✉ ${esc(t("set.emails"))}</h3>
        ${FEATURES.email ? `<p class="muted" style="margin-top:0">${esc(t("set.daily"))}</p>` : `<div class="note">${esc(t("set.email.off"))}</div>`}
        <textarea class="input" id="sE" dir="ltr" placeholder="hr@example.com, manager@example.com">${esc(st.alert_emails || "")}</textarea>
        <div style="margin-top:10px"><button class="btn ghost" id="sTest" ${FEATURES.email ? "" : "disabled"}>${esc(t("set.test"))}</button> <span class="msg" id="sTm"></span></div></div>
    </div>
    <button class="btn" id="sSave">${esc(t("save"))}</button> <span class="msg" id="sm"></span>`;
  $("#sSave").addEventListener("click", async () => {
    try {
      await api("/api/settings", { method: "PUT", body: { iqama: $("#sI").value, contracts: $("#sC").value, docs: $("#sD").value, saudization_target: $("#sT").value, contract_autorenew: $("#sR").checked, alert_emails: $("#sE").value, hotel_name_ar: $("#sHA").value, hotel_name_en: $("#sHE").value } });
      toast(t("saved")); await refresh();
    } catch (e) { $("#sm").textContent = e.message; }
  });
  $("#sTest").addEventListener("click", async () => {
    const m = $("#sTm");
    try {
      await api("/api/settings", { method: "PUT", body: { alert_emails: $("#sE").value } });
      const out = await api("/api/alerts", { method: "POST" });
      m.className = "msg ok"; m.textContent = `✔ ${out.count} → ${out.to.join(", ")}`;
    } catch (e) { m.className = "msg err"; m.textContent = e.message; }
  });
};

PAGES.users = async () => {
  $("#view").innerHTML = `${head(t("p.users"), "", `<button class="btn" id="uAdd">+ ${esc(t("u.add"))}</button>`)}<div class="card" id="tb"><div class="empty">${esc(t("loading"))}</div></div>`;
  const draw = (users) => dataTable($("#tb"), {
    id: "users", rows: users.map((u) => ({ ...u, id: u.id })), exportName: t("p.users"),
    cols: [{ k: "id", label: t("u.id"), num: true }, { k: "name", label: t("u.name") }, { k: "role", label: t("u.role"), get: (u) => t("role." + u.role) }],
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
    <footer>${u && u.id !== ME.id ? `<button class="btn danger sm" id="udel" style="margin-inline-end:auto">${esc(t("delete"))}</button>` : ""}<button class="btn ghost" data-close>${esc(t("cancel"))}</button><button class="btn" id="us">${esc(t("save"))}</button></footer>`, "sm");
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
  $("#udel", m.root)?.addEventListener("click", async () => {
    if (!confirm(t("confirm.delete"))) return;
    try { draw((await api("/api/users", { method: "DELETE", body: { id: u.id } })).users); m.close(); } catch (e) { $("#ue", m.root).textContent = e.message; }
  });
}

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
      <div class="full"><label class="fl">${L() === "en" ? "New password (6+ characters)" : "كلمة المرور الجديدة (6 خانات على الأقل)"}</label><input class="input" type="password" id="pn" required minlength="6" dir="ltr" autocomplete="new-password"></div>
    </div><p class="msg" id="pm"></p></form>
    <footer><button class="btn ghost" data-close>${esc(t("cancel"))}</button><button class="btn" id="ps">${esc(t("save"))}</button></footer>`, "sm");
  $("#ps", m.root).addEventListener("click", async () => {
    try {
      await api("/api/password", { method: "POST", body: { current: $("#pc", m.root).value, next: $("#pn", m.root).value } });
      m.close(); toast(t("saved"));
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
  $("#menuBtn").onclick = () => $("#side").classList.toggle("open");
  $("#langBtn").onclick = () => { setLang(L() === "ar" ? "en" : "ar"); paintChrome(); renderNav(); route(); };
  $("#themeBtn").onclick = () => {
    const n = isDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", n);
    try { localStorage.setItem("hr_theme", n); } catch {}
    route();
  };
  $("#printBtn").onclick = () => window.print();
  window.addEventListener("hashchange", route);
  route();
})();
