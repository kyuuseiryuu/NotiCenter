import { getPushAdapter } from "../../../lib/push/adapters";
import { BARK_MESSAGE_FIELDS, type AdapterConfig, type PushProvider } from "../../../lib/push/types";
import { errorResponse, json, requireUser } from "../../../lib/server/auth";
import { endpointHash, encrypt, id, runtime } from "../../../lib/server/crypto";

function cleanConfig(provider: PushProvider, config?: AdapterConfig): AdapterConfig {
  if (provider === "bark") return {};
  const defaults = Object.fromEntries(BARK_MESSAGE_FIELDS.map((field) => [field, field]));
  if (provider === "ntfy") Object.assign(defaults, { body: "message", url: "click", group: "tags" });
  const mapping = { ...defaults, ...config?.mapping };
  for (const key of Object.keys(mapping) as Array<keyof typeof mapping>) mapping[key] = mapping[key].trim().replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 64);
  return { mapping };
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const result = await runtime.DB.prepare(`SELECT id, provider, label, config_json, verified_at, last_tested_at, is_default,
      (SELECT count(*) FROM subscriptions s WHERE s.endpoint_id = pe.id AND s.status = 'active') AS subscription_count
      FROM push_endpoints pe WHERE user_id = ? ORDER BY is_default DESC, created_at ASC`).bind(user.id).all();
    return json({ endpoints: result.results.map((row) => ({ ...row, config: JSON.parse(String(row.config_json || "{}")), config_json: undefined })) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await request.json() as { provider?: PushProvider; endpoint?: string; label?: string; config?: AdapterConfig };
    if (!input.provider || !input.endpoint?.trim()) return json({ error: "请选择类型并填写通知地址" }, 400);
    const adapter = getPushAdapter(input.provider);
    const endpoint = adapter.normalizeEndpoint(input.endpoint);
    const config = cleanConfig(input.provider, input.config);
    const test = await adapter.send(endpoint, { title: "NotiCenter 客户端测试", body: "连接成功。这个客户端现在可以接收主题通知。", group: "NotiCenter" }, config);
    if (!test.ok) return json({ error: `测试推送失败（${test.status}）${test.detail ? `：${test.detail}` : ""}` }, 502);
    const hash = await endpointHash(input.provider, endpoint);
    const endpointId = id("ep");
    await runtime.DB.prepare(`INSERT INTO push_endpoints (id, user_id, provider, endpoint_ciphertext, endpoint_hash, label, config_json, verified_at, last_tested_at, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch(), 0, unixepoch(), unixepoch())`)
      .bind(endpointId, user.id, input.provider, await encrypt(endpoint), hash, (input.label?.trim() || `${input.provider.toUpperCase()} 客户端`).slice(0, 60), JSON.stringify(config)).run();
    return json({ ok: true, id: endpointId }, 201);
  } catch (error) { return errorResponse(error); }
}
