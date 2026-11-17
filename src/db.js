// Database access: Postgres (Neon) in production, PGlite for local tests.
// Exposes one function: query(text, params) -> rows.
import { neon } from "@neondatabase/serverless";
import { SCHEMA_SQL } from "./schema.js";

let db;
let ready;

function connectionString(env) {
  return env.DATABASE_URL || env.POSTGRES_URL || env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING;
}

export async function getDb(env) {
  if (!db) {
    if (env.PGLITE_DIR) {
      // Local development/testing only.
      const { PGlite } = await import("@electric-sql/pglite");
      const pg = new PGlite(env.PGLITE_DIR);
      db = { query: async (text, params = []) => (await pg.query(text, params)).rows, exec: (sql) => pg.exec(sql) };
    } else {
      const url = connectionString(env);
      if (!url) throw new Error("Database is not connected (DATABASE_URL missing)");
      const sql = neon(url);
      db = {
        query: (text, params = []) => sql.query(text, params),
        // Neon's HTTP driver runs one statement per call.
        exec: async (script) => {
          for (const stmt of script.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await sql.query(stmt);
        },
      };
    }
  }
  if (!ready) {
    ready = db.exec(SCHEMA_SQL).catch((e) => {
      ready = null;
      throw e;
    });
  }
  await ready;
  return db;
}

// Key-value store on top of Postgres, used for users, login lockout and settings.
export function kvStore(env) {
  return {
    async get(key, type) {
      const d = await getDb(env);
      const rows = await d.query("SELECT value FROM kv WHERE key = $1 AND (expires_at IS NULL OR expires_at > now())", [key]);
      if (!rows.length) return null;
      return type === "json" ? JSON.parse(rows[0].value) : rows[0].value;
    },
    async put(key, value, opts = {}) {
      const d = await getDb(env);
      const exp = opts.expirationTtl ? new Date(Date.now() + opts.expirationTtl * 1000).toISOString() : null;
      await d.query(
        "INSERT INTO kv(key, value, expires_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at",
        [key, String(value), exp]
      );
    },
    async delete(key) {
      const d = await getDb(env);
      await d.query("DELETE FROM kv WHERE key = $1", [key]);
    },
  };
}
