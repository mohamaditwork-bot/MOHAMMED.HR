"use strict";

// ================= helpers =================
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const fmtDate = (v) => (typeof v === "string" && ISO.test(v) ? v.split("-").reverse().join("-") : v);
const fmtNum = (n) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 + "%" : "—");
const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();

const ST = { EXP: "منتهي", NEAR: "قريب الانتهاء", OK: "ساري", NONE: "بدون تاريخ" };
const stClass = (s) => ({ [ST.EXP]: "s-exp", [ST.NEAR]: "s-near", [ST.OK]: "s-ok", [ST.NONE]: "s-none" }[s] || "");

const today = (() => {
  const d = new Date();
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
})();
const todayStr = new Date(today).toISOString().slice(0, 10);
const daysUntil = (iso) => Math.round((Date.parse(iso + "T00:00:00Z") - today) / 864e5);
const addYear = (iso) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

async function api(path, opts = {}) {
  const r = await fetch(path, opts);
  if (r.status === 401) {
    location.replace("/");
    throw new Error("401");
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "خطأ"), { status: r.status });
  return d;
}

// ================= state =================
let ME = null;
let DATA = null;
const S = {}; // sheets by name
const tableState = {}; // per-sheet search/filter/sort

const NAV_GROUPS = [
  ["الموظفين الدائمين", ["بيانات الموظفين", "العقود", "إقامات الموظفين", "جوازات الموظفين", "رخص العمل", "صحية الموظفين", "التابعين", "الخروج والعودة", "مطابقة المنصات", "بدون تاريخ"]],
  ["التأمين الطبي", ["التأمين الطبي", "تعديلات التأمين"]],
  ["عمالة الشركات", ["بيانات العمالة", "إقامات العمالة", "أجير العمالة", "صحية العمالة"]],
];
const EMP_DOCS = ["إقامات الموظفين", "جوازات الموظفين", "رخص العمل", "صحية الموظفين", "التابعين", "الخروج والعودة"];
const LAB_DOCS = ["إقامات العمالة", "أجير العمالة", "صحية العمالة"];

const col = (s, ...names) => {
  if (!s) return -1;
  for (const n of names) {
    const i = s.headers.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
};
const idCol = (s) => s.headers.findIndex((h) => h.includes("رقم الهوية") || h === "رقم الإقامة");

// ================= data preparation =================
// Recompute "المتبقي (يوم)" and "الحالة" from today's date, like the Excel file does.
function prepare() {
  const set = DATA.meta.settings || { iqama: 40, contracts: 80, docs: 30 };
  for (const s of DATA.sheets) {
    S[s.name] = s;
    const d = s.headers.indexOf("المتبقي (يوم)");
    const st = s.headers.indexOf("الحالة");
    if (d < 1 || st < 0) continue;
    s.expCol = d - 1;
    s.daysCol = d;
    s.statusCol = st;
    s.thr = s.name.includes("إقامات") ? set.iqama : s.name === "العقود" ? set.contracts : set.docs;
    const roll = s.name === "العقود"; // contracts renew automatically every year
    for (const r of s.rows) {
      let exp = r[s.expCol];
      if (typeof exp !== "string" || !ISO.test(exp)) {
        r[s.daysCol] = null;
        r[s.statusCol] = ST.NONE;
        continue;
      }
      if (roll) {
        let guard = 0;
        while (daysUntil(exp) < 0 && guard++ < 50) exp = addYear(exp);
        r[s.expCol] = exp;
      }
      const days = daysUntil(exp);
      r[s.daysCol] = days;
      r[s.statusCol] = days < 0 ? ST.EXP : days <= s.thr ? ST.NEAR : ST.OK;
    }
  }
  // Mirror recomputed contract dates/status into the employee sheet.
  const emp = S["بيانات الموظفين"], con = S["العقود"];
  if (emp && con) {
    const ci = idCol(con), ei = idCol(emp);
    const map = new Map(con.rows.map((r) => [String(r[ci]), r]));
    const eExp = col(emp, "انتهاء العقد"), eSt = col(emp, "حالة العقد");
    for (const r of emp.rows) {
      const c = map.get(String(r[ei]));
      if (!c) continue;
      if (eExp >= 0) r[eExp] = c[con.expCol];
      if (eSt >= 0) r[eSt] = c[con.statusCol];
    }
  }
}

function statusCounts(s) {
  const c = { [ST.EXP]: 0, [ST.NEAR]: 0, [ST.OK]: 0, [ST.NONE]: 0 };
  if (!s || s.statusCol === undefined) return c;
  for (const r of s.rows) c[r[s.statusCol]] = (c[r[s.statusCol]] || 0) + 1;
  return c;
}

// ================= navigation =================
function renderNav() {
  const cnt = (name) => {
    const s = S[name];
    if (!s) return "";
    const c = statusCounts(s);
    const alert = c[ST.EXP] + c[ST.NEAR];
    return alert && s.statusCol !== undefined
      ? `<span class="cnt alert" title="منتهي أو قريب">${alert}</span>`
      : `<span class="cnt">${s.rows.length}</span>`;
  };
  let h = `<a href="#dash" data-k="dash">لوحة الإحصائيات</a>`;
  const listed = new Set();
  for (const [g, names] of NAV_GROUPS) {
    const present = names.filter((n) => S[n]);
    if (!present.length) continue;
    h += `<div class="nav-group">${esc(g)}</div>`;
    for (const n of present) {
      listed.add(n);
      h += `<a href="#s/${encodeURIComponent(n)}" data-k="s/${esc(n)}">${esc(n)}${cnt(n)}</a>`;
    }
  }
  const others = (DATA?.sheets || []).filter((s) => !listed.has(s.name));
  if (others.length) {
    h += `<div class="nav-group">صفحات أخرى</div>`;
    for (const s of others) h += `<a href="#s/${encodeURIComponent(s.name)}" data-k="s/${esc(s.name)}">${esc(s.name)}${cnt(s.name)}</a>`;
  }
  if (ME.role === "admin") h += `<div class="nav-group">الإدارة</div><a href="#admin" data-k="admin">رفع البيانات والمستخدمين</a>`;
  $("#nav").innerHTML = h;
  $("#me").innerHTML = `<b>${esc(ME.name)}</b><span style="color:#a9a9cc">${ME.role === "admin" ? "مدير النظام" : "مستخدم"}</span>
    <div class="links"><button id="pwBtn">تغيير كلمة المرور</button><button id="outBtn">خروج</button></div>`;
  $("#pwBtn").onclick = openPassword;
  $("#outBtn").onclick = async () => {
    await fetch("/api/logout", { method: "POST" });
    location.replace("/");
  };
}

function route() {
  const h = decodeURIComponent(location.hash.slice(1) || "dash");
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.k === h));
  $("#side").classList.remove("open");
  window.scrollTo(0, 0);
  if (h === "admin" && ME.role === "admin") return viewAdmin();
  if (!DATA) return viewNoData();
  if (h.startsWith("s/") && S[h.slice(2)]) return viewSheet(S[h.slice(2)]);
  return viewDashboard();
}

