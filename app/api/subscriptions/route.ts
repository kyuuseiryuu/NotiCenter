import { errorResponse, json, requireUser } from "../../../lib/server/auth";
import { id, runtime } from "../../../lib/server/crypto";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await request.json() as { topicId?: string; endpointId?: string; subscribe?: boolean };
    if (!input.topicId) return json({ error: "缺少主题" }, 400);
    const topic = await runtime.DB.prepare("SELECT id FROM topics WHERE id = ? AND status = 'active' LIMIT 1").bind(input.topicId).first();
    if (!topic) return json({ error: "主题不存在或已停用" }, 404);
    const endpointId = input.endpointId ?? user.endpointId;
    const endpoint = await runtime.DB.prepare("SELECT id FROM push_endpoints WHERE id = ? AND user_id = ? AND verified_at IS NOT NULL LIMIT 1").bind(endpointId, user.id).first();
    if (!endpoint) return json({ error: "请选择有效的通知客户端" }, 400);
    if (input.subscribe === false) {
      await runtime.DB.prepare("UPDATE subscriptions SET status = 'unsubscribed', updated_at = unixepoch() WHERE topic_id = ? AND user_id = ? AND endpoint_id = ?").bind(input.topicId, user.id, endpointId).run();
    } else {
      await runtime.DB.prepare(`INSERT INTO subscriptions (id, topic_id, user_id, endpoint_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', unixepoch(), unixepoch())
        ON CONFLICT(topic_id, user_id, endpoint_id) DO UPDATE SET status = 'active', updated_at = unixepoch()`)
        .bind(id("sub"), input.topicId, user.id, endpointId).run();
    }
    return json({ ok: true, subscribed: input.subscribe !== false });
  } catch (error) { return errorResponse(error); }
}
