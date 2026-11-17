// AI assistant backed by Claude. The server builds a compact, privacy-reduced
// summary of the HR data (no IBANs, phones, emails, addresses or birth dates)
// and sends it with the user's question.
import Anthropic from "@anthropic-ai/sdk";
import { DOC_TYPES, buildAlerts, ratio, groupRatio, isSaudi, saudisNeeded, ruleCoverage, docStatus } from "../public/js/logic.js";

const MODEL = "claude-opus-5-5";

export function aiConfigured(env) {
  return Boolean(env.ANTHROPIC_API_KEY);
}

// Text summary of the database for the model.
export function buildContext({ employees, documents, jobs, applicants, rules, tasks }, settings) {
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
      lines.push(`- ${rule.name}: required ${rule.required_pct ?? "?"}%, covered staff ${c.total}, Saudi ${c.saudi} (${c.pct.toFixed(0)}%). Occupations: ${rule.occupations || "-"}. Source: ${rule.source || "-"}`);
    }
  }

  const alerts = buildAlerts(active, documents, settings);
  lines.push(`\n## Documents expired or near expiry (${alerts.length})`);
  for (const a of alerts.slice(0, 80)) {
    lines.push(`- ${a.employee.name_ar} (${a.employee.kind === "labor" ? "contractor " + (a.employee.company || "") : a.employee.department || ""}): ${DOC_TYPES[a.doc.doc_type]?.en || a.doc.doc_type} ${a.status === "expired" ? "EXPIRED" : "expires"} ${a.expiry} (${a.days} days)`);
  }

  lines.push("\n## Staff roster (name | department | job title | nationality | join date | basic salary)");
  for (const e of staff) {
    lines.push(`- ${e.name_ar} | ${e.department || "-"} | ${e.job_title || "-"} | ${e.nationality || "-"} | ${e.join_date || "-"} | ${e.basic_salary ?? "-"}`);
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
  return lines.join("\n");
}

const SYSTEM = `You are the HR assistant inside the HR control panel of a hotel in Saudi Arabia.
You help the HR team understand and act on their data: Saudization (Nitaqat), document expiries (iqama, passport, work permits, health certificates, contracts, Ajeer), recruitment and workforce analysis.
Rules:
- Answer in the user's language (Arabic or English). Use clear headings and short bullet points.
- Base every number on the data snapshot you are given. If the data does not contain something, say so plainly instead of guessing.
- The Saudization percentage in the data is an internal ratio. Do not state official government targets unless they appear in the localization rules entered by HR; you may describe general approaches but say they must be checked against current MHRSD/Qiwa rules.
- Give practical, prioritized recommendations (what to renew first, which roles to localize, which applicants to move forward).
- Keep personal data to what the question needs.`;

// mode: "chat" (free question) | "insights" (dashboard summary) | "saudization" | "screen" (one applicant)
export async function askClaude(env, { messages, context, mode = "chat", lang = "ar" }) {
  if (!aiConfigured(env)) {
    const err = new Error("AI is not configured (ANTHROPIC_API_KEY missing)");
    err.status = 503;
    throw err;
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const langLine = lang === "en" ? "Reply in English." : "أجب باللغة العربية.";
  const task = {
    chat: "",
    insights: "Write an executive summary of the current HR situation: 4-6 key findings with numbers, then the top 5 actions for this week.",
    saudization: "Analyse Saudization: current ratio overall and by department, gaps against the HR target and the localization rules, which roles and departments to localize first, and a realistic hiring plan.",
    screen: "Screen the applicant below for the job. Give: fit score out of 10, strengths, concerns, Saudization impact, and a recommendation (advance / hold / reject) with one-line reason.",
  }[mode];

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
