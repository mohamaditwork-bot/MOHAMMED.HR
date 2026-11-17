import { getStore } from "@netlify/blobs";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const COOKIE = "hr_session";
const SESSION_HOURS = 12;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

const env = (k) => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]);

export const store = () => getStore({ name: "hr", consistency: "strong" });

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

// ---------- passwords ----------
export function hashPassword(pw) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(pw), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const [, salt, hash] = stored.split("$");
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(String(pw), salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- users ----------
// users blob: { "<id>": { name, role: "admin"|"viewer", hash } }
// HR_USERS_SEED env (JSON array of {id,name,role,hash}) adds any user that is not stored yet.
export async function getUsers() {
  const s = store();
  let users = (await s.get("users", { type: "json" })) || {};
  const seedRaw = env("HR_USERS_SEED");
  if (seedRaw) {
    let changed = false;
    try {
      for (const u of JSON.parse(seedRaw)) {
        if (u && u.id && !users[u.id]) {
          users[u.id] = { name: u.name, role: u.role === "admin" ? "admin" : "viewer", hash: u.hash };
          changed = true;
        }
      }
    } catch (e) {
      console.error("HR_USERS_SEED is not valid JSON");
    }
    if (changed) await s.setJSON("users", users);
  }
  return users;
}

export const saveUsers = (users) => store().setJSON("users", users);

// ---------- lockout ----------
export async function isLocked(id) {
  const l = await store().get(`lock/${id}`, { type: "json" });
  return l && l.until && l.until > Date.now() ? l.until : 0;
}
export async function recordFail(id) {
  const s = store();
  const l = (await s.get(`lock/${id}`, { type: "json" })) || { fails: 0 };
  l.fails = (l.until && l.until < Date.now() ? 0 : l.fails) + 1;
  l.until = l.fails >= MAX_FAILS ? Date.now() + LOCK_MINUTES * 60e3 : 0;
  if (l.fails >= MAX_FAILS) l.fails = 0;
  await s.setJSON(`lock/${id}`, l);
}
export const clearFails = (id) => store().delete(`lock/${id}`);

// ---------- sessions ----------
function secret() {
  const s = env("SESSION_SECRET");
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is missing or too short");
  return s;
}
const b64 = (s) => Buffer.from(s).toString("base64url");
const sign = (data) => createHmac("sha256", secret()).update(data).digest("base64url");

export function sessionCookie(user) {
  const payload = b64(JSON.stringify({ id: user.id, exp: Date.now() + SESSION_HOURS * 3600e3 }));
  const token = `${payload}.${sign(payload)}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

function readToken(req) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return null;
  const good = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (good.length !== got.length || !timingSafeEqual(good, got)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

// Returns {id,name,role} or a 401/403 Response.
export async function requireUser(req, { admin = false } = {}) {
  const t = readToken(req);
  if (!t) return json({ error: "يلزم تسجيل الدخول" }, 401);
  const users = await getUsers();
  const u = users[t.id];
  if (!u) return json({ error: "يلزم تسجيل الدخول" }, 401, { "set-cookie": clearCookie() });
  if (admin && u.role !== "admin") return json({ error: "هذه الصلاحية للمدير فقط" }, 403);
  return { id: t.id, name: u.name, role: u.role };
}

// Same-origin check for state-changing requests.
export function sameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}
