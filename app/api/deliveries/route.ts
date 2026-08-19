import { errorResponse, json, requireUser } from "../../../lib/server/auth";
import { runtime } from "../../../lib/server/crypto";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const result = await runtime.DB.prepare(`SELECT da.id, da.status, da.provider, da.response_code, da.last_error, da.attempt_count,
      da.created_at, da.delivered_at, m.title, m.body, t.name AS topic_name, pe.label AS endpoint_label
      FROM delivery_attempts da JOIN messages m ON m.id = da.message_id JOIN topics t ON t.id = m.topic_id
      JOIN subscriptions s ON s.id = da.subscription_id JOIN push_endpoints pe ON pe.id = s.endpoint_id
      WHERE s.user_id = ? OR t.owner_user_id = ?
      UNION ALL
      SELECT m.id, 'no_recipients' AS status, '' AS provider, NULL AS response_code, NULL AS last_error, 0 AS attempt_count,
      m.received_at AS created_at, NULL AS delivered_at, m.title, m.body, t.name AS topic_name, '无有效订阅客户端' AS endpoint_label
      FROM messages m JOIN topics t ON t.id = m.topic_id
      WHERE t.owner_user_id = ? AND NOT EXISTS (SELECT 1 FROM delivery_attempts da WHERE da.message_id = m.id)
      ORDER BY created_at DESC LIMIT 100`).bind(user.id, user.id, user.id).all();
    return json({ deliveries: result.results });
  } catch (error) { return errorResponse(error); }
}
