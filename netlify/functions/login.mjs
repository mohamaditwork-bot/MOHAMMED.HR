import { getUsers, verifyPassword, isLocked, recordFail, clearFails, sessionCookie, json, sameOrigin } from "../lib/auth.mjs";

export default async (req) => {
  if (!sameOrigin(req)) return json({ error: "طلب غير مسموح" }, 403);
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "بيانات غير صحيحة" }, 400);
  }
  const id = String(body.id || "").trim();
  const password = String(body.password || "");
  if (!/^\d{5,15}$/.test(id) || !password) return json({ error: "اكتب رقم الهوية وكلمة المرور" }, 400);

  const until = await isLocked(id);
  if (until) {
    const mins = Math.ceil((until - Date.now()) / 60e3);
    return json({ error: `تم إيقاف الدخول مؤقتًا بسبب محاولات خاطئة. حاول بعد ${mins} دقيقة` }, 429);
  }

  const users = await getUsers();
  const u = users[id];
  if (!u || !verifyPassword(password, u.hash)) {
    await recordFail(id);
    return json({ error: "رقم الهوية أو كلمة المرور غير صحيحة" }, 401);
  }
  await clearFails(id);
  return json({ ok: true, user: { id, name: u.name, role: u.role } }, 200, { "set-cookie": sessionCookie({ id }) });
};

export const config = { path: "/api/login", method: "POST" };
