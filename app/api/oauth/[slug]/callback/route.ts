import { errorResponse, getUser, sessionCookie } from "../../../../../lib/server/auth";
import { decrypt, id, runtime, sessionHash, sha256, token } from "../../../../../lib/server/crypto";

const profileRedirect = (request: Request, message: string, ok = false) => Response.redirect(`${new URL(request.url).origin}/profile?oauth=${ok ? "success" : "error"}&message=${encodeURIComponent(message)}`, 302);
const loginRedirect = (request: Request, message: string, ok = false, cookie?: string) => new Response(null, { status: 302, headers: { location: `${new URL(request.url).origin}/?oauth_login=${ok ? "success" : "error"}&message=${encodeURIComponent(message)}`, ...(cookie ? { "set-cookie": cookie } : {}) } });

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const user = await getUser(request); const url = new URL(request.url); const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
    if (!code || !state) return user ? profileRedirect(request, url.searchParams.get("error_description") || "OAuth 授权未完成") : loginRedirect(request, url.searchParams.get("error_description") || "OAuth 授权未完成");
    const slug = (await context.params).slug;
    const stateHash = await sha256(state);
    let mode: "binding" | "login" = "binding";
    let row = user ? await runtime.DB.prepare(`SELECT s.id AS state_id, s.verifier_ciphertext, p.id AS provider_id, p.type, p.client_id, p.client_secret_ciphertext, p.token_url, p.user_info_url
      FROM oauth_binding_states s JOIN oauth_providers p ON p.id = s.provider_id
      WHERE s.user_id = ? AND s.state_hash = ? AND s.consumed_at IS NULL AND s.expires_at > unixepoch() AND p.slug = ? AND p.enabled = 1 LIMIT 1`)
      .bind(user.id, stateHash, slug).first<Record<string, string>>() : null;
    if (!row) {
      mode = "login";
      row = await runtime.DB.prepare(`SELECT s.id AS state_id, s.verifier_ciphertext, p.id AS provider_id, p.type, p.client_id, p.client_secret_ciphertext, p.token_url, p.user_info_url
        FROM oauth_login_states s JOIN oauth_providers p ON p.id = s.provider_id
        WHERE s.state_hash = ? AND s.consumed_at IS NULL AND s.expires_at > unixepoch() AND p.slug = ? AND p.enabled = 1 LIMIT 1`).bind(stateHash, slug).first<Record<string, string>>();
    }
    if (!row) return user ? profileRedirect(request, "OAuth 状态无效或已经过期") : loginRedirect(request, "OAuth 状态无效或已经过期");
    const stateTable = mode === "binding" ? "oauth_binding_states" : "oauth_login_states";
    const consumed = await runtime.DB.prepare(`UPDATE ${stateTable} SET consumed_at = unixepoch() WHERE id = ? AND consumed_at IS NULL`).bind(row.state_id).run();
    if (!consumed.meta.changes) return mode === "binding" ? profileRedirect(request, "OAuth 状态已被使用") : loginRedirect(request, "OAuth 状态已被使用");

    const redirectUri = `${url.origin}/api/oauth/${slug}/callback`;
    const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: row.client_id, client_secret: await decrypt(row.client_secret_ciphertext), code_verifier: await decrypt(row.verifier_ciphertext) });
    const tokenResponse = await fetch(row.token_url, { method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body });
    const tokenData = await tokenResponse.json() as { access_token?: string; token_type?: string; error_description?: string; error?: string };
    if (!tokenResponse.ok || !tokenData.access_token) return mode === "binding" ? profileRedirect(request, tokenData.error_description || tokenData.error || "OAuth Token 交换失败") : loginRedirect(request, tokenData.error_description || tokenData.error || "OAuth Token 交换失败");
    const profileResponse = await fetch(row.user_info_url, { headers: { authorization: `${tokenData.token_type || "Bearer"} ${tokenData.access_token}`, accept: "application/json", "user-agent": "NotiCenter" } });
    const profile = await profileResponse.json() as Record<string, unknown>;
    if (!profileResponse.ok) return mode === "binding" ? profileRedirect(request, "无法读取社交账户资料") : loginRedirect(request, "无法读取社交账户资料");
    const subject = String(row.type === "github" ? profile.id ?? "" : profile.sub ?? "");
    if (!subject) return mode === "binding" ? profileRedirect(request, "OAuth 用户资料缺少唯一 ID") : loginRedirect(request, "OAuth 用户资料缺少唯一 ID");
    const existing = await runtime.DB.prepare("SELECT user_id FROM oauth_identities WHERE provider_id = ? AND provider_subject = ? LIMIT 1").bind(row.provider_id, subject).first<{ user_id: string }>();
    if (mode === "login") {
      if (!existing) return loginRedirect(request, "这个社交账户尚未绑定，请先用通知地址登录并在个人中心完成绑定");
      const account = await runtime.DB.prepare("SELECT id FROM users WHERE id = ? AND status = 'active' LIMIT 1").bind(existing.user_id).first();
      if (!account) return loginRedirect(request, "账号不存在或已停用");
      const rawSession = token();
      await runtime.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at, created_at) VALUES (?, ?, ?, unixepoch() + 2592000, unixepoch(), unixepoch())").bind(id("ses"), existing.user_id, await sessionHash(rawSession)).run();
      return loginRedirect(request, "社交账号登录成功", true, sessionCookie(rawSession));
    }
    if (!user) return loginRedirect(request, "登录状态已失效，请重新登录");
    if (existing && existing.user_id !== user.id) return profileRedirect(request, "这个社交账户已经绑定到其他用户");
    const username = String(profile.login ?? profile.preferred_username ?? profile.name ?? "").slice(0, 120) || null;
    const email = String(profile.email ?? "").slice(0, 254) || null;
    const profileUrl = String(profile.html_url ?? profile.profile ?? "").slice(0, 500) || null;
    const avatarUrl = String(profile.avatar_url ?? profile.picture ?? "").slice(0, 500) || null;
    await runtime.DB.prepare(`INSERT INTO oauth_identities (id, user_id, provider_id, provider_subject, username, email, profile_url, avatar_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
      ON CONFLICT(user_id, provider_id) DO UPDATE SET provider_subject = excluded.provider_subject, username = excluded.username, email = excluded.email, profile_url = excluded.profile_url, avatar_url = excluded.avatar_url, updated_at = unixepoch()`)
      .bind(id("oid"), user.id, row.provider_id, subject, username, email, profileUrl, avatarUrl).run();
    return profileRedirect(request, "社交账户绑定成功", true);
  } catch (error) {
    if (error instanceof Response) return error;
    try { return profileRedirect(request, error instanceof Error ? error.message : "OAuth 绑定失败"); } catch { return errorResponse(error); }
  }
}
