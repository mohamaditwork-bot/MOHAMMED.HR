// Google Gemini (free tier) through Google's OpenAI-compatible endpoint.
const BASE = "https://generativelanguage.googleapis.com/v1beta";

// Models tried in order — the free tier has usable daily limits on these.
export const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite"];

// Check the key and return the first model in our list that it can use.
export async function pickGeminiModel(key) {
  const r = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(body?.error?.message || `Gemini ${r.status}`);
    err.status = r.status;
    throw err;
  }
  const names = new Set((body.models || []).map((m) => String(m.name || "").replace(/^models\//, "")));
  return GEMINI_MODELS.find((m) => names.has(m)) || GEMINI_MODELS[0];
}

// Ask Gemini; when a model is out of quota (429) or unavailable (404), try the next one.
export async function askGemini(env, args) {
  const first = env.GEMINI_MODEL || GEMINI_MODELS[0];
  const order = [first, ...GEMINI_MODELS.filter((m) => m !== first)];
  let last;
  for (const model of order) {
    try { return await askGeminiOnce(env, model, args); }
    catch (e) { last = e; if (e.status !== 429 && e.status !== 404) throw e; }
  }
  throw last;
}

// Native Gemini API with the x-goog-api-key header — the same call that validated the key when it was saved.
async function askGeminiOnce(env, model, { system, messages, maxTokens = 8000 }) {
  const r = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content || "") }] })),
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(body?.error?.message || (Array.isArray(body) ? body[0]?.error?.message : "") || `Gemini ${r.status}`);
    err.status = r.status;
    throw err;
  }
  const c = body.candidates?.[0];
  const text = (c?.content?.parts || []).map((p) => p.text || "").join("").trim();
  if (!text) {
    const why = body.promptFeedback?.blockReason || c?.finishReason || "empty";
    const err = new Error(`Gemini returned no text (${why})`);
    err.status = 502;
    throw err;
  }
  return { text, truncated: c?.finishReason === "MAX_TOKENS" };
}
