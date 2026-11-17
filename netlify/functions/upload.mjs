import { requireUser, store, json, sameOrigin } from "../lib/auth.mjs";
import { parseWorkbook } from "../lib/parse.mjs";

const MAX_BYTES = 4 * 1024 * 1024;

export default async (req) => {
  if (!sameOrigin(req)) return json({ error: "طلب غير مسموح" }, 403);
  const u = await requireUser(req, { admin: true });
  if (u instanceof Response) return u;

  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return json({ error: "الملف فاضي" }, 400);
  if (buf.length > MAX_BYTES) return json({ error: "الملف أكبر من 4 ميجا" }, 413);
  // xlsx files are zip archives ("PK")
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) return json({ error: "الملف لازم يكون Excel بصيغة xlsx" }, 400);

  let parsed;
  try {
    parsed = parseWorkbook(buf);
  } catch (e) {
    return json({ error: "تعذر قراءة الملف: " + e.message }, 400);
  }
  const fileName = decodeURIComponent(req.headers.get("x-file-name") || "") || null;
  parsed.meta.fileName = fileName;
  parsed.meta.uploadedAt = new Date().toISOString();
  parsed.meta.uploadedBy = u.name;
  await store().set("dataset", JSON.stringify(parsed));
  return json({ ok: true, sheets: parsed.sheets.map((s) => ({ name: s.name, rows: s.rows.length })) });
};

export const config = { path: "/api/upload", method: "POST" };
