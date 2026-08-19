import { requireAdminToken } from "../../../../lib/server/admin-auth";
import { errorResponse, json } from "../../../../lib/server/auth";
import { id, runtime } from "../../../../lib/server/crypto";

export async function GET(request: Request) {
  try { await requireAdminToken(request); const result = await runtime.DB.prepare(`SELECT u.id, u.display_name, u.status, u.created_at,
    (SELECT count(*) FROM push_endpoints pe WHERE pe.user_id = u.id) AS endpoint_count,
    p.id AS plan_id, p.name AS plan_name, p.device_limit, s.expires_at AS plan_expires_at
    FROM users u LEFT JOIN user_plan_subscriptions s ON s.id = (SELECT s2.id FROM user_plan_subscriptions s2 WHERE s2.user_id = u.id AND s2.status = 'active' AND s2.expires_at > unixepoch() ORDER BY s2.expires_at DESC LIMIT 1)
    LEFT JOIN plans p ON p.id = s.plan_id WHERE u.id != 'usr_system_admin' ORDER BY u.created_at DESC LIMIT 500`).all(); return json({ users: result.results }); }
  catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminToken(request); const input = await request.json() as { userId?: string; action?: "status" | "assign" | "revoke"; status?: string; planId?: string; expiresAt?: string };
    if (!input.userId) return json({ error: "缺少用户 ID" }, 400);
    if (input.action === "status") { if (!input.status || !["active", "suspended"].includes(input.status)) return json({ error: "用户状态无效" }, 400); await runtime.DB.prepare("UPDATE users SET status = ?, updated_at = unixepoch() WHERE id = ? AND id != 'usr_system_admin'").bind(input.status, input.userId).run(); return json({ ok: true }); }
    if (input.action === "revoke") { await runtime.DB.prepare("UPDATE user_plan_subscriptions SET status = 'revoked' WHERE user_id = ? AND status = 'active'").bind(input.userId).run(); return json({ ok: true }); }
    if (input.action === "assign") {
      const plan = await runtime.DB.prepare("SELECT id, duration_days FROM plans WHERE id = ? LIMIT 1").bind(input.planId).first<{ id: string; duration_days: number }>(); if (!plan) return json({ error: "套餐不存在" }, 404);
      const customExpiry = input.expiresAt ? Math.floor(new Date(input.expiresAt).getTime() / 1000) : Math.floor(Date.now() / 1000) + plan.duration_days * 86400;
      if (!Number.isFinite(customExpiry) || customExpiry <= Date.now() / 1000) return json({ error: "套餐到期时间必须晚于当前时间" }, 400);
      await runtime.DB.batch([runtime.DB.prepare("UPDATE user_plan_subscriptions SET status = 'revoked' WHERE user_id = ? AND status = 'active'").bind(input.userId), runtime.DB.prepare("INSERT INTO user_plan_subscriptions (id, user_id, plan_id, source, status, starts_at, expires_at, created_at) VALUES (?, ?, ?, 'admin', 'active', unixepoch(), ?, unixepoch())").bind(id("subplan"), input.userId, plan.id, customExpiry)]); return json({ ok: true });
    }
    return json({ error: "管理操作无效" }, 400);
  } catch (error) { return errorResponse(error); }
}
