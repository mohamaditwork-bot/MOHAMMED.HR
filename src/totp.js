// Time-based one-time codes (RFC 6238) for two-factor login — WebCrypto only.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes) {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s) {
  const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

export const newSecret = () => base32Encode(crypto.getRandomValues(new Uint8Array(20)));

export async function totpAt(secret, counter) {
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, "0");
}

// Returns the matching time step (to block reuse) or -1. Accepts ±1 step (30 s) of clock drift.
// Phones with an Arabic keyboard type ٠١٢… (or Persian ۰۱۲…) — treat them as 0-9.
export const latinDigits = (v) => String(v ?? "").replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

export async function verifyTotp(secret, code, lastStep = -1, now = Date.now()) {
  const c = latinDigits(code).replace(/\s+/g, "");
  if (!/^\d{6}$/.test(c)) return -1;
  const step = Math.floor(now / 30000);
  // ±1 minute: a phone clock a little off still works.
  for (const s of [step, step - 1, step + 1, step - 2, step + 2]) {
    if (s <= lastStep) continue;
    if ((await totpAt(secret, s)) === c) return s;
  }
  return -1;
}

export function otpauthUrl(secret, account, issuer = "Novotel HR") {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// One-time backup codes: shown once, stored as SHA-256 hashes.
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
export async function newBackupCodes(n = 8) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    const b = crypto.getRandomValues(new Uint8Array(5));
    const s = base32Encode(b).slice(0, 8);
    codes.push(`${s.slice(0, 4)}-${s.slice(4)}`);
  }
  return { codes, hashes: await Promise.all(codes.map((c) => sha(c))) };
}
export async function useBackupCode(hashes, code) {
  const h = await sha(latinDigits(code).toUpperCase().replace(/\s+/g, ""));
  const i = (hashes || []).indexOf(h);
  return i;
}
