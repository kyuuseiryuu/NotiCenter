import { errorResponse, json, requireUser } from "../../../../../lib/server/auth";
import { encrypt, id, runtime, sha256, token } from "../../../../../lib/server/crypto";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireUser(request);
    const provider = await runtime.DB.prepare("SELECT id, client_id, authorization_url, scopes FROM oauth_providers WHERE slug = ? AND enabled = 1 LIMIT 1").bind((await context.params).slug).first<Record<string, string>>();
    if (!provider) return json({ error: "OAuth 配置不存在或未启用" }, 404);
    const state = token(24); const verifier = token(48); const challenge = await sha256(verifier);
    await runtime.DB.prepare("INSERT INTO oauth_binding_states (id, user_id, provider_id, state_hash, verifier_ciphertext, expires_at, created_at) VALUES (?, ?, ?, ?, ?, unixepoch() + 600, unixepoch())")
      .bind(id("oauthst"), user.id, provider.id, await sha256(state), await encrypt(verifier)).run();
    const callback = `${new URL(request.url).origin}/api/oauth/${(await context.params).slug}/callback`;
    const target = new URL(provider.authorization_url);
    target.searchParams.set("response_type", "code"); target.searchParams.set("client_id", provider.client_id); target.searchParams.set("redirect_uri", callback);
    target.searchParams.set("scope", provider.scopes); target.searchParams.set("state", state); target.searchParams.set("code_challenge", challenge); target.searchParams.set("code_challenge_method", "S256");
    return Response.redirect(target.toString(), 302);
  } catch (error) { return errorResponse(error); }
}
