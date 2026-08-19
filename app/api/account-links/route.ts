import { getPushAdapter } from "../../../lib/push/adapters";
import type { PushProvider } from "../../../lib/push/types";
import { errorResponse, json, requireUser } from "../../../lib/server/auth";
import { decrypt, endpointHash, id, runtime, sha256 } from "../../../lib/server/crypto";
import { getEntitlement } from "../../../lib/server/plans";

type LinkRequest = {
  action?: "request" | "verify";
  provider?: PushProvider;
  endpoint?: string;
  challengeId?: string;
  code?: string;
};

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = (await request.json()) as LinkRequest;
    if (input.action === "verify") return verifyAndMerge(user, input);
    return requestLink(user, input);
  } catch (error) {
    return errorResponse(error);
  }
}

async function requestLink(user: Awaited<ReturnType<typeof requireUser>>, input: LinkRequest) {
  if (!input.provider || !input.endpoint?.trim()) return json({ error: "请选择推送类型并填写要关联的通知地址" }, 400);
  const adapter = getPushAdapter(input.provider);
  const endpoint = adapter.normalizeEndpoint(input.endpoint);
  const hash = await endpointHash(input.provider, endpoint);
  const target = await runtime.DB.prepare(`SELECT pe.id, pe.user_id, pe.endpoint_ciphertext, pe.label, u.status
    FROM push_endpoints pe JOIN users u ON u.id = pe.user_id
    WHERE pe.provider = ? AND pe.endpoint_hash = ? LIMIT 1`).bind(input.provider, hash)
    .first<{ id: string; user_id: string; endpoint_ciphertext: string; label: string; status: string }>();
  if (!target || target.status !== "active") return json({ error: "该通知地址尚未注册，请先使用它登录一次" }, 404);
  if (target.user_id === user.id) return json({ error: "这个客户端已经属于当前账号" }, 409);

  const recent = await runtime.DB.prepare(`SELECT count(*) AS count FROM account_link_challenges
    WHERE requester_user_id = ? AND target_endpoint_id = ? AND created_at > unixepoch() - 60`)
    .bind(user.id, target.id).first<{ count: number }>();
  if ((recent?.count ?? 0) > 0) return json({ error: "请等待一分钟后再次发送关联验证码" }, 429);

  const challengeId = id("link");
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  await runtime.DB.prepare(`INSERT INTO account_link_challenges
    (id, requester_user_id, target_user_id, target_endpoint_id, code_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, unixepoch() + 600, unixepoch())`)
    .bind(challengeId, user.id, target.user_id, target.id, await sha256(code)).run();

  const storedEndpoint = await decrypt(target.endpoint_ciphertext);
  const sent = await adapter.send(storedEndpoint, {
    title: "NotiCenter 账号关联验证码",
    body: code + "（10 分钟内有效）。确认后，该账号的全部客户端、主题和订阅将合并到当前账号。",
    group: "NotiCenter",
  });
  if (!sent.ok) {
    await runtime.DB.prepare("UPDATE account_link_challenges SET consumed_at = unixepoch() WHERE id = ?").bind(challengeId).run();
    return json({ error: "关联验证码推送失败（" + sent.status + "）" }, 502);
  }
  return json({ ok: true, challengeId, targetLabel: target.label, expiresIn: 600 });
}

