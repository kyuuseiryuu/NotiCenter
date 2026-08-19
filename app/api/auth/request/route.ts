import { getPushAdapter } from "../../../../lib/push/adapters";
import type { PushProvider } from "../../../../lib/push/types";
import { endpointHash, id, runtime, sha256 } from "../../../../lib/server/crypto";
import { errorResponse, json } from "../../../../lib/server/auth";

export async function POST(request: Request) {
  try {
    const input = await request.json() as { provider?: PushProvider; endpoint?: string };
    if (!input.provider || !input.endpoint) return json({ error: "请选择推送类型并填写通知地址" }, 400);
    if (input.provider === "ntfy") return json({ error: "NTFY 登录已停止，请使用 Bark、Webhook 或已绑定的社交账号" }, 400);
    const adapter = getPushAdapter(input.provider);
    const endpoint = adapter.normalizeEndpoint(input.endpoint);
    const hash = await endpointHash(input.provider, endpoint);
    const recent = await runtime.DB.prepare("SELECT count(*) AS count FROM login_challenges WHERE endpoint_hash = ? AND created_at > unixepoch() - 60").bind(hash).first<{ count: number }>();
    if ((recent?.count ?? 0) > 0) return json({ error: "请等待一分钟后再次发送" }, 429);
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    await runtime.DB.prepare("INSERT INTO login_challenges (id, provider, endpoint_hash, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, unixepoch() + 600, unixepoch())")
      .bind(id("lc"), input.provider, hash, await sha256(code)).run();
    const sent = await adapter.send(endpoint, { title: "NotiCenter 登录验证码", body: `${code}（10 分钟内有效，请勿转发）`, group: "NotiCenter" });
    if (!sent.ok) return json({ error: `验证码推送失败（${sent.status}）` }, 502);
    return json({ ok: true, masked: endpoint.replace(/(^https?:\/\/[^/]+\/).+/, "$1••••••") });
  } catch (error) { return errorResponse(error); }
}
