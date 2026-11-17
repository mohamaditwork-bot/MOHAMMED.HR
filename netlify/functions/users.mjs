import { requireUser, getUsers, saveUsers, hashPassword, json, sameOrigin, clearFails } from "../lib/auth.mjs";

export default async (req) => {
  const me = await requireUser(req, { admin: true });
  if (me instanceof Response) return me;
  const users = await getUsers();
  const list = () =>
    json({ users: Object.entries(users).map(([id, u]) => ({ id, name: u.name, role: u.role })) });

  if (req.method === "GET") return list();
  if (!sameOrigin(req)) return json({ error: "طلب غير مسموح" }, 403);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "بيانات غير صحيحة" }, 400);
  }
  const id = String(body.id || "").trim();
  if (!/^\d{5,15}$/.test(id)) return json({ error: "رقم الهوية غير صحيح" }, 400);

  if (req.method === "DELETE") {
    if (id === me.id) return json({ error: "ما تقدر تحذف حسابك" }, 400);
    delete users[id];
    await saveUsers(users);
    return list();
  }

  // POST: create or update (name / role / password)
  const name = String(body.name || users[id]?.name || "").trim();
  if (!name) return json({ error: "اكتب الاسم" }, 400);
  const role = body.role === "admin" ? "admin" : "viewer";
  const password = body.password ? String(body.password) : null;
  if (!users[id] && !password) return json({ error: "اكتب كلمة المرور" }, 400);
  if (password && password.length < 6) return json({ error: "كلمة المرور 6 خانات على الأقل" }, 400);
  if (id === me.id && role !== "admin") return json({ error: "ما تقدر تشيل صلاحية المدير عن نفسك" }, 400);
  users[id] = { name, role, hash: password ? hashPassword(password) : users[id].hash };
  await saveUsers(users);
  await clearFails(id);
  return list();
};

export const config = { path: "/api/users", method: ["GET", "POST", "DELETE"] };
