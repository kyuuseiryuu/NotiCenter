import { errorResponse, json, requireUser } from "../../../../lib/server/auth";
import { runtime } from "../../../../lib/server/crypto";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const result = await runtime.DB.prepare(`SELECT s.id, s.topic_id, t.name AS topic_name, t.slug, t.description,
      pe.id AS endpoint_id, pe.label AS endpoint_label, pe.provider, s.created_at
      FROM subscriptions s JOIN topics t ON t.id = s.topic_id JOIN push_endpoints pe ON pe.id = s.endpoint_id
      WHERE s.user_id = ? AND s.status = 'active' ORDER BY s.created_at DESC`).bind(user.id).all();
    return json({ subscriptions: result.results });
  } catch (error) { return errorResponse(error); }
}
