import { requireUser, getUsers, saveUsers, hashPassword, verifyPassword, json, sameOrigin } from "../lib/auth.mjs";

export default async (req) => {
  if (!sameOrigin(req)) return json({ error: "طلب غير مسموح" }, 403);
  const me = await requireUser(req);
  if (me instanceof Response) return me;
  const { current, next } = await req.json().catch(() => ({}));
  const users = await getUsers();
  if (!verifyPassword(String(current || ""), users[me.id].hash)) return json({ error: "كلمة المرور الحالية غير صحيحة" }, 400);
  if (!next || String(next).length < 6) return json({ error: "كلمة المرور الجديدة 6 خانات على الأقل" }, 400);
  users[me.id].hash = hashPassword(String(next));
  await saveUsers(users);
  return json({ ok: true });
};

export const config = { path: "/api/password", method: "POST" };
