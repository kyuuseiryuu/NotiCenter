import { handleIngress } from "../../ingress/[topicId]/route";
import { errorResponse, json, requireUser } from "../../../../lib/server/auth";
import { runtime } from "../../../../lib/server/crypto";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await request.clone().json() as { topicId?: string };
    if (!input.topicId) return json({ error: "缺少主题" }, 400);
    const topic = await runtime.DB.prepare("SELECT id FROM topics WHERE id = ? AND owner_user_id = ? AND status = 'active' LIMIT 1").bind(input.topicId, user.id).first();
    if (!topic) return json({ error: "只有主题发布者可以手动发送" }, 403);
    return handleIngress(request, input.topicId);
  } catch (error) { return errorResponse(error); }
}