function setTitle(t, sub) {
  $("#pageTitle").textContent = t;
  $("#pageSub").textContent = sub || "";
  document.title = t + " — الموارد البشرية";
}

// ================= dashboard =================
function viewDashboard() {
  const m = DATA.meta;
  setTitle(m.title || "لوحة الإحصائيات", `${m.subtitle || ""}  •  اليوم ${fmtDate(todayStr)}`);
  const emp = S["بيانات الموظفين"], lab = S["بيانات العمالة"], con = S["العقود"];
  const total = emp ? emp.rows.length : 0;
  const natI = col(emp, "الجنسية");
  const saudi = emp ? emp.rows.filter((r) => r[natI] === "سعودي").length : 0;
  const cc = statusCounts(con);
  let empExp = 0, empNear = 0;
  for (const n of EMP_DOCS) {
    const c = statusCounts(S[n]);
    empExp += c[ST.EXP];
    empNear += c[ST.NEAR];
  }
  const labN = lab ? lab.rows.length : 0;
  const coI = col(lab, "الشركة");
  const companies = lab ? new Set(lab.rows.map((r) => r[coI]).filter(Boolean)).size : 0;
  const li = statusCounts(S["إقامات العمالة"]), la = statusCounts(S["أجير العمالة"]), lh = statusCounts(S["صحية العمالة"]);
  const set = m.settings;

  const kpi = (l, v, hint, cls = "", go = "") =>
    `<div class="kpi ${cls} ${go ? "click" : ""}" ${go ? `data-go="${esc(go)}"` : ""}><div class="l">${esc(l)}</div><div class="v">${v}</div><div class="h">${esc(hint)}</div></div>`;

  let h = `<div class="kpis">
    ${kpi("الموظفين الدائمين", total, "ميسان", "", "s/بيانات الموظفين")}
    ${kpi("سعوديين", saudi, "", "green")}
    ${kpi("نسبة السعودة", pct(saudi, total), "من الموظفين الدائمين")}
    ${kpi("وافدين", total - saudi, "")}
    ${kpi("عقود تنتهي قريبًا", cc[ST.NEAR] + cc[ST.EXP], `خلال ${set.contracts} يوم`, "orange", "s/العقود|" + ST.NEAR)}
    ${kpi("وثائق موظفين منتهية", empExp, "إقامة • جواز • رخصة • شهادة • تابعين • خروج وعودة", "red")}
    ${kpi("وثائق موظفين قريبة", empNear, `الإقامة ${set.iqama} يوم • الباقي ${set.docs}`, "orange")}
    ${kpi("بدون تاريخ", S["بدون تاريخ"] ? S["بدون تاريخ"].rows.length : 0, "موظفين + عمالة", "", "s/بدون تاريخ")}
  </div>
  <div class="kpis">
    ${kpi("عمالة الشركات", labN, "", "", "s/بيانات العمالة")}
    ${kpi("الشركات المشغلة", companies, "")}
    ${kpi("إجمالي القوى العاملة", total + labN, "موظفين + عمالة")}
    ${kpi("إقامات عمالة منتهية", li[ST.EXP], "", "red", "s/إقامات العمالة|" + ST.EXP)}
    ${kpi("إقامات عمالة قريبة", li[ST.NEAR], `خلال ${set.iqama} يوم`, "orange", "s/إقامات العمالة|" + ST.NEAR)}
    ${kpi("أجير قريب/منتهي", la[ST.EXP] + la[ST.NEAR], "", "orange", "s/أجير العمالة")}
    ${kpi("شهادات عمالة منتهية/قريبة", lh[ST.EXP] + lh[ST.NEAR], "", "orange", "s/صحية العمالة")}
    ${kpi("عمالة بدون شهادة", lh[ST.NONE], "", "", "s/صحية العمالة|" + ST.NONE)}
  </div>`;

  // urgent list
  const urgent = [];
  for (const n of ["العقود", ...EMP_DOCS, ...LAB_DOCS]) {
    const s = S[n];
    if (!s || s.statusCol === undefined) continue;
    const ni = col(s, "الاسم"), ii = idCol(s);
    for (const r of s.rows)
      if (r[s.statusCol] === ST.EXP || r[s.statusCol] === ST.NEAR)
        urgent.push({ doc: n, name: r[ni], id: r[ii], exp: r[s.expCol], days: r[s.daysCol], st: r[s.statusCol] });
  }
  urgent.sort((a, b) => a.days - b.days);

  const docTable = (title, names) => {
    let rows = "", t = [0, 0, 0, 0, 0];
    for (const n of names) {
      const s = S[n];
      if (!s) continue;
      const c = statusCounts(s);
      const v = [c[ST.EXP], c[ST.NEAR], c[ST.OK], c[ST.NONE], s.rows.length];
      v.forEach((x, i) => (t[i] += x));
      rows += `<tr class="clickable" data-go="s/${esc(n)}"><td>${esc(n)}</td>
        <td class="num ${v[0] ? "days-exp" : ""}">${v[0]}</td><td class="num ${v[1] ? "days-near" : ""}">${v[1]}</td>
        <td class="num">${v[2]}</td><td class="num">${v[3]}</td><td class="num">${v[4]}</td><td class="num">${s.thr}</td></tr>`;
    }
    return `<div class="panel"><h3>${esc(title)}</h3><div class="tbl-wrap"><table class="compact">
      <thead><tr><th>الوثيقة</th><th>منتهي</th><th>قريب</th><th>ساري</th><th>بدون تاريخ</th><th>الإجمالي</th><th>تنبيه (يوم)</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
  };

  h += `<div class="grid2">
    ${docTable("وثائق الموظفين الدائمين", ["العقود", ...EMP_DOCS])}
    ${docTable("وثائق عمالة الشركات", LAB_DOCS)}
  </div>`;

  h += `<div class="panel" style="margin-bottom:16px"><h3>تنبيهات عاجلة — منتهي وقريب الانتهاء (${urgent.length})</h3>
    ${urgent.length ? `<div class="tbl-wrap" style="max-height:420px"><table class="compact"><thead><tr><th>الوثيقة</th><th>الاسم</th><th>رقم الهوية / الإقامة</th><th>تاريخ الانتهاء</th><th>المتبقي (يوم)</th><th>الحالة</th></tr></thead><tbody>
    ${urgent.map((u) => `<tr class="clickable" data-id="${esc(u.id)}"><td>${esc(u.doc)}</td><td>${esc(u.name)}</td><td class="num">${esc(u.id)}</td><td class="num">${esc(fmtDate(u.exp))}</td>
      <td class="num ${u.days < 0 ? "days-exp" : "days-near"}">${u.days}</td><td><span class="pill ${stClass(u.st)}">${esc(u.st)}</span></td></tr>`).join("")}
    </tbody></table></div>` : `<div class="empty">لا توجد تنبيهات 🎉</div>`}</div>`;

  // by sector
  if (emp) {
    const secI = col(emp, "القطاع"), eid = idCol(emp), insI = col(emp, "التأمينات");
    const conMap = new Map();
    if (con) for (const r of con.rows) conMap.set(String(r[idCol(con)]), r[con.statusCol]);
    const g = new Map();
    for (const r of emp.rows) {
      const k = r[secI] || "غير محدد";
      const o = g.get(k) || { n: 0, sa: 0, near: 0, ins: 0 };
      o.n++;
      if (r[natI] === "سعودي") o.sa++;
      const cs = conMap.get(String(r[eid]));
      if (cs === ST.NEAR || cs === ST.EXP) o.near++;
      if (r[insI] === "✖") o.ins++;
      g.set(k, o);
    }
    const arr = [...g.entries()].sort((a, b) => b[1].n - a[1].n);
    const T = arr.reduce((t, [, o]) => ({ n: t.n + o.n, sa: t.sa + o.sa, near: t.near + o.near, ins: t.ins + o.ins }), { n: 0, sa: 0, near: 0, ins: 0 });
    const row = (k, o, tag = "td") => `<tr><${tag}>${esc(k)}</${tag}><td class="num">${o.n}</td><td class="num">${o.sa}</td><td class="num">${o.n - o.sa}</td><td class="num">${pct(o.sa, o.n)}</td><td class="num">${o.near}</td><td class="num ${o.ins ? "days-exp" : ""}">${o.ins}</td></tr>`;
    h += `<div class="grid2"><div class="panel"><h3>الموظفين حسب القطاع</h3><div class="tbl-wrap"><table class="compact">
      <thead><tr><th>القطاع</th><th>العدد</th><th>سعوديين</th><th>وافدين</th><th>السعودة</th><th>عقود تنتهي قريبًا</th><th>التأمينات ✖</th></tr></thead>
      <tbody>${arr.map(([k, o]) => row(k, o)).join("")}</tbody><tfoot>${row("الإجمالي", T)}</tfoot></table></div></div>`;

    // labor by company
    if (lab) {
      const lid = idCol(lab);
      const st = (n) => {
        const s = S[n], m2 = new Map();
        if (s) for (const r of s.rows) m2.set(String(r[idCol(s)]), r[s.statusCol]);
        return m2;
      };
      const mi = st("إقامات العمالة"), ma = st("أجير العمالة"), mh = st("صحية العمالة");
      const bad = (v) => v === ST.EXP || v === ST.NEAR;
      const cg = new Map();
      for (const r of lab.rows) {
        const k = r[coI] || "غير محدد", id = String(r[lid]);
        const o = cg.get(k) || { n: 0, ie: 0, in: 0, aj: 0, he: 0, hn: 0 };
        o.n++;
        if (mi.get(id) === ST.EXP) o.ie++;
        if (mi.get(id) === ST.NEAR) o.in++;
        if (bad(ma.get(id))) o.aj++;
        if (bad(mh.get(id))) o.he++;
        if (mh.get(id) === ST.NONE) o.hn++;
        cg.set(k, o);
      }
      const ca = [...cg.entries()].sort((a, b) => b[1].n - a[1].n);
      const CT = ca.reduce((t, [, o]) => { for (const k in o) t[k] = (t[k] || 0) + o[k]; return t; }, {});
      const crow = (k, o, tag = "td") => `<tr><${tag}>${esc(k)}</${tag}><td class="num">${o.n}</td><td class="num ${o.ie ? "days-exp" : ""}">${o.ie}</td><td class="num ${o.in ? "days-near" : ""}">${o.in}</td><td class="num ${o.aj ? "days-near" : ""}">${o.aj}</td><td class="num">${o.he}</td><td class="num">${o.hn}</td></tr>`;
      h += `<div class="panel"><h3>العمالة حسب الشركة المشغلة</h3><div class="tbl-wrap"><table class="compact">
        <thead><tr><th>الشركة</th><th>العمال</th><th>إقامة منتهية</th><th>إقامة قريبة</th><th>أجير قريب/منتهي</th><th>شهادة منتهية/قريبة</th><th>بدون شهادة</th></tr></thead>
        <tbody>${ca.map(([k, o]) => crow(k, o)).join("")}</tbody><tfoot>${crow("الإجمالي", CT)}</tfoot></table></div></div>`;
    }
    h += `</div>`;
  }

  // platforms + insurance
  const plat = S["مطابقة المنصات"], ins = S["التأمين الطبي"], adj = S["تعديلات التأمين"];
  h += `<div class="grid2">`;
  if (plat) {
    const ri = col(plat, "النتيجة"), ti = col(plat, "التأمينات");
    const ok = plat.rows.filter((r) => r[ri] === "مطابق").length;
    const gosi = plat.rows.filter((r) => r[ti] === "✔").length;
    h += `<div class="panel"><h3>مطابقة المنصات (قوى • التأمينات • مقيم • رخص العمل)</h3><div class="kpis" style="margin:0">
      ${kpi("مطابقين في كل المنصات", ok, "", "green", "s/مطابقة المنصات|مطابق")}
      ${kpi("يحتاجون مراجعة", plat.rows.length - ok, "", "orange", "s/مطابقة المنصات|يحتاج مراجعة")}
      ${kpi("مسجلين في التأمينات", gosi, "")}
      ${kpi("غير مسجلين في التأمينات", plat.rows.filter((r) => r[ti] === "✖").length, "", "red")}
    </div></div>`;
  }
  if (ins) {
    const ri = col(ins, "الصلة");
    const empIns = ins.rows.filter((r) => r[ri] === "الموظف").length;
    const ai = col(adj, "الإجراء");
    const c = (w) => (adj ? adj.rows.filter((r) => String(r[ai] || "").includes(w)).length : 0);
    h += `<div class="panel"><h3>التأمين الطبي</h3><div class="kpis" style="margin:0">
      ${kpi("موظفين مؤمن عليهم", empIns, "", "", "s/التأمين الطبي")}
      ${kpi("تابعين مؤمن عليهم", ins.rows.length - empIns, "")}
      ${kpi("مطلوب حذفهم (مغادرين)", c("حذف"), "", "red", "s/تعديلات التأمين|حذف من التأمين")}
      ${kpi("مطلوب إضافتهم", c("إضافة"), "", "orange", "s/تعديلات التأمين|إضافة للتأمين")}
    </div></div>`;
  }
  h += `</div>`;
  const up = m.uploadedAt ? `آخر رفع: ${new Date(m.uploadedAt).toLocaleString("ar-SA-u-ca-gregory-nu-latn")} بواسطة ${m.uploadedBy || ""}` : "";
  h += `<p class="foot" style="color:var(--muted);font-size:12px">${esc(m.updated || "")}${up ? "  •  " + esc(up) : ""}  •  الألوان: أحمر = منتهي • برتقالي = قريب الانتهاء • أخضر = ساري</p>`;

  $("#view").innerHTML = h;
  bindGo($("#view"));
}

function bindGo(root) {
  root.querySelectorAll("[data-go]").forEach((el) =>
    el.addEventListener("click", () => {
      const [target, filter] = el.dataset.go.split("|");
      if (filter && target.startsWith("s/")) {
        const name = target.slice(2);
        tableState[name] = { ...(tableState[name] || {}), chip: filter, q: "" };
      }
      location.hash = target;
    })
  );
  root.querySelectorAll("[data-id]").forEach((el) => el.addEventListener("click", () => openProfile(el.dataset.id)));
}

// ================= generic sheet view =================
const CHIP_COLS = ["الحالة", "النتيجة", "الإجراء", "الصلة"];
const FILTER_COLS = ["القسم", "الشركة", "القطاع", "الفئة"];

function viewSheet(s) {
  setTitle(s.title || s.name, s.subtitle);
  const st = (tableState[s.name] = tableState[s.name] || { q: "", chip: "", sel: "", sort: null });
  const chipCol = CHIP_COLS.map((c) => s.headers.indexOf(c)).find((i) => i >= 0) ?? -1;
  const selCol = FILTER_COLS.map((c) => s.headers.indexOf(c)).find((i) => i >= 0) ?? -1;
  const chipVals = chipCol >= 0 ? [...new Set(s.rows.map((r) => r[chipCol]).filter((v) => v !== null))] : [];
  const selVals = selCol >= 0 ? [...new Set(s.rows.map((r) => r[selCol]).filter((v) => v !== null))].sort() : [];
  const ii = idCol(s);
  const profileable = ii >= 0;

  $("#view").innerHTML = `
    ${s.thr ? `<div class="note">المتبقي والحالة محسوبة تلقائيًا من تاريخ اليوم (${fmtDate(todayStr)}) — التنبيه قبل الانتهاء بـ ${s.thr} يوم${s.name === "العقود" ? " • العقد يتجدد تلقائيًا كل سنة" : ""}</div>` : ""}
    ${chipVals.length > 1 && chipVals.length <= 8 ? `<div class="chips" id="chips"><button class="chip" data-v="">الكل <b>${s.rows.length}</b></button>${chipVals
      .map((v) => `<button class="chip" data-v="${esc(v)}">${esc(v)} <b>${s.rows.filter((r) => r[chipCol] === v).length}</b></button>`)
      .join("")}</div>` : ""}
    <div class="toolbar">
      <input class="input" id="q" placeholder="بحث في الصفحة..." value="${esc(st.q)}">
      ${selVals.length > 1 ? `<select class="input" id="sel"><option value="">كل ${esc(s.headers[selCol])}</option>${selVals.map((v) => `<option ${v === st.sel ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>` : ""}
      <button class="btn ghost small" id="csv">تصدير CSV</button>
      <button class="btn ghost small" onclick="print()">طباعة</button>
      <span class="count" id="count"></span>
    </div>
    <div class="tbl-wrap"><table><thead><tr>${s.headers
      .map((h, i) => `<th data-i="${i}">${esc(h)} <span class="ar">${st.sort && st.sort.i === i ? (st.sort.dir > 0 ? "▲" : "▼") : ""}</span></th>`)
      .join("")}</tr></thead><tbody id="tb"></tbody></table></div>`;

  const filtered = () => {
    const q = norm(st.q);
    let rows = s.rows.filter(
      (r) =>
        (!st.chip || chipCol < 0 || r[chipCol] === st.chip) &&
        (!st.sel || selCol < 0 || r[selCol] === st.sel) &&
        (!q || r.some((v) => norm(fmtDate(v)).includes(q)))
    );
    if (st.sort) {
      const { i, dir } = st.sort;
      rows = [...rows].sort((a, b) => {
        const x = a[i], y = b[i];
        if (x === null) return 1;
        if (y === null) return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ar")) * dir;
      });
    }
    return rows;
  };

  const cell = (v, i) => {
    if (v === null || v === undefined) return "<td></td>";
    if (i === s.statusCol || (chipCol === i && stClass(v))) return `<td><span class="pill ${stClass(v)}">${esc(v)}</span></td>`;
    if (i === s.daysCol) return `<td class="num ${v < 0 ? "days-exp" : v <= s.thr ? "days-near" : ""}">${v}</td>`;
    if (v === "✔") return `<td class="mark-ok">✔</td>`;
    if (v === "✖") return `<td class="mark-no">✖</td>`;
    if (v === "؟") return `<td class="mark-q">؟</td>`;
    if (v === "مطابق") return `<td><span class="pill s-ok">${v}</span></td>`;
    if (v === "يحتاج مراجعة") return `<td><span class="pill s-near">${v}</span></td>`;
    if (typeof v === "number") return `<td class="num">${fmtNum(v)}</td>`;
    if (ISO.test(v)) return `<td class="num">${fmtDate(v)}</td>`;
    return `<td>${esc(v)}</td>`;
  };

  const draw = () => {
    const rows = filtered();
    $("#tb").innerHTML = rows.length
      ? rows.map((r) => `<tr ${profileable ? `class="clickable" data-id="${esc(r[ii])}"` : ""}>${r.map(cell).join("")}</tr>`).join("")
      : `<tr><td colspan="${s.headers.length}" class="empty">لا توجد نتائج</td></tr>`;
    $("#count").textContent = `${rows.length} من ${s.rows.length}`;
    document.querySelectorAll("#chips .chip").forEach((c) => c.classList.toggle("on", c.dataset.v === st.chip));
    if (profileable) $("#tb").querySelectorAll("[data-id]").forEach((el) => el.addEventListener("click", () => openProfile(el.dataset.id)));
  };

  $("#q").addEventListener("input", (e) => { st.q = e.target.value; draw(); });
  $("#sel")?.addEventListener("change", (e) => { st.sel = e.target.value; draw(); });
  document.querySelectorAll("#chips .chip").forEach((c) => c.addEventListener("click", () => { st.chip = c.dataset.v; draw(); }));
  document.querySelectorAll("th[data-i]").forEach((th) =>
    th.addEventListener("click", () => {
      const i = +th.dataset.i;
      st.sort = st.sort && st.sort.i === i ? (st.sort.dir > 0 ? { i, dir: -1 } : null) : { i, dir: 1 };
      viewSheet(s);
    })
  );
  $("#csv").addEventListener("click", () => {
    const q = (v) => `"${String(fmtDate(v) ?? "").replace(/"/g, '""')}"`;
    const csv = [s.headers, ...filtered()].map((r) => r.map(q).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${s.name}-${todayStr}.csv`;
    a.click();
  });
  draw();
}

// ================= person profile =================
function findPerson(id) {
  id = String(id);
  for (const n of ["بيانات الموظفين", "بيانات العمالة"]) {
    const s = S[n];
    if (!s) continue;
    const r = s.rows.find((x) => String(x[idCol(s)]) === id);
    if (r) return { s, r };
  }
  // fall back to any sheet
  for (const s of DATA.sheets) {
    const i = idCol(s);
    if (i < 0) continue;
    const r = s.rows.find((x) => String(x[i]) === id);
    if (r) return { s, r };
  }
  return null;
}

function openProfile(id) {
  const p = findPerson(id);
  if (!p) return;
  const { s, r } = p;
  const name = r[col(s, "الاسم بالعربي", "الاسم", "اسم المؤمن عليه")] || id;
  const sub = [r[col(s, "الاسم بالإنجليزي")], r[col(s, "المسمى الوظيفي")], r[col(s, "القسم")], r[col(s, "الشركة")]].filter(Boolean).join(" • ");

  // documents across all sheets with an expiry
  const docs = [];
  for (const d of DATA.sheets) {
    if (d.statusCol === undefined) continue;
    const i = idCol(d);
    for (const x of d.rows) if (String(x[i]) === String(id)) docs.push({ n: d.name, exp: x[d.expCol], days: x[d.daysCol], st: x[d.statusCol] });
  }
  const nd = S["بدون تاريخ"];
  if (nd) for (const x of nd.rows) if (String(x[idCol(nd)]) === String(id)) docs.push({ n: x[col(nd, "الوثيقة")], exp: null, days: null, st: ST.NONE, note: x[col(nd, "السبب / الإجراء")] });

  const ins = S["التأمين الطبي"];
  const insRows = ins ? ins.rows.filter((x) => String(x[idCol(ins)]) === String(id) || (x[col(ins, "الموظف")] && x[col(ins, "الموظف")] === name)) : [];
  const dep = S["التابعين"];
  const deps = dep ? dep.rows.filter((x) => x[col(dep, "رب الأسرة")] === name) : [];

  const kv = s.headers
    .map((h, i) => (i === 0 || r[i] === null ? "" : `<div><span>${esc(h)}</span><b dir="auto">${esc(typeof r[i] === "number" ? fmtNum(r[i]) : fmtDate(r[i]))}</b></div>`))
    .join("");

  modal(
    `<header><div><h3>${esc(name)}</h3><small>${esc(sub)}</small></div><button class="x" data-close>×</button></header>
    <div class="body">
      ${docs.length ? `<div class="section-title" style="margin-top:0">الوثائق</div><div class="tbl-wrap"><table class="compact"><thead><tr><th>الوثيقة</th><th>تاريخ الانتهاء</th><th>المتبقي (يوم)</th><th>الحالة</th></tr></thead><tbody>
        ${docs.map((d) => `<tr><td>${esc(d.n)}</td><td class="num">${esc(fmtDate(d.exp) ?? "")}${d.note ? `<div style="white-space:normal;color:var(--muted);font-size:12px">${esc(d.note)}</div>` : ""}</td><td class="num ${d.days < 0 ? "days-exp" : d.st === ST.NEAR ? "days-near" : ""}">${d.days ?? ""}</td><td><span class="pill ${stClass(d.st)}">${esc(d.st)}</span></td></tr>`).join("")}
      </tbody></table></div>` : ""}
      <div class="section-title">البيانات (${esc(s.name)})</div>
      <div class="kv">${kv}</div>
      ${insRows.length ? `<div class="section-title">التأمين الطبي (${insRows.length})</div><div class="tbl-wrap"><table class="compact"><thead><tr><th>الاسم</th><th>الصلة</th><th>الفئة</th><th>رقم العضوية</th></tr></thead><tbody>
        ${insRows.map((x) => `<tr><td>${esc(x[col(ins, "اسم المؤمن عليه")])}</td><td>${esc(x[col(ins, "الصلة")])}</td><td>${esc(x[col(ins, "الفئة")])}</td><td class="num">${esc(x[col(ins, "رقم العضوية")])}</td></tr>`).join("")}
      </tbody></table></div>` : ""}
      ${deps.length ? `<div class="section-title">التابعين (${deps.length})</div><div class="tbl-wrap"><table class="compact"><thead><tr><th>الاسم</th><th>رقم الإقامة</th><th>الصلة</th><th>انتهاء الجواز</th><th>الحالة</th></tr></thead><tbody>
        ${deps.map((x) => `<tr><td>${esc(x[1])}</td><td class="num">${esc(x[2])}</td><td>${esc(x[3])}</td><td class="num">${esc(fmtDate(x[dep.expCol]))}</td><td><span class="pill ${stClass(x[dep.statusCol])}">${esc(x[dep.statusCol])}</span></td></tr>`).join("")}
      </tbody></table></div>` : ""}
    </div>`
  );
}

// ================= global search =================
function setupSearch() {
  const q = $("#gq"), res = $("#gres");
  const run = () => {
    const t = norm(q.value);
    if (!DATA || t.length < 2) return res.classList.add("hidden");
    const out = [];
    for (const n of ["بيانات الموظفين", "بيانات العمالة"]) {
      const s = S[n];
      if (!s) continue;
      const ii = idCol(s), en = col(s, "الرقم الوظيفي"), a = col(s, "الاسم بالعربي", "الاسم"), e = col(s, "الاسم بالإنجليزي");
      for (const r of s.rows) {
        if ([r[ii], r[en], r[a], r[e]].some((v) => v !== null && norm(v).includes(t))) out.push({ id: r[ii], name: r[a], sub: `${n === "بيانات العمالة" ? "عامل" : "موظف"} • ${r[ii]} • ${r[col(s, "القسم")] || ""}` });
        if (out.length >= 25) break;
      }
    }
    res.innerHTML = out.length
      ? out.map((o) => `<button data-id="${esc(o.id)}">${esc(o.name)}<small>${esc(o.sub)}</small></button>`).join("")
      : `<div style="padding:10px;color:var(--muted)">لا توجد نتائج</div>`;
    res.classList.remove("hidden");
    res.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        res.classList.add("hidden");
        q.value = "";
        openProfile(b.dataset.id);
      })
    );
  };
  q.addEventListener("input", run);
  q.addEventListener("focus", run);
  document.addEventListener("click", (e) => { if (!e.target.closest(".gsearch")) res.classList.add("hidden"); });
}

// ================= modal =================
function modal(html) {
  const root = $("#modalRoot");
  root.innerHTML = `<div class="modal-bg"><div class="modal" role="dialog">${html}</div></div>`;
  const close = () => (root.innerHTML = "");
  root.querySelector(".modal-bg").addEventListener("click", (e) => { if (e.target.classList.contains("modal-bg") || e.target.hasAttribute("data-close")) close(); });
  document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", k); } });
  return { root, close };
}

function openPassword() {
  const m = modal(`<header><h3>تغيير كلمة المرور</h3><button class="x" data-close>×</button></header>
    <form class="body" id="pwf">
      <div class="field"><label>كلمة المرور الحالية</label><input type="password" id="pc" required autocomplete="current-password" dir="ltr"></div>
      <div class="field"><label>كلمة المرور الجديدة (6 خانات على الأقل)</label><input type="password" id="pn" required minlength="6" autocomplete="new-password" dir="ltr"></div>
      <button class="btn">حفظ</button><p class="msg" id="pm"></p></form>`);
  $("#pwf", m.root).addEventListener("submit", async (e) => {
    e.preventDefault();
    const pm = $("#pm", m.root);
    try {
      await api("/api/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ current: $("#pc").value, next: $("#pn").value }) });
      pm.className = "msg ok"; pm.textContent = "تم تغيير كلمة المرور";
      setTimeout(m.close, 1200);
    } catch (err) { pm.className = "msg err"; pm.textContent = err.message; }
  });
}

// ================= admin =================
async function viewAdmin() {
  setTitle("الإدارة", "رفع ملف الإكسل وإدارة المستخدمين");
  const m = DATA?.meta;
  $("#view").innerHTML = `
    <div class="grid2">
      <div class="panel"><h3>رفع ملف البيانات</h3>
        <p style="color:var(--muted);font-size:13px;margin-top:0">ارفع ملف الإكسل المحدّث (xlsx) — يستبدل البيانات الحالية لكل المستخدمين.</p>
        <label class="drop" id="drop"><input type="file" id="file" accept=".xlsx" hidden><div>اسحب الملف هنا أو <u>اختر ملف</u></div></label>
        <p class="msg" id="um"></p>
        ${m ? `<div style="font-size:13px;color:var(--muted)">البيانات الحالية: ${esc(m.fileName || "")} ${m.uploadedAt ? "• " + esc(new Date(m.uploadedAt).toLocaleString("ar-SA-u-ca-gregory-nu-latn")) : ""} • ${DATA.sheets.length} صفحة</div>` : ""}
      </div>
      <div class="panel"><h3>إضافة / تعديل مستخدم</h3>
        <form id="uf">
          <div class="form-row">
            <div class="field"><label>رقم الهوية (اسم المستخدم)</label><input class="input" id="uid" inputmode="numeric" required dir="ltr"></div>
            <div class="field"><label>الاسم</label><input class="input" id="uname" required></div>
          </div>
          <div class="form-row" style="margin-top:10px">
            <div class="field"><label>كلمة المرور (اتركها فاضية لعدم التغيير)</label><input class="input" id="upw" dir="ltr" autocomplete="new-password"></div>
            <div class="field"><label>الصلاحية</label><select class="input" id="urole"><option value="viewer">مستخدم (عرض)</option><option value="admin">مدير</option></select></div>
          </div>
          <button class="btn" style="margin-top:12px">حفظ المستخدم</button><p class="msg" id="ufm"></p>
        </form>
      </div>
    </div>
    <div class="panel"><h3>المستخدمين</h3><div id="ulist" class="empty">جاري التحميل...</div></div>`;

  const um = $("#um");
  const upload = async (file) => {
    if (!file) return;
    um.className = "msg"; um.textContent = "جاري الرفع والتحليل...";
    try {
      const r = await api("/api/upload", { method: "POST", headers: { "content-type": "application/octet-stream", "x-file-name": encodeURIComponent(file.name) }, body: file });
      um.className = "msg ok";
      um.textContent = `تم ✔ — ${r.sheets.length} صفحة: ${r.sheets.map((s) => `${s.name} (${s.rows})`).join("، ")}`;
      await loadData();
      renderNav();
    } catch (e) { um.className = "msg err"; um.textContent = e.message; }
  };
  const drop = $("#drop");
  $("#file").addEventListener("change", (e) => upload(e.target.files[0]));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); upload(e.dataTransfer.files[0]); });

  const drawUsers = (users) => {
    $("#ulist").className = "";
    $("#ulist").innerHTML = `<div class="tbl-wrap"><table class="compact"><thead><tr><th>رقم الهوية</th><th>الاسم</th><th>الصلاحية</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr><td class="num">${esc(u.id)}</td><td>${esc(u.name)}</td><td>${u.role === "admin" ? "مدير" : "مستخدم"}</td>
        <td><button class="btn ghost small" data-edit="${esc(u.id)}">تعديل</button> ${u.id === ME.id ? "" : `<button class="btn danger small" data-del="${esc(u.id)}">حذف</button>`}</td></tr>`).join("")}
      </tbody></table></div>`;
    $("#ulist").querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
      const u = users.find((x) => x.id === b.dataset.edit);
      $("#uid").value = u.id; $("#uname").value = u.name; $("#urole").value = u.role; $("#upw").value = "";
      $("#uname").focus();
    }));
    $("#ulist").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("حذف المستخدم " + b.dataset.del + "؟")) return;
      try { drawUsers((await api("/api/users", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: b.dataset.del }) })).users); }
      catch (e) { alert(e.message); }
    }));
  };
  $("#uid").addEventListener("change", () => {
    const p = findPersonSafe($("#uid").value.trim());
    if (p && !$("#uname").value) $("#uname").value = p;
  });
  $("#uf").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fm = $("#ufm");
    try {
      const body = { id: $("#uid").value.trim(), name: $("#uname").value.trim(), role: $("#urole").value };
      if ($("#upw").value) body.password = $("#upw").value;
      drawUsers((await api("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).users);
      fm.className = "msg ok"; fm.textContent = "تم الحفظ";
      e.target.reset();
    } catch (err) { fm.className = "msg err"; fm.textContent = err.message; }
  });
  try { drawUsers((await api("/api/users")).users); } catch (e) { $("#ulist").textContent = e.message; }
}

function findPersonSafe(id) {
  if (!DATA || !id) return null;
  const p = findPerson(id);
  return p ? p.r[col(p.s, "الاسم بالعربي", "الاسم")] : null;
}

function viewNoData() {
  setTitle("لوحة الإحصائيات", "");
  $("#view").innerHTML = `<div class="panel empty">لا توجد بيانات بعد.${ME.role === "admin" ? ` <a href="#admin">ارفع ملف الإكسل من صفحة الإدارة</a>` : " يرجى التواصل مع مدير النظام."}</div>`;
}

// ================= boot =================
async function loadData() {
  try {
    DATA = await api("/api/data");
    prepare();
  } catch (e) {
    if (e.status !== 404) throw e;
    DATA = null;
  }
}

(async () => {
  try {
    ME = (await api("/api/me")).user;
    await loadData();
  } catch (e) {
    if (e.message !== "401") $("#view").innerHTML = `<div class="panel empty">تعذر تحميل البيانات: ${esc(e.message)}</div>`;
    return;
  }
  renderNav();
  setupSearch();
  $("#menuBtn").onclick = () => $("#side").classList.toggle("open");
  window.addEventListener("hashchange", route);
  route();
})();
