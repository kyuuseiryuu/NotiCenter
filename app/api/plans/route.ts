import { errorResponse, json, requireUser } from "../../../lib/server/auth";
import { id, runtime } from "../../../lib/server/crypto";
import { getEntitlement } from "../../../lib/server/plans";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const [plans, entitlement, endpoints] = await Promise.all([
      runtime.DB.prepare("SELECT id, name, description, price_cents, currency, duration_days, device_limit FROM plans WHERE enabled = 1 ORDER BY sort_order ASC, price_cents ASC").all(),
      getEntitlement(user.id),
      runtime.DB.prepare("SELECT count(*) AS count FROM push_endpoints WHERE user_id = ? AND deleted_at IS NULL AND provider != 'ntfy'").bind(user.id).first<{ count: number }>(),
    ]);
    return json({ plans: plans.results, entitlement, endpointCount: endpoints?.count ?? 0 });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await request.json() as { planId?: string };
    const plan = await runtime.DB.prepare("SELECT id, price_cents, duration_days FROM plans WHERE id = ? AND enabled = 1 LIMIT 1").bind(input.planId).first<{ id: string; price_cents: number; duration_days: number }>();
    if (!plan) return json({ error: "套餐不存在或已经下架" }, 404);
    if (plan.price_cents > 0) return json({ error: "付费套餐请使用对应激活码兑换" }, 402);
    const current = await runtime.DB.prepare("SELECT p.name FROM user_plan_subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.user_id = ? AND s.status = 'active' AND s.expires_at > unixepoch() LIMIT 1").bind(user.id).first<{ name: string }>();
    if (current) return json({ error: `当前${current.name}仍在有效期内，无需重复订阅` }, 409);
    const subscriptionId = id("subplan");
    await runtime.DB.batch([
      runtime.DB.prepare("UPDATE user_plan_subscriptions SET status = 'expired' WHERE user_id = ? AND status = 'active'").bind(user.id),
      runtime.DB.prepare("INSERT INTO user_plan_subscriptions (id, user_id, plan_id, source, status, starts_at, expires_at, created_at) VALUES (?, ?, ?, 'free', 'active', unixepoch(), unixepoch() + ?, unixepoch())").bind(subscriptionId, user.id, plan.id, Math.max(1, plan.duration_days) * 86400),
    ]);
    return json({ ok: true, id: subscriptionId });
  } catch (error) { return errorResponse(error); }
}
