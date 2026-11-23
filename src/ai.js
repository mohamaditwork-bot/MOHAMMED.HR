// AI assistant backed by Claude. The server builds a compact, privacy-reduced
// summary of the HR data (no IBANs, phones, emails, addresses or birth dates)
// and sends it with the user's question.
import Anthropic from "@anthropic-ai/sdk";
import { askGemini } from "./gemini.js";
import { DOC_TYPES, buildAlerts, ratio, groupRatio, isSaudi, saudisNeeded, ruleCoverage, docStatus, leavingReason } from "../public/js/logic.js";

const MODEL = "claude-opus-5-5";

export function aiConfigured(env) {
  return Boolean(env.GEMINI_API_KEY || env.ANTHROPIC_API_KEY);
}
// Gemini (free) first when its key exists, else Claude.
export const aiProvider = (env) => (env.GEMINI_API_KEY ? "gemini" : env.ANTHROPIC_API_KEY ? "claude" : null);

// Text summary of the database for the model.
export function buildContext({ employees, documents, jobs, applicants, rules, tasks, leaves = [], appraisals = [] }, settings, { strict = false } = {}) {
  const active = employees.filter((e) => e.status !== "left");
  const staff = active.filter((e) => e.kind === "staff");
  const labor = active.filter((e) => e.kind === "labor");
  const r = ratio(staff);
  const lines = [];
  lines.push(`# ${settings.hotel_name_en} (${settings.hotel_name_ar}) — HR data snapshot, today ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`Permanent staff: ${r.total} (Saudi ${r.saudi}, non-Saudi ${r.non_saudi}, Saudization ${r.pct.toFixed(1)}%). Contractor workers (labor supply companies, not counted in Saudization): ${labor.length}.`);
  if (settings.saudization_target) {
    lines.push(`Internal Saudization target set by HR: ${settings.saudization_target}% — Saudis still needed to reach it: ${saudisNeeded(r, settings.saudization_target)}.`);
  }
  lines.push(`Alert thresholds (days): iqama ${settings.iqama}, contracts ${settings.contracts}, other documents ${settings.docs}.`);

  lines.push("\n## Saudization by department");
  for (const g of groupRatio(staff, "department")) lines.push(`- ${g.key}: ${g.total} staff, ${g.saudi} Saudi (${g.pct.toFixed(0)}%)`);

  if (rules.length) {
    lines.push("\n## Localization rules entered by HR");
    for (const rule of rules) {
      const c = ruleCoverage(rule, staff);
      if (!c.total) continue;
      lines.push(`- ${rule.name}: required ${rule.required_pct ?? "?"}% from ${rule.effective_date || "-"}, workers in profession ${c.total}, Saudi ${c.saudi}, Saudis required ${c.required ?? "-"}, MISSING ${c.missing}. Professions: ${rule.occupations || "-"}`);
    }
    const none = rules.filter((r) => !ruleCoverage(r, staff).total).map((r) => r.name);
    if (none.length) lines.push(`- Professions in the decision that the hotel currently has no staff in: ${none.join("; ")}`);
    lines.push(`Source of rules: ${[...new Set(rules.map((r) => r.source).filter(Boolean))].join("; ")}. Method: required Saudis = workers in profession × rate, rounded to nearest whole number.`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const in90 = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const contracts = documents.filter((d) => d.doc_type === "contract" && active.some((e) => e.id === d.employee_id));
  const byId = new Map(active.map((e) => [e.id, e]));
  const leavers = contracts.map((d) => ({ d, why: leavingReason(d, appraisals.filter((a) => a.employee_id === d.employee_id && a.status !== "manager")) })).filter((x) => x.why);
  lines.push(`\n## Contracts — auto-renewed for one year ${settings.contract_renew_days || 75} days before the end unless the person is leaving`);
  for (const { d, why } of leavers) lines.push(`- LEAVING: ${byId.get(d.employee_id)?.name_ar} — contract ends ${String(d.expiry_date).slice(0, 10)} — ${why}`);
  const soon = contracts.filter((d) => d.expiry_date && String(d.expiry_date).slice(0, 10) <= in90).length;
  lines.push(`- Contracts ending within 90 days: ${soon}`);
  const renewedNow = contracts.filter((d) => (d.details?.renewals || []).length).length;
  lines.push(`- Contracts already renewed by the system: ${renewedNow}`);

  const onLeave = leaves.filter((l) => l.status === "approved" && String(l.start_date) <= today && String(l.end_date) >= today && byId.has(l.employee_id));
  const upcoming = leaves.filter((l) => l.status !== "rejected" && String(l.start_date) > today && byId.has(l.employee_id));
  const pending = leaves.filter((l) => l.status === "pending" && byId.has(l.employee_id));
  lines.push(`\n## Leaves: on leave today ${onLeave.length}, upcoming ${upcoming.length}, pending approval ${pending.length}`);
  for (const l of [...onLeave, ...upcoming].slice(0, 30)) lines.push(`- ${byId.get(l.employee_id).name_ar}: ${l.leave_type} ${String(l.start_date).slice(0, 10)} → ${String(l.end_date).slice(0, 10)}${l.outside_ksa ? " (outside KSA)" : ""} [${l.status}]`);
  const outside = active.filter((e) => e.platform?.outside_ksa === "نعم");
  if (outside.length) lines.push(`Outside KSA now (Muqeem): ${outside.map((e) => e.name_ar).join("، ")}`);
  const visas = documents.filter((d) => d.doc_type === "exit_reentry" && d.expiry_date && String(d.expiry_date).slice(0, 10) >= today && byId.has(d.employee_id));
  for (const v of visas) lines.push(`- Valid exit/re-entry visa: ${byId.get(v.employee_id).name_ar} until ${String(v.expiry_date).slice(0, 10)}`);

  if (appraisals.length) {
    lines.push(`\n## Performance appraisals (${appraisals.length})`);
    for (const a of appraisals.slice(0, 40)) lines.push(`- ${byId.get(a.employee_id)?.name_ar || "?"}: ${a.status}${a.total != null ? `, score ${a.total}% (${a.grade})` : ""}${a.decision ? `, contract decision ${a.decision}` : ""}`);
  }

  const alerts = buildAlerts(active, documents.filter((d) => !(d.doc_type === "exit_reentry" && d.expiry_date && String(d.expiry_date).slice(0, 10) < new Date().toISOString().slice(0, 10))), settings, undefined, { appraisals, attachments: [] });
  lines.push(`\n## Documents expired or near expiry (${alerts.length})`);
  for (const a of alerts.slice(0, 80)) {
    lines.push(`- ${a.employee.name_ar} (${a.employee.kind === "labor" ? "contractor " + (a.employee.company || "") : a.employee.department || ""}): ${DOC_TYPES[a.doc.doc_type]?.en || a.doc.doc_type} ${a.status === "expired" ? "EXPIRED" : "expires"} ${a.expiry} (${a.days} days)`);
  }

  lines.push(strict ? "\n## Staff roster (name | department | job title | nationality | join date)" : "\n## Staff roster (name | department | job title | nationality | join date | basic salary)");
  for (const e of staff) {
    lines.push(`- ${e.name_ar} | ${e.department || "-"} | ${e.job_title || "-"} | ${e.nationality || "-"} | ${e.join_date || "-"}${strict ? "" : ` | ${e.basic_salary ?? "-"}`}`);
  }
  lines.push("\n## Contractor workers (name | company | department | job title | nationality)");
  for (const e of labor) lines.push(`- ${e.name_ar} | ${e.company || "-"} | ${e.department || "-"} | ${e.job_title || "-"} | ${e.nationality || "-"}`);

  if (jobs.length) {
    lines.push("\n## Recruitment — open jobs and applicants");
    for (const j of jobs) {
      const apps = applicants.filter((a) => a.job_id === j.id);
      lines.push(`- Job "${j.title}" (${j.department || "-"}, ${j.status}, openings ${j.openings ?? 1}${j.saudi_only ? ", Saudi only" : ""}): ${apps.length} applicants — ${apps.map((a) => `${a.name} [${a.stage}${isSaudi(a.nationality) ? ", Saudi" : ""}]`).join("; ") || "none"}`);
    }
  }
  const open = tasks.filter((t) => t.status === "open");
  if (open.length) {
    lines.push(`\n## Open follow-up tasks (${open.length})`);
    for (const t of open.slice(0, 40)) lines.push(`- [${t.category}] ${t.title}: ${t.person || ""} ${t.details || ""}`);
  }
  const text = lines.join("\n");
  // Strict (free external AI): no ID / iqama / phone numbers, no IBANs, no emails.
  return strict
    ? text.replace(/\bSA\d{2}[0-9A-Z ]{10,}\b/gi, "[IBAN]").replace(/[^\s@|]+@[^\s@|]+\.[a-z]{2,}/gi, "[email]").replace(/\b\d{9,15}\b/g, "[رقم]")
    : text;
}

const MODE_TASK = {
  chat: "",
  insights: "Write an executive summary of the current HR situation: 4-6 key findings with numbers, then the top 5 actions for this week.",
  saudization: "Analyse Saudization: current ratio overall and by department, gaps against the HR target and the localization rules, which roles and departments to localize first, and a realistic hiring plan.",
  screen: "Screen the applicant below for the job. Give: fit score out of 10, strengths, concerns, Saudization impact, and a recommendation (advance / hold / reject) with one-line reason.",
};

const SYSTEM = `You are the HR assistant inside the HR control panel of a hotel in Saudi Arabia.
You help the HR team understand and act on their data: Saudization (Nitaqat and profession localization), document expiries (iqama, passport, work permits, health certificates, contracts, Ajeer), contract renewals and leavers, leaves and travel, performance appraisals, recruitment and workforce analysis.
Rules:
- Answer in the user's language (Arabic or English). Use clear headings and short bullet points.
- Base every number on the data snapshot you are given. If the data does not contain something, say so plainly instead of guessing.
- Localization rules in the data come from the official MHRSD + Ministry of Tourism decision (41 tourism professions, 3 phases). Use them with their numbers. For the overall Nitaqat band of the hotel, say it must be checked in Qiwa.
- Be a senior HR advisor: lead with the answer, then the numbers, then concrete next steps (who, what, by when). Use tables when comparing people or numbers.
- When asked to draft letters or messages, write them ready to send in formal Arabic (or English if asked), with the hotel name.
- Give practical, prioritized recommendations (what to renew first, which roles to localize, which applicants to move forward).
- Keep personal data to what the question needs.`;

// mode: "chat" (free question) | "insights" (dashboard summary) | "saudization" | "screen" (one applicant)
export async function askClaude(env, { messages, context, mode = "chat", lang = "ar" }) {
  if (aiProvider(env) === "gemini") {
    const task = MODE_TASK[mode];
    const msgs = (messages || []).slice(-12);
    const last = msgs.length ? msgs[msgs.length - 1].content : "";
    try {
      return await askGemini(env, {
        system: `${SYSTEM}\n\n${context}`,
        messages: [...msgs.slice(0, -1), { role: "user", content: [task, lang === "en" ? "Reply in English." : "أجب باللغة العربية.", last].filter(Boolean).join("\n\n") }],
      });
    } catch (e) {
      if (e.status === 429) { const err = new Error("free quota"); err.status = 429; err.free = true; throw err; }
      throw e;
    }
  }
  if (!env.ANTHROPIC_API_KEY) {
    const err = new Error("AI is not configured (ANTHROPIC_API_KEY missing)");
    err.status = 503;
    throw err;
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const langLine = lang === "en" ? "Reply in English." : "أجب باللغة العربية.";
  const task = MODE_TASK[mode];

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: mode === "chat" ? "medium" : "high" },
    system: [
      { type: "text", text: SYSTEM },
      { type: "text", text: context, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      ...(messages || []).slice(0, -1),
      {
        role: "user",
        content: [task, langLine, (messages && messages.length ? messages[messages.length - 1].content : "")]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    return { text: lang === "en" ? "The assistant could not answer this request." : "تعذر على المساعد الإجابة على هذا الطلب.", refused: true };
  }
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { text, truncated: response.stop_reason === "max_tokens" };
}

export { docStatus };
