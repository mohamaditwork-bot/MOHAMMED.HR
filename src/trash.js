// Recycle bin: anything deleted is first copied here (with its linked rows)
// so it can be restored later.
import { getDb } from "./db.js";

// Rows that disappear with an employee (ON DELETE CASCADE).
const CHILDREN = ["documents", "dependents", "leaves", "movements", "appraisals"];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const label = (r) => r?.name_ar || r?.name || r?.title || r?.member_name || r?.file_name || r?.doc_type || null;

async function snapshot(db, table, id) {
  if (table === "attachments") {
    const r = await db.query("SELECT id, employee_id, document_id, file_name, mime, size, uploaded_by, created_at, encode(data, 'base64') AS data_b64 FROM attachments WHERE id = $1", [id]);
    return r[0] ? { row: r[0], related: {} } : null;
  }
  const r = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  if (!r[0]) return null;
  const related = {};
  if (table === "employees") {
    for (const c of CHILDREN) related[c] = await db.query(`SELECT * FROM ${c} WHERE employee_id = $1`, [id]);
    related.attachments = await db.query("SELECT id, employee_id, document_id, file_name, mime, size, uploaded_by, created_at, encode(data, 'base64') AS data_b64 FROM attachments WHERE employee_id = $1", [id]);
  }
  if (table === "documents") {
    related.attachments = await db.query("SELECT id, employee_id, document_id, file_name, mime, size, uploaded_by, created_at, encode(data, 'base64') AS data_b64 FROM attachments WHERE document_id = $1", [id]);
  }
  return { row: r[0], related };
}

// Copy a row (and what would be lost with it) into the bin. Call before DELETE.
export async function toTrash(db, table, id, user) {
  const snap = await snapshot(db, table, id);
  if (!snap) return null;
  const extra = Object.values(snap.related).reduce((s, a) => s + a.length, 0);
  await db.query(
    "INSERT INTO trash (entity, entity_id, label, data, extra_count, deleted_by) VALUES ($1,$2,$3,$4,$5,$6)",
    [table, String(id), label(snap.row), JSON.stringify(snap), extra, user?.name || null]
  );
  return snap;
}

const isObj = (v) => v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v);
async function insertRow(db, table, row) {
  const r = { ...row };
  let b64 = null;
  if (table === "attachments") { b64 = r.data_b64; delete r.data_b64; }
  const cols = Object.keys(r);
  const vals = cols.map((c) => (isObj(r[c]) || Array.isArray(r[c]) ? JSON.stringify(r[c]) : r[c]));
  const ph = cols.map((_, i) => "$" + (i + 1));
  if (b64 !== null) { cols.push("data"); ph.push(`decode($${vals.length + 1}, 'base64')`); vals.push(b64); }
  await db.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${ph.join(",")}) ON CONFLICT (id) DO NOTHING`, vals);
}

// Bring back an employee removed by mistake (by ID/iqama number): their latest full copy in the bin
// is restored with everything that went with it, and any "left" markers for them are dropped.
export async function restoreFromTrash(db, idNo) {
  const rows = await db.query(
    "SELECT id, data FROM trash WHERE entity = 'employees' AND data->'row'->>'id_no' = $1 ORDER BY deleted_at DESC", [String(idNo)]);
  let restored = null;
  for (const t of rows) {
    const snap = typeof t.data === "string" ? JSON.parse(t.data) : t.data;
    if (!snap?.marker && !restored) {
      await insertRow(db, "employees", snap.row);
      for (const c of [...CHILDREN, "attachments"]) for (const r of snap.related?.[c] || []) await insertRow(db, c, r);
      restored = snap.row;
    }
    await db.query("DELETE FROM trash WHERE id = $1", [t.id]);
  }
  return restored;
}

// /api/trash — GET list, POST {id} restore, DELETE {id} purge (admin).
export async function trashRoute(req, env, user, audit) {
  const db = await getDb(env);
  if (req.method === "GET") {
    const rows = await db.query("SELECT id, entity, entity_id, label, extra_count, deleted_by, deleted_at FROM trash ORDER BY deleted_at DESC LIMIT 500");
    return json({ rows: rows.map((r) => ({ ...r, deleted_at: r.deleted_at instanceof Date ? r.deleted_at.toISOString() : r.deleted_at })) });
  }
  const body = await req.json().catch(() => null);
  const id = parseInt(body?.id, 10);
  if (!id) return json({ error: "رقم السجل مفقود" }, 400);
  const t = (await db.query("SELECT * FROM trash WHERE id = $1", [id]))[0];
  if (!t) return json({ error: "غير موجود في السلة" }, 404);
  if (req.method === "DELETE") {
    if (user.role !== "admin") return json({ error: "الحذف النهائي للمدير فقط" }, 403);
    await db.query("DELETE FROM trash WHERE id = $1", [id]);
    await audit(env, user, "purge", t.entity, t.entity_id, { label: t.label });
    return json({ ok: true });
  }
  const snap = typeof t.data === "string" ? JSON.parse(t.data) : t.data;
  // A "left" marker from manual corrections: restoring just lets the next import add the person again.
  if (snap?.marker) {
    await db.query("DELETE FROM trash WHERE id = $1", [id]);
    await audit(env, user, "restore", t.entity, t.entity_id, { label: t.label });
    return json({ ok: true });
  }
  try {
    await insertRow(db, t.entity, snap.row);
    for (const c of [...CHILDREN, "attachments"]) for (const r of snap.related?.[c] || []) await insertRow(db, c, r);
  } catch (e) {
    const msg = String(e.message || e);
    return json({ error: /unique|duplicate/i.test(msg) ? "ما ينفع الاسترجاع: فيه سجل جديد بنفس الرقم (هوية/إقامة). احذفه أو عدّله أول." : "تعذر الاسترجاع: " + msg }, 400);
  }
  await db.query("DELETE FROM trash WHERE id = $1", [id]);
  await audit(env, user, "restore", t.entity, t.entity_id, { label: t.label });
  return json({ ok: true });
}
