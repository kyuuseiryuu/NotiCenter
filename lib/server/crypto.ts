import { env } from "cloudflare:workers";

type RuntimeEnv = { DB: D1Database; ENDPOINT_ENCRYPTION_KEY?: string; SESSION_PEPPER?: string; SITE_URL?: string; ADMIN_TOKEN?: string };
export const runtime = env as unknown as RuntimeEnv;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));

export async function sha256(value: string) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function encryptionKey() {
  const secret = runtime.ENDPOINT_ENCRYPTION_KEY;
  if (!secret) throw new Error("服务端缺少 ENDPOINT_ENCRYPTION_KEY");
  return crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", encoder.encode(secret)), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), encoder.encode(value)));
  return `${base64url(iv)}.${base64url(data)}`;
}

export async function decrypt(value: string) {
  const [iv, data] = value.split(".");
  if (!iv || !data) throw new Error("无效的密文");
  return decoder.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64url(iv) }, await encryptionKey(), fromBase64url(data)));
}

export function token(bytes = 32) { return base64url(crypto.getRandomValues(new Uint8Array(bytes))); }
export function id(prefix: string) { return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`; }
export async function endpointHash(provider: string, endpoint: string) { return sha256(`${provider}:${endpoint}`); }
export async function sessionHash(value: string) { return sha256(`${runtime.SESSION_PEPPER ?? ""}:${value}`); }
