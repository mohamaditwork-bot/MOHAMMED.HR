// Vercel function: every /api/* request is rewritten here (see vercel.json).
import { handle } from "../src/routes.js";
import { upstashStore } from "../src/store.js";

let store;

async function serve(request) {
  const url = new URL(request.url);
  // The rewrite passes the route as ?route=; fall back to the original path if it is kept.
  const raw = url.searchParams.get("route") || url.pathname.replace(/^\/api\//, "");
  const route = raw.replace(/[^a-z]/g, "");
  const env = {
    SESSION_SECRET: process.env.SESSION_SECRET,
    HR_USERS_SEED: process.env.HR_USERS_SEED,
  };
  store ||= upstashStore(process.env);
  env.HR = store;
  return handle(request, env, "/api/" + route);
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;
