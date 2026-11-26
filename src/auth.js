// Authentication helpers for the Cloudflare Worker (WebCrypto only).
const COOKIE = "hr_session";
const SESSION_HOURS = 12; // absolute limit for one login
export const IDLE_MINUTES = 30; // session ends after this long with no activity
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const PBKDF2_ITER = 100000; // Workers' maximum

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => {
  const t = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(t, (c) => c.charCodeAt(0));
};

// Constant-time comparison of two equal-length byte arrays.
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

// ---------- passwords: pbkdf2$<iter>$<salt hex>$<hash hex> ----------
async function pbkdf2(pw, salt, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(String(pw)), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}

export async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${hex(salt)}$${hex(await pbkdf2(pw, salt, PBKDF2_ITER))}`;
}

export async function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith("pbkdf2$")) return false;
  const [, iter, salt, hash] = stored.split("$");
  return safeEqual(await pbkdf2(pw, unhex(salt), Number(iter)), unhex(hash));
}

// Roles from least to most access. "labor_viewer" sees contractor labour only, read-only: every route
// needs at least "viewer" unless it explicitly allows it (and then returns labour data only).
// "labor_editor" may also add / edit / delete contractor labour and their rows — never anything else.
export const ROLES = ["labor_viewer", "labor_editor", "viewer", "editor", "admin"];
export const roleAtLeast = (role, min) => ROLES.indexOf(role) >= ROLES.indexOf(min);

// ---------- users (KV key "users": { "<id>": { name, role, hash } }) ----------
// HR_USERS_SEED secret (JSON array of {id,name,role,hash}) adds any user not stored yet.
// The temporary "Archive assistant" account (1999999999) is no longer needed: remove it once
// and keep it removed (owner request — no more file uploads).
export async function getUsers(env) {
  const users = (await env.HR.get("users", "json")) || {};
  if (!(await env.HR.get("archive_account_removed"))) {
    const removed = new Set((await env.HR.get("users_removed", "json")) || []);
    removed.add("1999999999");
    delete users["1999999999"];
    await env.HR.put("users", JSON.stringify(users));
    await env.HR.put("users_removed", JSON.stringify([...removed]));
    await env.HR.put("archive_account_removed", "1");
  }
  if (env.HR_USERS_SEED) {
    let changed = false;
    const removed = new Set((await env.HR.get("users_removed", "json")) || []);
    try {
      for (const u of JSON.parse(env.HR_USERS_SEED)) {
        if (u && u.id && !users[u.id] && !removed.has(String(u.id))) {
          users[u.id] = { name: u.name, role: ROLES.includes(u.role) ? u.role : "viewer", hash: u.hash };
          changed = true;
        }
      }
    } catch {
      console.error("HR_USERS_SEED is not valid JSON");
    }
    if (changed) await env.HR.put("users", JSON.stringify(users));
  }
  return users;
}
export const saveUsers = (env, users) => env.HR.put("users", JSON.stringify(users));

// ---------- lockout ----------
export async function isLocked(env, id) {
  const l = await env.HR.get(`lock:${id}`, "json");
  return l && l.until > Date.now() ? l.until : 0;
}
export async function recordFail(env, id) {
  const l = (await env.HR.get(`lock:${id}`, "json")) || { fails: 0, until: 0 };
  l.fails = (l.until && l.until < Date.now() ? 0 : l.fails) + 1;
  l.until = 0;
  if (l.fails >= MAX_FAILS) {
    l.until = Date.now() + LOCK_MINUTES * 60e3;
    l.fails = 0;
  }
  await env.HR.put(`lock:${id}`, JSON.stringify(l), { expirationTtl: 24 * 3600 });
}
export const clearFails = (env, id) => env.HR.delete(`lock:${id}`);

// ---------- sessions (HMAC-signed cookie) ----------
async function hmac(env, data) {
  const s = env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is missing or too short");
  const key = await crypto.subtle.importKey("raw", enc.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

// Short fingerprint of the browser: a stolen cookie does not work from another device/browser.
export async function uaHash(req) {
  const ua = req.headers.get("user-agent") || "";
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(ua))).slice(0, 16);
}
export function clientIp(req) {
  return (req.headers.get("x-real-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0] || "").trim().slice(0, 64) || null;
}

// Sliding session: `exp` moves forward on each authenticated request (idle limit),
// `iat` stays fixed so a login never lasts longer than SESSION_HOURS.
// `st` = login stage: "pw" (must change password), "setup" (must enable 2FA), "2fa" (code needed), "full".
export async function sessionCookie(env, id, iat = Date.now(), extra = {}) {
  const exp = Math.min(Date.now() + (extra.st && extra.st !== "full" ? 10 : IDLE_MINUTES) * 60e3, iat + SESSION_HOURS * 3600e3);
  const payload = b64url(enc.encode(JSON.stringify({ id, iat, exp, st: extra.st || "full", sv: extra.sv || 0, ua: extra.ua || "" })));
  const token = `${payload}.${b64url(await hmac(env, payload))}`;
  const maxAge = Math.max(0, Math.floor((exp - Date.now()) / 1000));
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

async function readToken(env, req) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return null;
  try {
    if (!safeEqual(await hmac(env, payload), fromB64url(sig))) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    const now = Date.now();
    if (!(data.exp > now) || !data.iat || now - data.iat > SESSION_HOURS * 3600e3) return null;
    return data;
  } catch {
    return null;
  }
}

// Returns {id,name,role} or a 401/403 Response.
// `stages` lists the login stages allowed (default: fully signed in only).
export async function requireUser(env, req, { admin = false, role, stages = ["full"] } = {}) {
  const need = admin ? "admin" : role || "viewer";
  const t = await readToken(env, req);
  if (!t) return json({ error: "يلزم تسجيل الدخول" }, 401);
  const u = (await getUsers(env))[t.id];
  if (!u) return json({ error: "يلزم تسجيل الدخول" }, 401, { "set-cookie": clearCookie() });
  if ((t.sv || 0) !== (u.sv || 0) || (t.ua && t.ua !== (await uaHash(req)))) {
    return json({ error: "انتهت الجلسة — سجّل دخول من جديد" }, 401, { "set-cookie": clearCookie() });
  }
  const st = t.st || "full";
  if (!stages.includes(st)) return json({ error: "أكمل خطوات الدخول أولًا", stage: st }, 403);
  if (!roleAtLeast(u.role, need)) return json({ error: need === "admin" ? "هذه الصلاحية للمدير فقط" : "ما عندك صلاحية تعديل" }, 403);
  const user = { id: t.id, name: u.name, role: u.role, iat: t.iat, st, sv: u.sv || 0, ua: t.ua, ip: clientIp(req) };
  try {
    req.sessionUser = user;
  } catch {}
  return user;
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
