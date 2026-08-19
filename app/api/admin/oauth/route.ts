import { errorResponse, json, requireAdmin } from "../../../../lib/server/auth";
import { encrypt, id, runtime } from "../../../../lib/server/crypto";

const presets = {
  github: { authorizationUrl: "https://github.com/login/oauth/authorize", tokenUrl: "https://github.com/login/oauth/access_token", userInfoUrl: "https://api.github.com/user", scopes: "read:user user:email" },
  logto: { authorizationUrl: "/oidc/auth", tokenUrl: "/oidc/token", userInfoUrl: "/oidc/me", scopes: "openid profile email" },
  oidc: { authorizationUrl: "", tokenUrl: "", userInfoUrl: "", scopes: "openid profile email" },
};

export async function GET(request: Request) {
  try { await requireAdmin(request); const result = await runtime.DB.prepare("SELECT id, type, name, slug, client_id, issuer, authorization_url, token_url, user_info_url, scopes, enabled, created_at, updated_at FROM oauth_providers ORDER BY created_at DESC").all(); return json({ providers: result.results }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const input = await request.json() as Record<string, string | boolean> & { type?: keyof typeof presets };
    const type = input.type && presets[input.type] ? input.type : "oidc";
    const preset = presets[type];
    const issuer = String(input.issuer ?? "").trim().replace(/\/$/, "");
    const resolve = (value: unknown, fallback: string) => { const raw = String(value || fallback); return raw.startsWith("/") && issuer ? issuer + raw : raw; };
    const name = String(input.name || (type === "github" ? "GitHub" : type === "logto" ? "Logto" : "OIDC")).trim().slice(0, 60);
    const slug = String(input.slug || name).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    if (!slug || !input.clientId || !input.clientSecret) return json({ error: "名称、Client ID 和 Client Secret 不能为空" }, 400);
    const urls = { authorizationUrl: resolve(input.authorizationUrl, preset.authorizationUrl), tokenUrl: resolve(input.tokenUrl, preset.tokenUrl), userInfoUrl: resolve(input.userInfoUrl, preset.userInfoUrl) };
    for (const value of Object.values(urls)) { const url = new URL(value); if (url.protocol !== "https:") return json({ error: "OAuth 端点必须使用 HTTPS" }, 400); }
    const providerId = id("oauth");
    await runtime.DB.batch([
      runtime.DB.prepare(`INSERT INTO oauth_providers (id, type, name, slug, client_id, client_secret_ciphertext, issuer, authorization_url, token_url, user_info_url, scopes, enabled, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`).bind(providerId, type, name, slug, String(input.clientId), await encrypt(String(input.clientSecret)), issuer || null, urls.authorizationUrl, urls.tokenUrl, urls.userInfoUrl, String(input.scopes || preset.scopes), input.enabled === false ? 0 : 1, admin.id),
      runtime.DB.prepare("INSERT INTO audit_logs (id, actor_user_id, action, resource_type, resource_id, metadata_json, created_at) VALUES (?, ?, 'oauth.create', 'oauth_provider', ?, ?, unixepoch())").bind(id("aud"), admin.id, providerId, JSON.stringify({ type, slug })),
    ]);
    return json({ ok: true, id: providerId }, 201);
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try { const admin = await requireAdmin(request); const input = await request.json() as { id?: string }; const result = await runtime.DB.prepare("DELETE FROM oauth_providers WHERE id = ?").bind(input.id).run(); if (!result.meta.changes) return json({ error: "配置不存在" }, 404); await runtime.DB.prepare("INSERT INTO audit_logs (id, actor_user_id, action, resource_type, resource_id, metadata_json, created_at) VALUES (?, ?, 'oauth.delete', 'oauth_provider', ?, '{}', unixepoch())").bind(id("aud"), admin.id, input.id).run(); return json({ ok: true }); }
  catch (error) { return errorResponse(error); }
}