async function verifyAndMerge(user: Awaited<ReturnType<typeof requireUser>>, input: LinkRequest) {
  if (!input.challengeId || !/^\d{6}$/.test(input.code ?? "")) return json({ error: "请输入有效的 6 位关联验证码" }, 400);
  const challenge = await runtime.DB.prepare(`SELECT id, target_user_id, target_endpoint_id, code_hash, attempt_count
    FROM account_link_challenges
    WHERE id = ? AND requester_user_id = ? AND consumed_at IS NULL AND expires_at > unixepoch() LIMIT 1`)
    .bind(input.challengeId, user.id)
    .first<{ id: string; target_user_id: string; target_endpoint_id: string; code_hash: string; attempt_count: number }>();
  if (!challenge) return json({ error: "关联验证码已过期，请重新发送" }, 400);
  if (challenge.attempt_count >= 5) return json({ error: "尝试次数过多，请重新发送关联验证码" }, 429);
  if (challenge.code_hash !== await sha256(input.code!)) {
    await runtime.DB.prepare(`UPDATE account_link_challenges SET attempt_count = attempt_count + 1,
      consumed_at = CASE WHEN attempt_count + 1 >= 5 THEN unixepoch() ELSE consumed_at END WHERE id = ?`)
      .bind(challenge.id).run();
    return json({ error: "关联验证码错误" }, 400);
  }
  if (challenge.target_user_id === user.id) return json({ error: "账号已经完成关联" }, 409);

  const target = await runtime.DB.prepare("SELECT status FROM users WHERE id = ? LIMIT 1")
    .bind(challenge.target_user_id).first<{ status: string }>();
  if (!target || target.status !== "active") return json({ error: "目标账号已被合并或停用" }, 409);

  const [endpointCount, currentEndpointCount, entitlement] = await Promise.all([
    runtime.DB.prepare("SELECT count(*) AS count FROM push_endpoints WHERE user_id = ?").bind(challenge.target_user_id).first<{ count: number }>(),
    runtime.DB.prepare("SELECT count(*) AS count FROM push_endpoints WHERE user_id = ?").bind(user.id).first<{ count: number }>(),
    getEntitlement(user.id),
  ]);
  if ((endpointCount?.count ?? 0) + (currentEndpointCount?.count ?? 0) > entitlement.deviceLimit) return json({ error: `关联后将超过${entitlement.planName}的 ${entitlement.deviceLimit} 台设备上限，请先升级套餐` }, 403);
  const statements = [
    runtime.DB.prepare("UPDATE account_link_challenges SET consumed_at = unixepoch() WHERE id = ? AND consumed_at IS NULL").bind(challenge.id),
    runtime.DB.prepare("UPDATE account_link_challenges SET consumed_at = unixepoch() WHERE (requester_user_id = ? OR target_user_id = ?) AND consumed_at IS NULL").bind(challenge.target_user_id, challenge.target_user_id),
    runtime.DB.prepare("UPDATE push_endpoints SET is_default = 0, updated_at = unixepoch() WHERE user_id IN (?, ?)").bind(user.id, challenge.target_user_id),
    runtime.DB.prepare("UPDATE push_endpoints SET user_id = ?, updated_at = unixepoch() WHERE user_id = ?").bind(user.id, challenge.target_user_id),
    runtime.DB.prepare("UPDATE push_endpoints SET is_default = 1, updated_at = unixepoch() WHERE id = ? AND user_id = ?").bind(user.endpointId, user.id),
    runtime.DB.prepare("UPDATE subscriptions SET user_id = ?, updated_at = unixepoch() WHERE user_id = ?").bind(user.id, challenge.target_user_id),
    runtime.DB.prepare("UPDATE topics SET owner_user_id = ?, updated_at = unixepoch() WHERE owner_user_id = ?").bind(user.id, challenge.target_user_id),
    runtime.DB.prepare("UPDATE sessions SET user_id = ? WHERE user_id = ?").bind(user.id, challenge.target_user_id),
    runtime.DB.prepare("UPDATE audit_logs SET actor_user_id = ? WHERE actor_user_id = ?").bind(user.id, challenge.target_user_id),
    runtime.DB.prepare("UPDATE oauth_providers SET created_by = ?, updated_at = unixepoch() WHERE created_by = ?").bind(user.id, challenge.target_user_id),
    runtime.DB.prepare("DELETE FROM oauth_binding_states WHERE user_id = ?").bind(challenge.target_user_id),
    runtime.DB.prepare("DELETE FROM oauth_identities WHERE user_id = ? AND provider_id IN (SELECT provider_id FROM oauth_identities WHERE user_id = ?)").bind(challenge.target_user_id, user.id),
    runtime.DB.prepare("UPDATE oauth_identities SET user_id = ?, updated_at = unixepoch() WHERE user_id = ?").bind(user.id, challenge.target_user_id),
    runtime.DB.prepare("UPDATE user_plan_subscriptions SET user_id = ? WHERE user_id = ?").bind(user.id, challenge.target_user_id),
    runtime.DB.prepare("UPDATE activation_codes SET redeemed_by = ? WHERE redeemed_by = ?").bind(user.id, challenge.target_user_id),
    runtime.DB.prepare("UPDATE users SET status = 'deleted', updated_at = unixepoch() WHERE id = ? AND status = 'active'").bind(challenge.target_user_id),
    runtime.DB.prepare(`INSERT INTO audit_logs (id, actor_user_id, action, resource_type, resource_id, metadata_json, created_at)
      VALUES (?, ?, 'account.link', 'user', ?, ?, unixepoch())`)
      .bind(id("aud"), user.id, challenge.target_user_id, JSON.stringify({ targetEndpointId: challenge.target_endpoint_id, mergedEndpoints: endpointCount?.count ?? 0 })),
  ];
  await runtime.DB.batch(statements);
  return json({ ok: true, mergedEndpoints: endpointCount?.count ?? 0 });
}
