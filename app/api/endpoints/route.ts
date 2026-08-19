import { getPushAdapter } from "../../../lib/push/adapters";
import { BARK_MESSAGE_FIELDS, type AdapterConfig, type PushProvider } from "../../../lib/push/types";
import { errorResponse, json, requireUser } from "../../../lib/server/auth";
import { endpointHash, encrypt, id, runtime } from "../../../lib/server/crypto";
import { getEligibleEndpointIds, getEntitlement } from "../../../lib/server/plans";

function cleanConfig(provider: PushProvider, config?: AdapterConfig): AdapterConfig {
  if (provider === "bark") return {};
  const defaults = Object.fromEntries(BARK_MESSAGE_FIELDS.map((field) => [field, field]));
  if (provider === "ntfy") Object.assign(defaults, { body: "message", url: "click", group: "tags" });
  const mapping = { ...defaults, ...config?.mapping };
  for (const key of Object.keys(mapping) as Array<keyof typeof mapping>) mapping[key] = (mapping[key] ?? "").trim().replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 64);
  return { mapping };
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const [result, eligibility] = await Promise.all([runtime.DB.prepare(`SELECT id, provider, label, config_json, verified_at, last_tested_at, is_default,
      (SELECT count(*) FROM subscriptions s WHERE s.endpoint_id = pe.id AND s.status = 'active') AS subscription_count
      FROM push_endpoints pe WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at ASC, id ASC`).bind(user.id).all(), getEligibleEndpointIds(user.id)]);
    return json({ endpoints: result.results.map((row: Record<string, unknown>) => ({ ...row, deprecated: row.provider === "ntfy", eligible: eligibility.ids.has(String(row.id)), config: JSON.parse(String(row.config_json || "{}")), config_json: undefined })), entitlement: eligibility.entitlement });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await request.json() as { provider?: PushProvider; endpoint?: string; label?: string; config?: AdapterConfig };
    if (!input.provider || !input.endpoint?.trim()) return json({ error: "请选择类型并填写通知地址" }, 400);
    if (input.provider === "ntfy") return json({ error: "NTFY 客户端接入已停止，请使用 Bark 或 Webhook" }, 400);
    const adapter = getPushAdapter(input.provider);
    const endpoint = adapter.normalizeEndpoint(input.endpoint);
    const config = cleanConfig(input.provider, input.config);
    const hash = await endpointHash(input.provider, endpoint);
    const existing = await runtime.DB.prepare("SELECT id, user_id, deleted_at FROM push_endpoints WHERE provider = ? AND endpoint_hash = ? LIMIT 1")
      .bind(input.provider, hash).first<{ id: string; user_id: string; deleted_at: number | null }>();
    if (existing?.user_id === user.id && !existing.deleted_at) return json({ error: "这个客户端已经在当前账号中" }, 409);
    if (existing && existing.user_id !== user.id) return json({ error: "这个客户端属于另一个账号，请使用下方的账号关联功能并完成验证码确认" }, 409);
    const [entitlement, endpointCount] = await Promise.all([
      getEntitlement(user.id),
      runtime.DB.prepare("SELECT count(*) AS count FROM push_endpoints WHERE user_id = ? AND deleted_at IS NULL AND provider != 'ntfy'").bind(user.id).first<{ count: number }>(),
    ]);
    if ((endpointCount?.count ?? 0) >= entitlement.deviceLimit) return json({ error: `当前${entitlement.planName}最多可添加 ${entitlement.deviceLimit} 个设备，请升级套餐后继续` }, 403);
    const test = await adapter.send(endpoint, { title: "NotiCenter 客户端测试", body: "连接成功。这个客户端现在可以接收主题通知。", group: "NotiCenter" }, config);
    if (!test.ok) return json({ error: `测试推送失败（${test.status}）${test.detail ? `：${test.detail}` : ""}` }, 502);
    const endpointId = existing?.id ?? id("ep");
    const label = (input.label?.trim() || `${input.provider.toUpperCase()} 客户端`).slice(0, 60);
    if (existing) {
      await runtime.DB.prepare("UPDATE push_endpoints SET endpoint_ciphertext = ?, label = ?, config_json = ?, verified_at = unixepoch(), last_tested_at = unixepoch(), deleted_at = NULL, updated_at = unixepoch() WHERE id = ? AND user_id = ?")
        .bind(await encrypt(endpoint), label, JSON.stringify(config), endpointId, user.id).run();
    } else {
      await runtime.DB.prepare(`INSERT INTO push_endpoints (id, user_id, provider, endpoint_ciphertext, endpoint_hash, label, config_json, verified_at, last_tested_at, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch(), 0, unixepoch(), unixepoch())`)
        .bind(endpointId, user.id, input.provider, await encrypt(endpoint), hash, label, JSON.stringify(config)).run();
    }
    return json({ ok: true, id: endpointId }, 201);
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await request.json() as { endpointId?: string };
    if (!input.endpointId) return json({ error: "缺少设备 ID" }, 400);
    const [endpoint, count] = await Promise.all([
      runtime.DB.prepare("SELECT id, label, provider, is_default FROM push_endpoints WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1").bind(input.endpointId, user.id).first<{ id: string; label: string; provider: string; is_default: number }>(),
      runtime.DB.prepare("SELECT count(*) AS count FROM push_endpoints WHERE user_id = ? AND deleted_at IS NULL AND provider != 'ntfy'").bind(user.id).first<{ count: number }>(),
    ]);
    if (!endpoint) return json({ error: "设备不存在或已移除" }, 404);
    if (endpoint.provider !== "ntfy" && (count?.count ?? 0) <= 1) return json({ error: "不能移除账号的最后一台受支持登录设备" }, 409);
    const statements = [
      runtime.DB.prepare("UPDATE subscriptions SET status = 'unsubscribed', updated_at = unixepoch() WHERE endpoint_id = ? AND status != 'unsubscribed'").bind(endpoint.id),
      runtime.DB.prepare("UPDATE push_endpoints SET deleted_at = unixepoch(), is_default = 0, updated_at = unixepoch() WHERE id = ? AND user_id = ?").bind(endpoint.id, user.id),
    ];
    if (Number(endpoint.is_default) === 1) {
      const replacement = await runtime.DB.prepare("SELECT id FROM push_endpoints WHERE user_id = ? AND id != ? AND deleted_at IS NULL AND provider != 'ntfy' ORDER BY created_at ASC, id ASC LIMIT 1").bind(user.id, endpoint.id).first<{ id: string }>();
      if (!replacement) return json({ error: "找不到可接替的默认设备" }, 409);
      statements.push(runtime.DB.prepare("UPDATE push_endpoints SET is_default = 1, updated_at = unixepoch() WHERE id = ?").bind(replacement.id));
    }
    await runtime.DB.batch(statements);
    return json({ ok: true, removed: endpoint.label });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await request.json() as { endpointId?: string; label?: string };
    const label = input.label?.trim();
    if (!input.endpointId || !label) return json({ error: "请输入客户端名称" }, 400);
    if (label.length > 60) return json({ error: "客户端名称不能超过 60 个字符" }, 400);

    const endpoint = await runtime.DB.prepare("SELECT id FROM push_endpoints WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1")
      .bind(input.endpointId, user.id).first();
    if (!endpoint) return json({ error: "客户端不存在或你没有修改权限" }, 404);

    await runtime.DB.prepare("UPDATE push_endpoints SET label = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?")
      .bind(label, input.endpointId, user.id).run();
    return json({ ok: true, label });
  } catch (error) { return errorResponse(error); }
}
