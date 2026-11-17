// Vercel function: every /api/* request is rewritten here (see vercel.json).
import { handle } from "../src/routes.js";
import { kvStore } from "../src/db.js";

async function serve(request) {
  const url = new URL(request.url);
  // The rewrite passes the route as ?route=; fall back to the original path if it is kept.
  const raw = url.searchParams.get("route") || url.pathname.replace(/^\/api\//, "");
  const route = raw.replace(/[^a-z]/g, "");
  const env = { ...process.env };
  env.HR = kvStore(env);
  return handle(request, env, "/api/" + route);
}

export const GET = serve;
export const POST = serve;
export const PUT = serve;
export const DELETE = serve;

// Allow time for AI answers and Excel imports.
export const config = { maxDuration: 120 };
