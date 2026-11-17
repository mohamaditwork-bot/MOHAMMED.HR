// API routes shared by the hosting adapter (api/handler.js on Vercel).
import {
  json, sameOrigin, requireUser, getUsers, saveUsers, hashPassword, verifyPassword,
  isLocked, recordFail, clearFails, sessionCookie, clearCookie,
} from "./auth.js";
import { parseWorkbook } from "./parse.js";

const MAX_UPLOAD = 4 * 1024 * 1024;
const ID_RE = /^\d{5,15}$/;
const readJson = (req) => req.json().catch(() => null);

const SECURITY_HEADERS = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
  "strict-transport-security": "max-age=31536000",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

async function login(req, env) {
  const body = await readJson(req);
  if (!body) return json({ error: "بيانات غير صحيحة" }, 400);
  const id = String(body.id || "").trim();
  const password = String(body.password || "");
  if (!ID_RE.test(id) || !password) return json({ error: "اكتب رقم الهوية وكلمة المرور" }, 400);

  const until = await isLocked(env, id);
  if (until) {
    const mins = Math.ceil((until - Date.now()) / 60e3);
    return json({ error: `تم إيقاف الدخول مؤقتًا بسبب محاولات خاطئة. حاول بعد ${mins} دقيقة` }, 429);
  }
  const u = (await getUsers(env))[id];
  if (!u || !(await verifyPassword(password, u.hash))) {
    await recordFail(env, id);
    return json({ error: "رقم الهوية أو كلمة المرور غير صحيحة" }, 401);
  }
  await clearFails(env, id);
  return json({ ok: true, user: { id, name: u.name, role: u.role } }, 200, { "set-cookie": await sessionCookie(env, id) });
}

async function data(req, env) {
  const u = await requireUser(env, req);
  if (u instanceof Response) return u;
  const d = await env.HR.get("dataset");
  if (!d) return json({ error: "لا توجد بيانات بعد — يرفع المدير ملف الإكسل من صفحة الإدارة" }, 404);
  return new Response(d, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

async function upload(req, env) {
  const u = await requireUser(env, req, { admin: true });
  if (u instanceof Response) return u;
  const buf = new Uint8Array(await req.arrayBuffer());
  if (!buf.length) return json({ error: "الملف فاضي" }, 400);
  if (buf.length > MAX_UPLOAD) return json({ error: "الملف أكبر من 4 ميجا" }, 413);
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) return json({ error: "الملف لازم يكون Excel بصيغة xlsx" }, 400);
  let parsed;
  try {
    parsed = parseWorkbook(buf);
  } catch (e) {
    return json({ error: "تعذر قراءة الملف: " + e.message }, 400);
  }
  let fileName = null;
  try {
    fileName = decodeURIComponent(req.headers.get("x-file-name") || "") || null;
  } catch {}
  Object.assign(parsed.meta, { fileName, uploadedAt: new Date().toISOString(), uploadedBy: u.name });
  await env.HR.put("dataset", JSON.stringify(parsed));
  return json({ ok: true, sheets: parsed.sheets.map((s) => ({ name: s.name, rows: s.rows.length })) });
}

async function users(req, env) {
  const me = await requireUser(env, req, { admin: true });
  if (me instanceof Response) return me;
  const all = await getUsers(env);
  const list = () => json({ users: Object.entries(all).map(([id, u]) => ({ id, name: u.name, role: u.role })) });
  if (req.method === "GET") return list();

  const body = await readJson(req);
  if (!body) return json({ error: "بيانات غير صحيحة" }, 400);
  const id = String(body.id || "").trim();
  if (!ID_RE.test(id)) return json({ error: "رقم الهوية غير صحيح" }, 400);

  if (req.method === "DELETE") {
    if (id === me.id) return json({ error: "ما تقدر تحذف حسابك" }, 400);
    delete all[id];
    await saveUsers(env, all);
    return list();
  }
  const name = String(body.name || all[id]?.name || "").trim();
  if (!name) return json({ error: "اكتب الاسم" }, 400);
  const role = body.role === "admin" ? "admin" : "viewer";
  const password = body.password ? String(body.password) : null;
  if (!all[id] && !password) return json({ error: "اكتب كلمة المرور" }, 400);
  if (password && password.length < 6) return json({ error: "كلمة المرور 6 خانات على الأقل" }, 400);
  if (id === me.id && role !== "admin") return json({ error: "ما تقدر تشيل صلاحية المدير عن نفسك" }, 400);
  all[id] = { name, role, hash: password ? await hashPassword(password) : all[id].hash };
  await saveUsers(env, all);
  await clearFails(env, id);
  return list();
}

async function password(req, env) {
  const me = await requireUser(env, req);
  if (me instanceof Response) return me;
  const { current, next } = (await readJson(req)) || {};
  const all = await getUsers(env);
  if (!(await verifyPassword(String(current || ""), all[me.id].hash))) return json({ error: "كلمة المرور الحالية غير صحيحة" }, 400);
  if (!next || String(next).length < 6) return json({ error: "كلمة المرور الجديدة 6 خانات على الأقل" }, 400);
  all[me.id].hash = await hashPassword(String(next));
  await saveUsers(env, all);
  return json({ ok: true });
}

const ROUTES = {
  "/api/login": { POST: login },
  "/api/logout": { POST: async () => json({ ok: true }, 200, { "set-cookie": clearCookie() }) },
  "/api/me": {
    GET: async (req, env) => {
      const u = await requireUser(env, req);
      return u instanceof Response ? u : json({ user: u });
    },
  },
  "/api/data": { GET: data },
  "/api/upload": { POST: upload },
  "/api/users": { GET: users, POST: users, DELETE: users },
  "/api/password": { POST: password },
};

// Handle one API request. `path` is the API path such as "/api/login".
export async function handle(req, env, path) {
  const route = ROUTES[path];
  if (!route) return json({ error: "غير موجود" }, 404);
  const fn = route[req.method];
  if (!fn) return json({ error: "طريقة غير مسموحة" }, 405);
  if (req.method !== "GET" && !sameOrigin(req)) return json({ error: "طلب غير مسموح" }, 403);
  let res;
  try {
    res = await fn(req, env);
  } catch (e) {
    console.error(e);
    res = json({ error: "خطأ في الخادم" }, 500);
  }
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}
