// Shared printable appraisal document (HR app + signer page).
export const GRADES = {
  excellent: ["ممتاز", "Excellent"], very_good: ["جيد جدًا", "Very good"], good: ["جيد", "Good"],
  acceptable: ["مقبول", "Acceptable"], weak: ["ضعيف", "Weak"],
};
export const DECISIONS = {
  renew: ["تجديد العقد", "Renew contract"], renew_conditional: ["تجديد مشروط", "Conditional renewal"], not_renew: ["عدم التجديد", "Do not renew"],
};
export const STATUS = {
  manager: ["بانتظار المدير", "Waiting for manager"], employee: ["بانتظار الموظف", "Waiting for employee"], completed: ["مكتمل ✔", "Completed ✔"],
};
export const SCALE = ["", "ضعيف", "مقبول", "جيد", "جيد جدًا", "ممتاز"];

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dt = (v) => (v ? new Date(v).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—");
const bi = (pair) => (pair ? `${esc(pair[0])} <small>${esc(pair[1])}</small>` : "—");

export function renderDoc(v) {
  const e = v.employee || {};
  const pts = (c) => {
    const s = Number(v.scores?.[c.id]);
    return s ? Math.round(((c.w * s) / 5) * 10) / 10 : "";
  };
  const totalPts = v.criteria.reduce((a, c) => a + (Number(pts(c)) || 0), 0);
  const sigBox = (title, sig, name, at) => `<div class="ad-sig"><div class="ad-sig-t">${title}</div>
    ${sig ? `<img src="${esc(sig)}" alt="signature">` : `<div class="ad-sig-empty">—</div>`}
    <div><b>${esc(name || "")}</b></div><div class="small muted">${esc(dt(at))}</div></div>`;
  return `<div class="report-doc appraisal-doc">
    <div class="report-head"><img src="/logo-navy.png" alt="Novotel"><div><b>نموذج تقييم الأداء وتجديد العقد</b><span>Performance Appraisal &amp; Contract Renewal</span></div>
      <div class="rmeta">${v.id ? `رقم النموذج: AP-${esc(v.id)}<br>` : ""}الفترة / Period: <b>${esc(v.period || "—")}</b></div></div>
    <table class="rtable ad-info"><tbody>
      <tr><th>اسم الموظف / Employee</th><td>${esc(e.name_ar || "")}${e.name_en && e.name_en !== e.name_ar ? `<br><small>${esc(e.name_en)}</small>` : ""}</td><th>الرقم الوظيفي / Emp. No</th><td>${esc(e.emp_no || "—")}</td></tr>
      <tr><th>المسمى / Position</th><td>${esc(e.job_title || "—")}</td><th>القسم / Department</th><td>${esc(e.department || "—")}</td></tr>
      <tr><th>تاريخ الالتحاق / Joined</th><td>${esc(e.join_date || "—")}</td><th>المدير المباشر / Manager</th><td>${esc(v.manager_name || "—")}${v.manager_title ? `<br><small>${esc(v.manager_title)}</small>` : ""}</td></tr>
    </tbody></table>
    <h3 class="rsec">معايير التقييم / Criteria</h3>
    <table class="rtable"><thead><tr><th>#</th><th>المعيار / Criterion</th><th>الوزن</th><th>التقدير (1-5)</th><th>النقاط</th></tr></thead><tbody>
      ${v.criteria.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.ar)}<br><small class="muted">${esc(c.en)}</small></td><td>${c.w}</td><td>${v.scores?.[c.id] ? `${v.scores[c.id]} — ${esc(SCALE[v.scores[c.id]])}` : "—"}</td><td>${pts(c)}</td></tr>`).join("")}
    </tbody><tfoot><tr><td colspan="4">المجموع / Total</td><td>${v.scores ? `${Math.round(totalPts * 10) / 10} / ${v.max_total}` : "—"}</td></tr></tfoot></table>
    <div class="rsum ad-result">
      <div><span>النسبة / Score</span><b>${v.total != null ? esc(v.total) + "%" : "—"}</b></div>
      <div><span>التقدير / Rating</span><b>${bi(GRADES[v.grade])}</b></div>
      <div class="ad-dec ${esc(v.decision || "")}"><span>قرار العقد / Contract decision</span><b>${bi(DECISIONS[v.decision])}</b></div>
    </div>
    ${v.decision_note ? `<p><b>السبب / الشروط:</b> ${esc(v.decision_note)}</p>` : ""}
    ${v.manager_comment ? `<p><b>ملاحظات المدير:</b> ${esc(v.manager_comment)}</p>` : ""}
    ${v.employee_comment ? `<p><b>ملاحظات الموظف:</b> ${esc(v.employee_comment)}</p>` : ""}
    <div class="ad-sigs">
      ${sigBox("توقيع المدير المباشر / Manager", v.manager_sig, v.manager_name, v.manager_signed_at)}
      ${sigBox("توقيع الموظف / Employee", v.employee_sig, v.employee_sig ? e.name_ar : "", v.employee_signed_at)}
      <div class="ad-sig"><div class="ad-sig-t">اعتماد الموارد البشرية / HR</div><div class="ad-sig-empty"></div><div>&nbsp;</div></div>
    </div>
    <p class="small muted" style="margin-top:14px">تم التوقيع إلكترونيًا عبر منصة الموارد البشرية — نوفوتيل المدينة المنورة. Electronically signed.</p>
  </div>`;
}

// Minimal signature pad: draw with finger/mouse; returns { get(), clear(), empty() }.
export function sigPad(canvas, onChange) {
  const ctx = canvas.getContext("2d");
  let drawing = false, last = null, dirty = false;
  const fit = () => {
    const r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * d); canvas.height = Math.round(r.height * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#14143a";
    dirty = false; onChange && onChange(false);
  };
  requestAnimationFrame(fit);
  const pos = (ev) => { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  canvas.addEventListener("pointerdown", (ev) => { ev.preventDefault(); canvas.setPointerCapture(ev.pointerId); drawing = true; last = pos(ev); ctx.beginPath(); ctx.arc(last.x, last.y, 1, 0, 7); ctx.fillStyle = "#14143a"; ctx.fill(); });
  canvas.addEventListener("pointermove", (ev) => {
    if (!drawing) return; ev.preventDefault();
    const p = pos(ev);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p;
    if (!dirty) { dirty = true; onChange && onChange(true); }
  });
  const end = () => { drawing = false; };
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
  canvas.style.touchAction = "none";
  return {
    empty: () => !dirty,
    clear: fit,
    get: () => {
      const max = 500, w = canvas.width, h = canvas.height, k = Math.min(1, max / w);
      const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
      return c.toDataURL("image/png");
    },
  };
}
