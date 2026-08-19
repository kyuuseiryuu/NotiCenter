import { json } from "./auth";
import { runtime } from "./crypto";

const encoder = new TextEncoder();
const cookieName = "noticenter_admin";
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));

function cookie(request: Request) {
  const item = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`));
  return item ? decodeURIComponent(item.slice(cookieName.length + 1)) : null;
}

async function key(secret: string) { return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }

export async function verifyAdminToken(candidate: string) {
  const expected = runtime.ADMIN_TOKEN;
  if (!expected || !candidate) return false;
  const message = encoder.encode("noticenter-admin-token-check");
  const signature = await crypto.subtle.sign("HMAC", await key(candidate), message);
  return crypto.subtle.verify("HMAC", await key(expected), signature, message);
}

export async function adminSessionCookie() {
  const secret = runtime.ADMIN_TOKEN;
  if (!secret) throw new Error("服务端缺少 ADMIN_TOKEN");
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 8;
  const signature = base64url(new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(String(expires)))));
  return `${cookieName}=${encodeURIComponent(`${expires}.${signature}`)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${60 * 60 * 8}`;
}

export async function requireAdminToken(request: Request) {
  const secret = runtime.ADMIN_TOKEN;
  const value = cookie(request);
  if (!secret || !value) throw json({ error: "需要验证 Admin Token" }, 401);
  const [expires, signature] = value.split(".");
  if (!expires || !signature || Number(expires) <= Date.now() / 1000) throw json({ error: "Admin Token 会话已过期" }, 401);
  let valid = false;
  try { valid = await crypto.subtle.verify("HMAC", await key(secret), fromBase64url(signature), encoder.encode(expires)); }
  catch { valid = false; }
  if (!valid) throw json({ error: "Admin Token 无效" }, 401);
}
