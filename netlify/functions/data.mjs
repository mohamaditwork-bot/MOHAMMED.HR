import { requireUser, store, json } from "../lib/auth.mjs";

export default async (req) => {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  const data = await store().get("dataset", { type: "text" });
  if (!data) return json({ error: "لا توجد بيانات بعد — يرفع المدير ملف الإكسل من صفحة الإدارة" }, 404);
  return new Response(data, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/data", method: "GET" };
