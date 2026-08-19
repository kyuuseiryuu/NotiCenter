import { runtime, sessionHash } from "./crypto";

export type SessionUser = { id: string; displayName: string; provider: string; endpointId: string; endpointLabel: string; isAdmin: boolean };

function cookie(request: Request, name: string) {
  const item = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

export async function getUser(request: Request): Promise<SessionUser | null> {
  const raw = cookie(request, "noticenter_session");
  if (!raw) return null;
  const hash = await sessionHash(raw);
  const row = await runtime.DB.prepare(`SELECT u.id, u.display_name, u.is_admin, pe.provider, pe.id AS endpoint_id, pe.label AS endpoint_label
    FROM sessions s JOIN users u ON u.id = s.user_id
    JOIN push_endpoints pe ON pe.user_id = u.id AND pe.is_default = 1
    WHERE s.token_hash = ? AND s.expires_at > unixepoch() AND u.status = 'active' LIMIT 1`).bind(hash).first<Record<string, string | number>>();
  if (!row) return null;
  return { id: String(row.id), displayName: String(row.display_name), provider: String(row.provider), endpointId: String(row.endpoint_id), endpointLabel: String(row.endpoint_label), isAdmin: Number(row.is_admin) === 1 };
}

export async function requireUser(request: Request) {
  const user = await getUser(request);
  if (!user) throw new Response(JSON.stringify({ error: "请先登录" }), { status: 401, headers: { "content-type": "application/json" } });
  return user;
}

export async function requireAdmin(request: Request) {
  const user = await requireUser(request);
  if (!user.isAdmin) {
    const admins = await runtime.DB.prepare("SELECT count(*) AS count FROM users WHERE is_admin = 1 AND status = 'active'").first<{ count: number }>();
    if ((admins?.count ?? 0) === 0) { await runtime.DB.prepare("UPDATE users SET is_admin = 1, updated_at = unixepoch() WHERE id = ?").bind(user.id).run(); user.isAdmin = true; }
  }
  if (!user.isAdmin) throw new Response(JSON.stringify({ error: "需要管理员权限" }), { status: 403, headers: { "content-type": "application/json" } });
  return user;
}

export function sessionCookie(value: string, maxAge = 60 * 60 * 24 * 30) {
  return `noticenter_session=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function json(data: unknown, status = 200, headers?: HeadersInit) { return Response.json(data, { status, headers }); }
export function errorResponse(error: unknown) { if (error instanceof Response) return error; const message = error instanceof Error ? error.message : "服务器错误"; return json({ error: message }, 500); }
