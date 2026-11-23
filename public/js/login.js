// Login page: password → (new strong password) → (2FA setup with QR + backup codes) → 2FA code.
import { t, getLang, setLang } from "/js/i18n.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const post = async (url, body) => {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Error");
  return d;
};
const card = $("#f");
const head = `<img class="logo" src="/logo-navy.png" alt="Novotel"><h1>${esc(t("app"))}</h1>`;
const tools = () => `<div class="login-tools"><button type="button" class="btn ghost sm" id="outBtn">${esc(t("lg.out"))}</button></div>`;
const bindOut = () => { $("#outBtn")?.addEventListener("click", async () => { await fetch("/api/logout", { method: "POST" }); location.replace("/"); }); };

function paintStatic() {
  document.querySelectorAll("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t)));
  const lb = $("#langBtn"); if (lb) lb.textContent = t("lang");
  document.title = t("login.title") + " — " + t("app");
}

function go(stage) {
  if (stage === "pw") return stepPassword();
  if (stage === "setup") return stepSetup();
  if (stage === "2fa") return stepCode();
  location.replace("/app.html");
}

function stepPassword() {
  card.innerHTML = `${head}<p class="sub">🔒 ${esc(t("lg.pw.title"))}</p><p class="muted small">${esc(t("lg.pw.why"))}</p>
    <div class="field"><label class="fl">${esc(t("lg.pw.cur"))}</label><input class="input" id="c0" type="password" autocomplete="current-password" required dir="ltr"></div>
    <div class="field"><label class="fl">${esc(t("lg.pw.new"))}</label><input class="input" id="c1" type="password" autocomplete="new-password" required dir="ltr"><div class="pw-meter"><i id="pm"></i></div></div>
    <div class="field"><label class="fl">${esc(t("lg.pw.rep"))}</label><input class="input" id="c2" type="password" autocomplete="new-password" required dir="ltr"></div>
    <ul class="pw-rules small muted"><li>${esc(t("lg.r1"))}</li><li>${esc(t("lg.r2"))}</li><li>${esc(t("lg.r3"))}</li></ul>
    <button class="btn" style="width:100%;padding:12px" type="submit">${esc(t("save"))}</button><p class="msg err" id="msg"></p>${tools()}`;
  bindOut();
  $("#c1").addEventListener("input", () => {
    const v = $("#c1").value; let s = 0;
    if (v.length >= 10) s++; if (/[A-Za-z؀-ۿ]/.test(v) && /\d/.test(v)) s++; if (/[^A-Za-z0-9؀-ۿ]/.test(v)) s++; if (v.length >= 14) s++;
    $("#pm").style.width = `${s * 25}%`; $("#pm").className = s >= 3 ? "ok" : s >= 2 ? "mid" : "";
  });
  card.onsubmit = async (e) => {
    e.preventDefault(); $("#msg").textContent = "";
    if ($("#c1").value !== $("#c2").value) return ($("#msg").textContent = t("lg.pw.mismatch"));
    try { const d = await post("/api/password", { current: $("#c0").value, next: $("#c1").value }); go(d.next); } catch (er) { $("#msg").textContent = er.message; }
  };
}

async function stepSetup() {
  card.innerHTML = `${head}<p class="sub">📱 ${esc(t("lg.2fa.title"))}</p>
    <ol class="setup-steps small"><li>${t("lg.2fa.s1")}</li><li>${esc(t("lg.2fa.s2"))}</li><li>${esc(t("lg.2fa.s3"))}</li></ol>
    <div class="qr" id="qr">…</div><p class="small muted" style="text-align:center">${esc(t("lg.2fa.manual"))}<br><code id="sec" dir="ltr"></code></p>
    <div class="field"><input class="input code-in" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" required dir="ltr"></div>
    <button class="btn" style="width:100%;padding:12px" type="submit">${esc(t("lg.2fa.enable"))}</button><p class="msg err" id="msg"></p>${tools()}`;
  bindOut();
  try {
    const r = await fetch("/api/twofa"); const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Error");
    const qr = window.qrcode(0, "M"); qr.addData(d.url); qr.make();
    $("#qr").innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
    $("#sec").textContent = d.secret.replace(/(.{4})/g, "$1 ").trim();
  } catch (er) { $("#msg").textContent = er.message; }
  card.onsubmit = async (e) => {
    e.preventDefault(); $("#msg").textContent = "";
    try { const d = await post("/api/twofa", { action: "confirm", code: $("#code").value }); showBackup(d.backup_codes); } catch (er) { $("#msg").textContent = er.message; }
  };
}

function showBackup(codes) {
  card.innerHTML = `${head}<p class="sub">✅ ${esc(t("lg.2fa.done"))}</p><p class="small">${esc(t("lg.bk.why"))}</p>
    <div class="bk-codes" dir="ltr">${codes.map((c) => `<code>${esc(c)}</code>`).join("")}</div>
    <div style="display:flex;gap:8px;margin:10px 0"><button type="button" class="btn ghost sm" id="bkCopy">⧉ ${esc(t("lg.bk.copy"))}</button><button type="button" class="btn ghost sm" id="bkPrint">🖨 ${esc(t("print"))}</button></div>
    <label class="small"><input type="checkbox" id="bkOk"> ${esc(t("lg.bk.saved"))}</label>
    <button class="btn" style="width:100%;padding:12px;margin-top:10px" type="submit" id="bkGo" disabled>${esc(t("lg.enter"))}</button>`;
  $("#bkCopy").onclick = () => navigator.clipboard?.writeText(codes.join("\n"));
  $("#bkPrint").onclick = () => window.print();
  $("#bkOk").onchange = () => ($("#bkGo").disabled = !$("#bkOk").checked);
  card.onsubmit = (e) => { e.preventDefault(); location.replace("/app.html"); };
}

function stepCode() {
  card.innerHTML = `${head}<p class="sub">🔐 ${esc(t("lg.code.title"))}</p><p class="small muted">${esc(t("lg.code.help"))}</p>
    <div class="field"><input class="input code-in" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="9" placeholder="••••••" required dir="ltr" autofocus></div>
    <button class="btn" style="width:100%;padding:12px" type="submit">${esc(t("lg.code.go"))}</button><p class="msg err" id="msg"></p>
    <p class="small muted">${esc(t("lg.code.backup"))}</p>${tools()}`;
  bindOut();
  $("#code").focus();
  card.onsubmit = async (e) => {
    e.preventDefault(); $("#msg").textContent = "";
    try { const d = await post("/api/twofa", { action: "verify", code: $("#code").value.trim() }); if (d.backup_left !== undefined && d.backup_left < 3) alert(t("lg.bk.low").replace("{n}", d.backup_left)); location.replace("/app.html"); } catch (er) { $("#msg").textContent = er.message; }
  };
}

// ---- first screen: ID + password ----
paintStatic();
$("#langBtn").onclick = () => { setLang(getLang() === "ar" ? "en" : "ar"); paintStatic(); };
$("#themeBtn").onclick = () => {
  const n = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", n);
  try { localStorage.setItem("hr_theme", n); } catch {}
};
if (new URLSearchParams(location.search).has("idle")) $("#msg").textContent = t("login.idle");
fetch("/api/me").then(async (r) => { if (r.ok) { const d = await r.json(); go(d.stage || "full"); } });
card.onsubmit = async (e) => {
  e.preventDefault();
  const btn = $("#go"); $("#msg").textContent = ""; btn.disabled = true;
  try { const d = await post("/api/login", { id: $("#uid").value.trim(), password: $("#pw").value }); go(d.next); }
  catch (er) { $("#msg").textContent = er.message; btn.disabled = false; }
};
