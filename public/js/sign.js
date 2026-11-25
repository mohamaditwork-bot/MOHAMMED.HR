// Signer page: the manager rates + signs, then the employee reviews + signs.
import { renderDoc, sigPad, esc, SCALE, DECISIONS } from "./appraisal-doc.js";

const $ = (s, r = document) => r.querySelector(s);
const view = $("#sv");
const tok = new URLSearchParams(location.search).get("t") || "";

async function load() {
  const r = await fetch("/api/sign?token=" + encodeURIComponent(tok));
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return fail(d.error || "تعذر فتح الرابط");
  if (d.status === "completed" || (d.role === "manager" && d.status !== "manager")) return done(d);
  if (d.role === "employee" && d.status === "manager") return fail("التقييم لسا عند المدير المباشر — بيوصلك الرابط بعد ما يوقّع");
  d.role === "manager" ? managerForm(d) : employeeForm(d);
}

function fail(msg) {
  view.innerHTML = `<div class="card sign-msg"><div class="big">⚠️</div><h2>${esc(msg)}</h2></div>`;
}

function done(d, extra = "") {
  view.innerHTML = `${extra}<div class="no-print sign-tools"><button class="btn ghost" data-act="print">🖨 طباعة / حفظ PDF</button></div>${renderDoc(d)}`;
}

function info(d) {
  const e = d.employee;
  return `<div class="card sign-emp"><div><span>الموظف / Employee</span><b>${esc(e.name_ar)}</b>${e.name_en && e.name_en !== e.name_ar ? `<small>${esc(e.name_en)}</small>` : ""}</div>
    <div><span>المسمى / Position</span><b>${esc(e.job_title || "—")}</b></div>
    <div><span>القسم / Department</span><b>${esc(e.department || "—")}</b></div>
    <div><span>الفترة / Period</span><b>${esc(d.period || "—")}</b></div>${d.criteria_name ? `
    <div><span>النموذج / Form</span><b>${esc(d.criteria_name)}</b></div>` : ""}</div>`;
}

function sigBlock(label, name) {
  return `<div class="card"><h3>${label}</h3>
    <label class="lbl">الاسم / Name<input class="input" id="sname" value="${esc(name || "")}" required></label>
    <div class="sig-area"><canvas id="sig"></canvas><span class="sig-ph" id="sigph">وقّع هنا بإصبعك أو الماوس — Sign here</span></div>
    <div class="sign-row"><button class="btn ghost sm" type="button" id="sclear">مسح / Clear</button></div>
    <p class="msg err" id="serr"></p>
    <button class="btn big-btn" id="ssend">✍️ اعتماد وتوقيع / Sign &amp; submit</button></div>`;
}

