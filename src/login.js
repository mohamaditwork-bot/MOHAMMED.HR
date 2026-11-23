// Login flow: password → (forced strong password) → (2FA setup) → 2FA code → full session.
import {
  json, getUsers, saveUsers, hashPassword, verifyPassword, isLocked, recordFail, clearFails,
  sessionCookie, clearCookie, requireUser, uaHash, clientIp,
} from "./auth.js";
import { newSecret, verifyTotp, otpauthUrl, newBackupCodes, useBackupCode } from "./totp.js";
import { sendMail } from "./alerts.js";

const ID_RE = /^\d{5,15}$/;
const readJson = (req) => req.json().catch(() => null);

// ---------- rate limit per IP (sliding 15-minute window) ----------
export async function rateLimited(env, req, bucket, max = 30) {
  const ip = clientIp(req) || "unknown";
  const key = `rl:${bucket}:${ip}`;
  const r = (await env.HR.get(key, "json")) || { n: 0, t: Date.now() };
  if (Date.now() - r.t > 15 * 60e3) { r.n = 0; r.t = Date.now(); }
  r.n++;
  await env.HR.put(key, JSON.stringify(r), { expirationTtl: 1800 });
  return r.n > max;
}
const tooMany = () => json({ error: "محاولات كثيرة من هذا الجهاز — انتظر 15 دقيقة" }, 429);

// Strong password: 10+ chars, letters and digits, not the ID number.
export function weakPassword(pw, id) {
  const p = String(pw || "");
  if (p.length < 10) return "كلمة المرور 10 خانات على الأقل";
  if (!/[A-Za-z؀-ۿ]/.test(p) || !/\d/.test(p)) return "لازم تحتوي حروف وأرقام";
  if (p.includes(String(id)) || /^(\d)\1+$/.test(p)) return "ما ينفع تكون فيها رقم الهوية";
  return null;
}

const nextStage = (u) => (u.must_change ? "pw" : !u.totp?.on ? "setup" : "full");

async function notifyOwner(env, settings, subject, lines) {
  try {
    await sendMail(env, settings, {
      to: settings.owner_email, subject,
      html: `<div dir="rtl" style="font-family:Tahoma,Arial;font-size:14px">${lines.map((l) => `<p>${String(l).replace(/[<>&]/g, "")}</p>`).join("")}<p style="color:#888;font-size:12px">تنبيه أمني آلي — منصة الموارد البشرية</p></div>`,
    });
  } catch (e) { console.error("notify failed", e); }
}

