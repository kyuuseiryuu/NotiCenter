import { getPushAdapter } from "../../../../lib/push/adapters";
import type { PushProvider } from "../../../../lib/push/types";
import { errorResponse, json, requireUser } from "../../../../lib/server/auth";
import { decrypt, runtime } from "../../../../lib/server/crypto";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await request.json() as { endpointId?: string; topicName?: string };
    const row = await runtime.DB.prepare("SELECT id, provider, endpoint_ciphertext, config_json FROM push_endpoints WHERE id = ? AND user_id = ? LIMIT 1").bind(input.endpointId, user.id).first<Record<string, string>>();
    if (!row) return json({ error: "客户端不存在" }, 404);
    const delivery = await getPushAdapter(row.provider as PushProvider).send(await decrypt(row.endpoint_ciphertext), { title: input.topicName ? `${input.topicName} · 订阅测试` : "NotiCenter 推送测试", body: "测试成功，你会通过这个客户端收到后续主题通知。", group: "NotiCenter" }, JSON.parse(row.config_json || "{}"));
    await runtime.DB.prepare("UPDATE push_endpoints SET last_tested_at = unixepoch(), updated_at = unixepoch() WHERE id = ?").bind(row.id).run();
    if (!delivery.ok) return json({ error: `测试失败（${delivery.status}）`, delivery }, 502);
    return json({ ok: true, delivery });
  } catch (error) { return errorResponse(error); }
}
