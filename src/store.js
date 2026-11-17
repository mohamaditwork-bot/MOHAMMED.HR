// Key-value store backed by Upstash Redis (REST API), with the same small
// interface the auth code expects: get(key, "json"?), put(key, value, {expirationTtl}), delete(key).
// Vercel's Upstash integration sets KV_REST_API_URL / KV_REST_API_TOKEN
// (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
export function upstashStore(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Upstash Redis is not connected (KV_REST_API_URL / KV_REST_API_TOKEN missing)");
  const prefix = "hr:";

  async function cmd(args) {
    const r = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error("Redis error: " + (d.error || r.status));
    return d.result;
  }

  return {
    async get(key, type) {
      const v = await cmd(["GET", prefix + key]);
      if (v === null || v === undefined) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(key, value, opts = {}) {
      const args = ["SET", prefix + key, String(value)];
      if (opts.expirationTtl) args.push("EX", String(opts.expirationTtl));
      await cmd(args);
    },
    async delete(key) {
      await cmd(["DEL", prefix + key]);
    },
  };
}