export function loginRoutes({ audit, getSettings }) {
  async function login(req, env) {
    if (await rateLimited(env, req, "login", 30)) return tooMany();
    const body = await readJson(req);
    if (!body) return json({ error: "بيانات غير صحيحة" }, 400);
    const id = String(body.id || "").trim();
    const password = String(body.password || "");
    if (!ID_RE.test(id) || !password) return json({ error: "اكتب رقم الهوية وكلمة المرور" }, 400);
    const until = await isLocked(env, id);
    if (until) return json({ error: `تم إيقاف الدخول مؤقتًا بسبب محاولات خاطئة. حاول بعد ${Math.ceil((until - Date.now()) / 60e3)} دقيقة` }, 429);
    const all = await getUsers(env);
    const u = all[id];
    if (!u || !(await verifyPassword(password, u.hash))) {
      await recordFail(env, id);
      const fails = ((await env.HR.get(`lock:${id}`, "json")) || {}).fails || 0;
      if (u && (fails === 3 || (await isLocked(env, id)))) {
        await notifyOwner(env, await getSettings(env), "⚠️ محاولات دخول خاطئة", [`محاولات خاطئة على حساب ${u.name} (${id.slice(-4).padStart(id.length, "•")})`, `IP: ${clientIp(req) || "-"}`, `الوقت: ${new Date().toISOString()}`]);
      }
      await audit(env, { id, name: u?.name || "?", ip: clientIp(req) }, "login_failed");
      return json({ error: "رقم الهوية أو كلمة المرور غير صحيحة" }, 401);
    }
    await clearFails(env, id);
    if (password === id || weakPassword(password, id)) { u.must_change = true; await saveUsers(env, all); }
    const st = u.must_change ? "pw" : u.totp?.on ? "2fa" : "setup";
    await audit(env, { id, name: u.name, ip: clientIp(req) }, "login_password_ok", null, null, { next: st });
    return json({ ok: true, next: st, user: { id, name: u.name, role: u.role } }, 200, { "set-cookie": await sessionCookie(env, id, Date.now(), { st, sv: u.sv || 0, ua: await uaHash(req) }) });
  }

  async function me(req, env, extras) {
    const u = await requireUser(env, req, { stages: ["full", "pw", "setup", "2fa"] });
    if (u instanceof Response) return u;
    return json({ user: { id: u.id, name: u.name, role: u.role }, stage: u.st, ...(u.st === "full" ? extras(env) : {}) });
  }

  async function password(req, env) {
    const u = await requireUser(env, req, { stages: ["full", "pw"] });
    if (u instanceof Response) return u;
    if (await rateLimited(env, req, "pw", 20)) return tooMany();
    const { current, next, logout_all } = (await readJson(req)) || {};
    const all = await getUsers(env);
    const rec = all[u.id];
    if (logout_all && !next) {
      rec.sv = (rec.sv || 0) + 1;
      await saveUsers(env, all);
      await audit(env, u, "logout_all");
      return json({ ok: true }, 200, { "set-cookie": clearCookie() });
    }
    if (!(await verifyPassword(String(current || ""), rec.hash))) return json({ error: "كلمة المرور الحالية غير صحيحة" }, 400);
    const weak = weakPassword(next, u.id);
    if (weak) return json({ error: weak }, 400);
    rec.hash = await hashPassword(String(next));
    rec.must_change = false;
    rec.sv = (rec.sv || 0) + 1; // signs out every other device
    await saveUsers(env, all);
    await audit(env, u, "password_change");
    const st = nextStage(rec);
    return json({ ok: true, next: st }, 200, { "set-cookie": await sessionCookie(env, u.id, Date.now(), { st, sv: rec.sv, ua: await uaHash(req) }) });
  }

  // GET: start setup (secret + otpauth URL). POST {action: confirm|verify, code}
  async function twofa(req, env) {
    const u = await requireUser(env, req, { stages: ["setup", "2fa"] });
    if (u instanceof Response) return u;
    const all = await getUsers(env);
    const rec = all[u.id];
    if (req.method === "GET") {
      if (u.st !== "setup") return json({ error: "غير متاح" }, 400);
      rec.totp_pending = newSecret();
      await saveUsers(env, all);
      return json({ secret: rec.totp_pending, url: otpauthUrl(rec.totp_pending, `${rec.name} (${u.id.slice(-4)})`) });
    }
    if (await rateLimited(env, req, "2fa", 40)) return tooMany();
    const lockKey = `2fa:${u.id}`;
    const until = await isLocked(env, lockKey);
    if (until) return json({ error: `محاولات كثيرة — حاول بعد ${Math.ceil((until - Date.now()) / 60e3)} دقيقة` }, 429);
    const { action, code } = (await readJson(req)) || {};
    const ua = await uaHash(req);
    if (action === "confirm" && u.st === "setup") {
      const step = await verifyTotp(rec.totp_pending, code);
      if (step < 0) { await recordFail(env, lockKey); return json({ error: "الرمز غير صحيح — تأكد من وقت الجوال" }, 400); }
      const b = await newBackupCodes();
      rec.totp = { on: true, secret: rec.totp_pending, last: step };
      rec.backup = b.hashes;
      delete rec.totp_pending;
      rec.devices = [...new Set([...(rec.devices || []), ua])].slice(-10);
      await saveUsers(env, all);
      await clearFails(env, lockKey);
      await audit(env, u, "2fa_enabled");
      return json({ ok: true, backup_codes: b.codes }, 200, { "set-cookie": await sessionCookie(env, u.id, Date.now(), { st: "full", sv: rec.sv || 0, ua }) });
    }
    if (action === "verify" && u.st === "2fa") {
      let ok = false, how = "totp";
      const step = await verifyTotp(rec.totp?.secret, code, rec.totp?.last ?? -1);
      if (step >= 0) { ok = true; rec.totp.last = step; }
      else {
        const i = await useBackupCode(rec.backup, code);
        if (i >= 0) { ok = true; how = "backup"; rec.backup.splice(i, 1); }
      }
      if (!ok) { await recordFail(env, lockKey); await audit(env, u, "2fa_failed"); return json({ error: "الرمز غير صحيح" }, 400); }
      const known = (rec.devices || []).includes(ua);
      rec.devices = [...new Set([...(rec.devices || []), ua])].slice(-10);
      await saveUsers(env, all);
      await clearFails(env, lockKey);
      await audit(env, u, "login", null, null, { how, new_device: !known });
      if (!known && rec.role === "admin") {
        await notifyOwner(env, await getSettings(env), "🔐 دخول من جهاز جديد", [`تم الدخول لحساب ${rec.name} من جهاز/متصفح جديد.`, `IP: ${clientIp(req) || "-"}`, `الجهاز: ${(req.headers.get("user-agent") || "").slice(0, 160)}`, `الوقت: ${new Date().toISOString()}`, "إذا ما كان أنت: غيّر كلمة المرور فورًا."]);
      }
      return json({ ok: true, backup_left: (rec.backup || []).length }, 200, { "set-cookie": await sessionCookie(env, u.id, Date.now(), { st: "full", sv: rec.sv || 0, ua }) });
    }
    return json({ error: "طلب غير صحيح" }, 400);
  }

  return { login, me, password, twofa };
}