function managerForm(d) {
  view.innerHTML = `${info(d)}
    <div class="card"><h3>قيّم الموظف (1 = ضعيف … 5 = ممتاز)</h3><p class="muted small" style="margin-top:0">Rate each criterion from 1 (weak) to 5 (excellent)</p>
      ${d.criteria.map((c, i) => `<div class="crit"><div class="crit-t"><b>${i + 1}. ${esc(c.ar)}</b><small>${esc(c.en)} • الوزن ${c.w}</small></div>
        <div class="rate" data-c="${c.id}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-v="${n}" title="${esc(SCALE[n])}">${n}<small>${esc(SCALE[n])}</small></button>`).join("")}</div></div>`).join("")}
      <div class="live" id="live">النتيجة: —</div></div>
    <div class="card"><h3>قرار تجديد العقد / Contract renewal</h3>
      <div class="decs">${Object.entries(DECISIONS).map(([k, [ar, en]]) => `<label class="dec ${k}"><input type="radio" name="dec" value="${k}"><b>${esc(ar)}</b><small>${esc(en)}</small></label>`).join("")}</div>
      <label class="lbl" id="noteL">السبب / الشروط (مطلوب لعدم التجديد أو التجديد المشروط)<textarea class="input" id="note" rows="2"></textarea></label>
      <label class="lbl">ملاحظات المدير / Comments<textarea class="input" id="cmt" rows="3"></textarea></label></div>
    ${sigBlock("توقيع المدير المباشر / Manager signature", d.manager_name)}`;
  const scores = {};
  const live = () => {
    let pts = 0, n = 0;
    for (const c of d.criteria) if (scores[c.id]) { pts += (c.w * scores[c.id]) / 5; n++; }
    const pct = Math.round((pts / d.max_total) * 1000) / 10;
    $("#live").textContent = n === d.criteria.length ? `النتيجة: ${pct}%  (${Math.round(pts * 10) / 10} / ${d.max_total})` : `قيّمت ${n} من ${d.criteria.length}`;
  };
  view.querySelectorAll(".rate").forEach((g) => g.addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    scores[g.dataset.c] = +b.dataset.v;
    g.querySelectorAll("button").forEach((x) => x.classList.toggle("on", +x.dataset.v <= +b.dataset.v));
    live();
  }));
  wireSign((body) => {
    const dec = view.querySelector('input[name="dec"]:checked');
    return { ...body, scores, decision: dec?.value, decision_note: $("#note").value, comment: $("#cmt").value };
  }, (out) => {
    const link = `${location.origin}/sign.html?t=${encodeURIComponent(out.employee_token)}`;
    const msg = `السلام عليكم، نرجو الاطلاع على تقييم الأداء وقرار تجديد العقد والتوقيع عليه عبر الرابط:\n${link}`;
    view.innerHTML = `<div class="card sign-msg"><div class="big">✅</div><h2>تم توقيع المدير بنجاح</h2>
      <p>الخطوة التالية: توقيع الموظف. أرسل له الرابط أو خله يوقّع الحين من نفس الجهاز.</p>
      <input class="input" readonly value="${esc(link)}" id="elink">
      <div class="sign-row center"><button class="btn" id="cp">📋 نسخ الرابط</button>
      <a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">واتساب</a>
      <a class="btn ghost" href="${esc(link)}">✍️ يوقّع الموظف الحين</a></div></div>`;
    $("#cp").onclick = () => { navigator.clipboard?.writeText(link); $("#cp").textContent = "✔ تم النسخ"; };
  });
}

function employeeForm(d) {
  view.innerHTML = `<div class="card sign-note">اطّلع على تقييمك وقرار تجديد العقد أدناه، ثم وقّع للعلم والاستلام. توقيعك يعني الاطلاع وليس بالضرورة الموافقة — تقدر تكتب ملاحظاتك.</div>
    ${renderDoc(d)}
    <div class="card"><label class="lbl">ملاحظات الموظف (اختياري) / Your comments<textarea class="input" id="cmt" rows="3"></textarea></label></div>
    ${sigBlock("توقيع الموظف / Employee signature", d.employee.name_ar)}`;
  wireSign((body) => ({ ...body, comment: $("#cmt").value }), async () => {
    const r = await fetch("/api/sign?token=" + encodeURIComponent(tok));
    done(await r.json(), `<div class="card sign-msg"><div class="big">✅</div><h2>شكرًا — تم التوقيع وحُفظ النموذج لدى الموارد البشرية</h2></div>`);
  });
}

function wireSign(build, after) {
  const pad = sigPad($("#sig"), (has) => { $("#sigph").style.display = has ? "none" : ""; });
  $("#sclear").onclick = () => pad.clear();
  $("#ssend").onclick = async () => {
    const err = $("#serr"); err.textContent = "";
    if (!$("#sname").value.trim()) return (err.textContent = "اكتب اسمك");
    if (pad.empty()) return (err.textContent = "التوقيع مطلوب — وقّع في المربع");
    const body = build({ token: tok, name: $("#sname").value.trim(), sig: pad.get() });
    $("#ssend").disabled = true;
    try {
      const r = await fetch("/api/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "خطأ");
      window.scrollTo(0, 0);
      await after(d);
    } catch (e) { err.textContent = e.message; $("#ssend").disabled = false; }
  };
}

load().catch((e) => fail(e.message));

document.addEventListener("click", (e) => { if (e.target.closest('[data-act="print"]')) window.print(); });
