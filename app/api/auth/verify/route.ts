import { getPushAdapter } from "../../../../lib/push/adapters";
import type { PushProvider } from "../../../../lib/push/types";
import { endpointHash, encrypt, id, runtime, sessionHash, sha256, token } from "../../../../lib/server/crypto";
import { errorResponse, json, sessionCookie } from "../../../../lib/server/auth";

export async function POST(request: Request) {
  try {
    const input = await request.json() as { provider?: PushProvider; endpoint?: string; code?: string; displayName?: string };
    if (!input.provider || !input.endpoint || !/^\d{6}$/.test(input.code ?? "")) return json({ error: "请输入有效的 6 位验证码" }, 400);
    const endpoint = getPushAdapter(input.provider).normalizeEndpoint(input.endpoint);
    const hash = await endpointHash(input.provider, endpoint);
    const challenge = await runtime.DB.prepare("SELECT id, code_hash FROM login_challenges WHERE provider = ? AND endpoint_hash = ? AND expires_at > unixepoch() AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(input.provider, hash).first<{ id: string; code_hash: string }>();
    if (!challenge || challenge.code_hash !== await sha256(input.code!)) return json({ error: "验证码错误或已过期" }, 400);
    let existing = await runtime.DB.prepare("SELECT user_id, id FROM push_endpoints WHERE provider = ? AND endpoint_hash = ? LIMIT 1").bind(input.provider, hash).first<{ user_id: string; id: string }>();
    const userId = existing?.user_id ?? id("usr");
    const endpointId = existing?.id ?? id("ep");
    const displayName = (input.displayName?.trim() || `${input.provider.toUpperCase()} 用户`).slice(0, 40);
    const statements = [runtime.DB.prepare("UPDATE login_challenges SET consumed_at = unixepoch() WHERE id = ?").bind(challenge.id)];
    if (!existing) {
      statements.push(runtime.DB.prepare("INSERT INTO users (id, display_name, status, created_at, updated_at) VALUES (?, ?, 'active', unixepoch(), unixepoch())").bind(userId, displayName));
      statements.push(runtime.DB.prepare("INSERT INTO push_endpoints (id, user_id, provider, endpoint_ciphertext, endpoint_hash, label, verified_at, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch(), 1, unixepoch(), unixepoch())").bind(endpointId, userId, input.provider, await encrypt(endpoint), hash, `${input.provider.toUpperCase()} 默认终端`));
    }
    const rawSession = token();
    statements.push(runtime.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at, created_at) VALUES (?, ?, ?, unixepoch() + 2592000, unixepoch(), unixepoch())").bind(id("ses"), userId, await sessionHash(rawSession)));
    await runtime.DB.batch(statements);
    return json({ ok: true, user: { id: userId, displayName, provider: input.provider } }, 200, { "set-cookie": sessionCookie(rawSession) });
  } catch (error) { return errorResponse(error); }
}
