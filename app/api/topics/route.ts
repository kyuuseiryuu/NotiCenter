import { getUser, errorResponse, json, requireUser } from "../../../lib/server/auth";
import { id, runtime, token } from "../../../lib/server/crypto";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    const rows = await runtime.DB.prepare(`SELECT t.id, t.slug, t.name, t.description, t.visibility, t.status, t.created_at,
      u.display_name AS owner_name, count(DISTINCT CASE WHEN s.status = 'active' THEN s.user_id END) AS subscriber_count,
      max(CASE WHEN s.user_id = ? AND s.status = 'active' THEN 1 ELSE 0 END) AS subscribed,
      CASE WHEN t.owner_user_id = ? THEN 1 ELSE 0 END AS owned
      FROM topics t JOIN users u ON u.id = t.owner_user_id
      LEFT JOIN subscriptions s ON s.topic_id = t.id
      WHERE (t.visibility = 'public' AND t.status = 'active') OR t.owner_user_id = ?
      GROUP BY t.id ORDER BY owned DESC, subscriber_count DESC, t.created_at DESC LIMIT 100`)
      .bind(user?.id ?? "", user?.id ?? "", user?.id ?? "").all();
    return json({ topics: rows.results });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await request.json() as { name?: string; description?: string; visibility?: "public" | "unlisted" | "private" };
    const name = input.name?.trim().slice(0, 80);
    if (!name) return json({ error: "请输入主题名称" }, 400);
    const topicId = id("top");
    const slugBase = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "topic";
    const slug = `${slugBase}-${token(4).toLowerCase()}`;
    await runtime.DB.prepare("INSERT INTO topics (id, owner_user_id, slug, name, description, visibility, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', unixepoch(), unixepoch())").bind(topicId, user.id, slug, name, input.description?.trim().slice(0, 500) ?? "", input.visibility ?? "public").run();
    const base = new URL(request.url).origin;
    return json({ topic: { id: topicId, slug, name }, ingress: `${base}/api/ingress/${topicId}` }, 201);
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await request.json() as { topicId?: string };
    const topic = await runtime.DB.prepare("SELECT id FROM topics WHERE id = ? AND owner_user_id = ? LIMIT 1").bind(input.topicId, user.id).first();
    if (!topic) return json({ error: "主题不存在或你没有删除权限" }, 404);
    await runtime.DB.prepare("DELETE FROM topics WHERE id = ? AND owner_user_id = ?").bind(input.topicId, user.id).run();
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
