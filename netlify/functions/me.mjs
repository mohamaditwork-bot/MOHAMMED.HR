import { requireUser, json } from "../lib/auth.mjs";

export default async (req) => {
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  return json({ user: u });
};

export const config = { path: "/api/me", method: "GET" };
