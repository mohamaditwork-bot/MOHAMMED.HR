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
    <div class="report-head"><img src="/logo-navy.png" alt="Novotel"><div><b>نموذج تقييم الأداء وتجديد العقد</b><span>Performance Appraisal &amp; Contract Renewal${v.criteria_name ? ` — ${esc(v.criteria_name)}` : ""}</span></div>
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
      ${sigBox("اعتماد الموارد البشرية / HR", v.hr_sig, v.hr_name, v.hr_signed_at)}
    </div>
    <p class="small muted" style="margin-top:14px">تم التوقيع إلكترونيًا عبر منصة الموارد البشرية — نوفوتيل المدينة المنورة. Electronically signed.</p>
    ${renewalNotice(v)}
  </div>`;
}

// Second page: the hotel's «إشعار تجديد عقد العمل / Contract Renewal Notification», filled from the appraisal.
export function renewalNotice(v) {
  const e = v.employee || {};
  const ymd = (x) => (x ? String(x).slice(0, 10).split("-").reverse().join("/") : "………");
  const day = (x) => (x ? new Date(x).toLocaleDateString("en-GB") : "");
  const rec = v.decision ? v.decision !== "not_renew" : null;
  const wish = v.employee_wish || null;
  const box = (on) => `<span class="rn-box${on ? " on" : ""}">${on ? "✓" : ""}</span>`;
  const sig = (s) => (s ? `<img src="${esc(s)}" alt="signature">` : "");
  const end = ymd(v.contract?.end);
  const mc = [v.decision === "renew_conditional" && v.decision_note ? `(تجديد مشروط / Conditional) ${v.decision_note}` : v.decision_note, v.manager_comment].filter(Boolean).join(" — ");
  const line = (t) => (t ? esc(t) : "………………………………………………");
  const signRow = (en, ar, name, s, at, title = "") => `<tr><td colspan="2"><div class="rn-signl">
      <div><span>${en} / <bdi>${ar}</bdi>:</span> <b><bdi>${esc(name || "")}</bdi>${name && title ? ` — <bdi>${esc(title)}</bdi>` : ""}</b></div>
      <div class="rn-sig"><span>Signature / <bdi>التوقيع</bdi>:</span>${sig(s)}</div>
      <div><span>Date / <bdi>التاريخ</bdi>:</span> <b>${day(at)}</b></div></div></td></tr>`;
  return `<div class="rn-page">
    <div class="rn-head"><img src="/logo-navy.png" alt="Novotel"><h2>CONTRACT RENEWAL NOTIFICATION</h2><h3>إشعار تجديد عقد العمل</h3></div>
    <table class="rn"><tbody>
      <tr class="rn-sec"><th dir="ltr">EMPLOYEE DETAILS</th><th dir="rtl">بيانات الموظف</th></tr>
      <tr><td dir="ltr"><b>Employee Name:</b> ${esc(e.name_en || e.name_ar || "")}<br><b>Employee ID:</b> ${esc(e.emp_no || "—")}<br><b>Department:</b> ${esc(e.department || "—")}<br><b>Position:</b> ${esc(e.job_title || "—")}<br><b>Contract Start Date:</b> ${ymd(v.contract?.start)}<br><b>Contract End Date:</b> <mark>${end}</mark></td>
        <td dir="rtl"><b>اسم الموظف:</b> ${esc(e.name_ar || "")}<br><b>الرقم الوظيفي:</b> ${esc(e.emp_no || "—")}<br><b>القسم:</b> ${esc(e.department || "—")}<br><b>المسمى الوظيفي:</b> ${esc(e.job_title || "—")}<br><b>تاريخ بداية العقد:</b> ${ymd(v.contract?.start)}<br><b>تاريخ انتهاء العقد:</b> <mark>${end}</mark></td></tr>
      <tr class="rn-sec"><th dir="ltr">DEPARTMENT HEAD RECOMMENDATION</th><th dir="rtl">توصية مدير القسم</th></tr>
      <tr><td dir="ltr">${box(rec === true)} Renewal recommended<br>${box(rec === false)} Renewal not recommended<br><b>Manager Comments:</b> ${line(mc)}</td>
        <td dir="rtl">${box(rec === true)} يوصى بالتجديد<br>${box(rec === false)} لا يوصى بالتجديد<br><b>ملاحظات المدير:</b> ${line(mc)}</td></tr>
      ${signRow("Manager", "المدير", v.manager_name, v.manager_sig, v.manager_signed_at, v.manager_title)}
      <tr class="rn-sec"><th dir="ltr">Dear Employee,</th><th dir="rtl">عزيزي الموظف / عزيزتي الموظفة،</th></tr>
      <tr><td dir="ltr">This is to formally notify you that your current employment contract is scheduled to expire on <mark>${end}</mark>.<br>Please confirm your intention regarding the renewal of your employment contract by selecting one of the options below:<br>${box(wish === "renew")} <b>I wish to renew my employment contract.</b><br>${box(wish === "not_renew")} <b>I do not wish to renew my employment contract.</b><br><b>Employee Comments (if any):</b> ${line(v.employee_comment)}</td>
        <td dir="rtl">نود إشعارك رسميًا بأن عقد عملك الحالي ينتهي بتاريخ <mark>${end}</mark>.<br>يرجى تأكيد رغبتك بشأن تجديد عقد العمل من خلال اختيار أحد الخيارين أدناه:<br>${box(wish === "renew")} <b>أرغب في تجديد عقد عملي.</b><br>${box(wish === "not_renew")} <b>لا أرغب في تجديد عقد عملي.</b><br><b>ملاحظات الموظف (إن وجدت):</b> ${line(v.employee_comment)}</td></tr>
      <tr class="rn-sec"><th dir="ltr">EMPLOYEE ACKNOWLEDGMENT</th><th dir="rtl">إقرار الموظف</th></tr>
      ${signRow("Employee Name", "اسم الموظف", v.employee_sig ? e.name_ar : "", v.employee_sig, v.employee_signed_at)}
      <tr class="rn-sec"><th dir="ltr">PEOPLE &amp; CULTURE USE</th><th dir="rtl">خاص بإدارة الموارد البشرية</th></tr>
      ${signRow("People &amp; Culture Manager", "مدير الموارد البشرية", v.hr_name, v.hr_sig, v.hr_signed_at)}
    </tbody></table></div>`;
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
  // A photo of a signature on paper: keep the ink only (dark pixels), drop the background.
  const load = (file) => new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type || "")) return reject(new Error("bad image"));
    const rd = new FileReader();
    rd.onerror = () => reject(new Error("bad image"));
    rd.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("bad image"));
      img.onload = () => {
        fit();
        const r = canvas.getBoundingClientRect();
        const k = Math.min(r.width / img.width, r.height / img.height) * 0.92;
        const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
        const off = document.createElement("canvas"); off.width = w; off.height = h;
        const o = off.getContext("2d"); o.drawImage(img, 0, 0, w, h);
        const px = o.getImageData(0, 0, w, h), d = px.data;
        const lum = (i) => { const a = d[i + 3] / 255; return (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) * a + 255 * (1 - a); };
        let sum = 0; for (let i = 0; i < d.length; i += 4) sum += lum(i);
        const thr = Math.min(170, (sum / (d.length / 4)) * 0.78);
        for (let i = 0; i < d.length; i += 4) { if (lum(i) < thr) { d[i] = 20; d[i + 1] = 20; d[i + 2] = 58; d[i + 3] = 255; } else d[i + 3] = 0; }
        o.putImageData(px, 0, 0);
        ctx.drawImage(off, (r.width - w) / 2, (r.height - h) / 2, w, h);
        dirty = true; onChange && onChange(true);
        resolve(true);
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  });
  return {
    empty: () => !dirty,
    clear: fit,
    load,
    get: () => {
      const max = 500, w = canvas.width, h = canvas.height, k = Math.min(1, max / w);
      const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
      return c.toDataURL("image/png");
    },
  };
}
