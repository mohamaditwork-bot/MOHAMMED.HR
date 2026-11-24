// Google Gemini (free tier) through Google's OpenAI-compatible endpoint.
const BASE = "https://generativelanguage.googleapis.com/v1beta";

// Google retires model names often, so we never hard-code them: ask which models this key can use
// and try the newest plain-text Flash models first.
const FALLBACK_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3.5-flash", "gemini-3.5-flash-lite"];
const modelCache = new Map(); // sha256(key) → { at, list }

async function keyId(key) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(h)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Rank model ids: stable gemini-<ver>-flash / -flash-lite, newest version first, flash before lite.
export function rankModels(names) {
  const plain = /^gemini-(\d+(?:\.\d+)?)-flash(-lite)?$/;
  const preview = /^gemini-(\d+(?:\.\d+)?)-flash(-lite)?-preview(?:-[\w-]+)?$/;
  const score = (m, re) => { const x = m.match(re); return x ? [parseFloat(x[1]), x[2] ? 1 : 0] : null; };
  const sortBy = (re) => names.filter((n) => re.test(n)).sort((a, b) => { const [va, la] = score(a, re), [vb, lb] = score(b, re); return vb - va || la - lb; });
  const stable = sortBy(plain);
  const list = stable.length ? stable : sortBy(preview);
  for (const alias of ["gemini-flash-latest", "gemini-flash-lite-latest"]) if (names.includes(alias)) list.push(alias);
  return list;
}

export async function geminiModels(key) {
  const id = await keyId(key);
  const hit = modelCache.get(id);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.list;
  const r = await fetch(`${BASE}/models?pageSize=1000`, { headers: { "x-goog-api-key": key } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(body?.error?.message || `Gemini ${r.status}`);
    err.status = r.status;
    throw err;
  }
  const names = (body.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => String(m.name || "").replace(/^models\//, ""));
  const list = rankModels(names);
  const final = list.length ? list : FALLBACK_MODELS;
  modelCache.set(id, { at: Date.now(), list: final });
  return final;
}

// Check the key and return the best model it can use (saved with the key).
export async function pickGeminiModel(key) {
  return (await geminiModels(key))[0];
}

// A model-specific failure (retired, unknown, out of quota) → try the next model.
const NEXT_MODEL = /no longer available|not found|not supported|deprecated|retired|is not available/i;
const tryNext = (e) => e.status === 429 || e.status === 404 || ((e.status === 400 || e.status === 403) && NEXT_MODEL.test(e.message || ""));

export async function askGemini(env, args) {
  let models;
  try { models = await geminiModels(env.GEMINI_API_KEY); }
  catch (e) { if (e.status === 400 || e.status === 401 || e.status === 403) throw e; models = FALLBACK_MODELS; }
  const order = env.GEMINI_MODEL && models.includes(env.GEMINI_MODEL) ? [env.GEMINI_MODEL, ...models.filter((m) => m !== env.GEMINI_MODEL)] : models;
  let last;
  for (const model of order) {
    try { return await askGeminiOnce(env, model, args); }
    catch (e) { last = e; if (!tryNext(e)) throw e; }
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
