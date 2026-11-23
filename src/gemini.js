// Google Gemini (free tier) through Google's OpenAI-compatible endpoint.
const BASE = "https://generativelanguage.googleapis.com/v1beta";

// Pick the newest stable "flash" model the key can use (free tier friendly).
export async function pickGeminiModel(key) {
  const r = await fetch(`${BASE}/models?pageSize=200&key=${encodeURIComponent(key)}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(body?.error?.message || `Gemini ${r.status}`);
    err.status = r.status;
    throw err;
  }
  const names = (body.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => String(m.name || "").replace(/^models\//, ""));
  const score = (n) => {
    const m = n.match(/^gemini-(\d+(?:\.\d+)?)-flash$/);
    return m ? Number(m[1]) : -1;
  };
  const best = names.filter((n) => score(n) > 0).sort((a, b) => score(b) - score(a))[0];
  return best || names.find((n) => /flash/.test(n) && !/lite|image|tts|live|audio/.test(n)) || "gemini-2.5-flash";
}

export async function askGemini(env, { system, messages, maxTokens = 8000 }) {
  const r = await fetch(`${BASE}/openai/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.GEMINI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.GEMINI_MODEL || "gemini-2.5-flash",
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(body?.error?.message || (Array.isArray(body) ? body[0]?.error?.message : "") || `Gemini ${r.status}`);
    err.status = r.status;
    throw err;
  }
  const choice = body.choices?.[0];
  return { text: String(choice?.message?.content || "").trim(), truncated: choice?.finish_reason === "length" };
}
