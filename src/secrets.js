// API keys can come from the hosting environment OR be saved by the admin from
// the site's settings page (stored server-side only, never sent to the browser).
import Anthropic from "@anthropic-ai/sdk";

const KEY = "secrets";
let cache = null, cacheAt = 0;

async function stored(env) {
  if (cache && Date.now() - cacheAt < 60e3) return cache;
  cache = (await env.HR.get(KEY, "json")) || {};
  cacheAt = Date.now();
  return cache;
}

// env plus any keys saved from the site (hosting values win).
export async function withSecrets(env) {
  const s = await stored(env).catch(() => ({}));
  return {
    ...env,
    HR: env.HR,
    KEY_SOURCE: { ai: env.ANTHROPIC_API_KEY ? "hosting" : s.anthropic ? "site" : null, email: env.RESEND_API_KEY ? "hosting" : s.resend ? "site" : null },
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY || s.anthropic || "",
    RESEND_API_KEY: env.RESEND_API_KEY || s.resend || "",
  };
}

export async function secretStatus(env) {
  const s = await stored(env).catch(() => ({}));
  const src = (hosting, site) => (hosting ? "hosting" : site ? "site" : null);
  return { ai: src(env.ANTHROPIC_API_KEY, s.anthropic), email: src(env.RESEND_API_KEY, s.resend) };
}

// Check a Claude key with a tiny request before saving it.
async function testAnthropic(key) {
  const client = new Anthropic({ apiKey: key });
  await client.messages.create({ model: "claude-haiku-5-5", max_tokens: 5, messages: [{ role: "user", content: "ping" }] });
}

export async function saveSecrets(env, body) {
  const s = { ...(await stored(env).catch(() => ({}))) };
  if ("anthropic_key" in body) {
    const k = String(body.anthropic_key || "").trim();
    if (!k) delete s.anthropic;
    else {
      if (!/^sk-ant-[A-Za-z0-9_\-]{20,}$/.test(k)) return { error: "المفتاح غير صحيح — لازم يبدأ بـ sk-ant-" };
      try { await testAnthropic(k); } catch (e) {
        if (e?.status === 401 || e?.status === 403) return { error: "Claude رفض المفتاح — تأكد إنك نسخته كامل وإنه مفعّل" };
        if (e?.status === 400 && /credit|billing|balance/i.test(e?.message || "")) return { error: "المفتاح صحيح بس ما فيه رصيد — أضف رصيد من Billing في console.anthropic.com" };
        if (!(e?.status === 429 || e?.status >= 500)) return { error: "تعذر التحقق من المفتاح: " + (e?.message || "خطأ اتصال") };
      }
      s.anthropic = k;
    }
  }
  if ("resend_key" in body) {
    const k = String(body.resend_key || "").trim();
    if (!k) delete s.resend;
    else if (!/^re_[A-Za-z0-9_\-]{10,}$/.test(k)) return { error: "مفتاح Resend لازم يبدأ بـ re_" };
    else s.resend = k;
  }
  await env.HR.put(KEY, JSON.stringify(s));
  cache = s; cacheAt = Date.now();
  return { ok: true };
}
