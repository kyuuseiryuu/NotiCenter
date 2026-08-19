import { errorResponse, json, requireUser } from "../../../../lib/server/auth";
import { runtime } from "../../../../lib/server/crypto";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const result = await runtime.DB.prepare(`SELECT p.id, p.type, p.name, p.slug,
      i.id AS identity_id, i.username, i.email, i.profile_url, i.avatar_url, i.created_at AS connected_at
      FROM oauth_providers p LEFT JOIN oauth_identities i ON i.provider_id = p.id AND i.user_id = ?
      WHERE p.enabled = 1 ORDER BY p.created_at ASC`).bind(user.id).all();
    return json({ providers: result.results });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await request.json() as { identityId?: string };
    const result = await runtime.DB.prepare("DELETE FROM oauth_identities WHERE id = ? AND user_id = ?").bind(input.identityId, user.id).run();
    if (!result.meta.changes) return json({ error: "绑定记录不存在" }, 404);
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
