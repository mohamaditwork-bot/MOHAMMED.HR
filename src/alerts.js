// Email alerts for documents that are expired or close to expiry (sent with Resend).
import { DOC_TYPES, buildAlerts } from "../public/js/logic.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function emailConfigured(env) {
  return Boolean(env.RESEND_API_KEY);
}

// The ONLY address the site may ever email: the owner's (set by the admin in Settings).
export const EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;
export function ownerEmail(settings) {
  const e = String(settings.owner_email || "").trim().toLowerCase();
  return EMAIL_RE.test(e) ? e : null;
}

// Single exit point for every email. Refuses anything that is not exactly one
// message to the owner's address — employees and anyone else can never receive mail.
export async function sendMail(env, settings, { to, subject, html }) {
  const owner = ownerEmail(settings);
  const list = (Array.isArray(to) ? to : [to]).map((x) => String(x || "").trim().toLowerCase());
  if (!owner) return { sent: false, reason: "لم يتم تحديد بريدك في الإعدادات" };
  if (list.length !== 1 || list[0] !== owner) {
    console.error("BLOCKED email to non-owner address", list);
    return { sent: false, reason: "مرفوض: الموقع يرسل لبريد المدير فقط" };
  }
  if (!emailConfigured(env)) return { sent: false, reason: "مفتاح البريد (Resend) غير مضاف" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.ALERT_FROM || "HR Novotel <onboarding@resend.dev>", to: [owner], subject, html }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return { sent: false, reason: body.message || `Resend error ${r.status}` };
  return { sent: true, to: [owner] };
}

export function alertEmailHtml(alerts, settings, siteUrl) {
  const expired = alerts.filter((a) => a.status === "expired");
  const near = alerts.filter((a) => a.status === "near");
  const row = (a) => `<tr>
    <td style="padding:8px;border-bottom:1px solid #e3e4ec">${esc(a.employee.name_ar)}</td>
    <td style="padding:8px;border-bottom:1px solid #e3e4ec">${esc(a.employee.kind === "labor" ? a.employee.company : a.employee.department)}</td>
    <td style="padding:8px;border-bottom:1px solid #e3e4ec">${esc(DOC_TYPES[a.doc.doc_type]?.ar || a.doc.doc_type)}</td>
    <td style="padding:8px;border-bottom:1px solid #e3e4ec;direction:ltr;text-align:right">${esc(a.expiry)}</td>
    <td style="padding:8px;border-bottom:1px solid #e3e4ec;color:${a.days < 0 ? "#c0392b" : "#b9650a"};font-weight:700;direction:ltr;text-align:right">${a.days}</td>
  </tr>`;
  const table = (title, list, color) =>
    list.length
      ? `<h3 style="color:${color};margin:24px 0 8px">${title} (${list.length})</h3>
         <table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="background:#f4f5f9;color:#23234f">
         <th style="padding:8px;text-align:right">الاسم</th><th style="padding:8px;text-align:right">القسم / الشركة</th>
         <th style="padding:8px;text-align:right">الوثيقة</th><th style="padding:8px;text-align:right">تاريخ الانتهاء</th>
         <th style="padding:8px;text-align:right">المتبقي (يوم)</th></tr></thead><tbody>${list.map(row).join("")}</tbody></table>`
      : "";
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f4f5f9;font-family:Tahoma,Arial,sans-serif;color:#1c1c2e">
  <div style="max-width:760px;margin:0 auto;padding:24px">
    <div style="background:#23234f;color:#fff;border-radius:12px 12px 0 0;padding:18px 22px">
      <div style="font-size:20px;font-weight:700">NOVOTEL</div>
      <div style="font-size:13px;opacity:.85">${esc(settings.hotel_name_ar)} — الموارد البشرية</div>
    </div>
    <div style="background:#fff;border-radius:0 0 12px 12px;padding:20px 22px">
      <p style="margin-top:0">تنبيه يومي بالوثائق المنتهية والقريبة من الانتهاء:</p>
      ${table("منتهية", expired, "#c0392b")}
      ${table("قريبة الانتهاء", near, "#b9650a")}
      ${siteUrl ? `<p style="margin-top:24px"><a href="${esc(siteUrl)}" style="background:#23234f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">فتح لوحة الموارد البشرية</a></p>` : ""}
      <p style="color:#6b6d80;font-size:12px;margin-top:24px">رسالة آلية من لوحة الموارد البشرية.</p>
    </div>
  </div></body></html>`;
}

export async function sendAlertEmail(env, settings, data, { force = false } = {}) {
  const owner = ownerEmail(settings);
  if (!owner) return { sent: false, reason: "لم يتم تحديد بريدك في الإعدادات" };
  const today = new Date().toISOString().slice(0, 10);
  const docs = data.documents.filter((d) => !(d.doc_type === "exit_reentry" && d.expiry_date && String(d.expiry_date).slice(0, 10) < today));
  const alerts = buildAlerts(data.employees, docs, settings);
  if (!alerts.length && !force) return { sent: false, reason: "nothing to report", count: 0 };
  const expired = alerts.filter((a) => a.status === "expired").length;
  const subject = `تنبيه الوثائق — ${expired} منتهية، ${alerts.length - expired} قريبة الانتهاء`;
  const out = await sendMail(env, settings, { to: owner, subject, html: alertEmailHtml(alerts, settings, env.SITE_URL) });
  return { ...out, count: alerts.length };
}
