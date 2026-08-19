import { errorResponse, json, requireUser } from "../../../../lib/server/auth";
import { id, runtime, sha256 } from "../../../../lib/server/crypto";

const normalizeCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, "");

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await request.json() as { code?: string };
    const code = normalizeCode(input.code ?? "");
    if (code.length < 8 || code.length > 80) return json({ error: "请输入有效的激活码" }, 400);
    const record = await runtime.DB.prepare(`SELECT ac.id, ac.plan_id, p.duration_days
      FROM activation_codes ac JOIN plans p ON p.id = ac.plan_id
      WHERE ac.code_hash = ? AND ac.redeemed_at IS NULL AND (ac.expires_at IS NULL OR ac.expires_at > unixepoch()) AND p.enabled = 1 LIMIT 1`)
      .bind(await sha256(code)).first<{ id: string; plan_id: string; duration_days: number }>();
    if (!record) return json({ error: "激活码无效、已使用或已经过期" }, 400);
    const current = await runtime.DB.prepare("SELECT plan_id, expires_at FROM user_plan_subscriptions WHERE user_id = ? AND status = 'active' AND expires_at > unixepoch() ORDER BY expires_at DESC LIMIT 1").bind(user.id).first<{ plan_id: string; expires_at: number }>();
    const base = current?.plan_id === record.plan_id ? Math.max(Math.floor(Date.now() / 1000), current.expires_at) : Math.floor(Date.now() / 1000);
    const subscriptionExpires = base + Math.max(1, record.duration_days) * 86400;
    const claimed = await runtime.DB.prepare("UPDATE activation_codes SET redeemed_by = ?, redeemed_at = unixepoch() WHERE id = ? AND redeemed_at IS NULL").bind(user.id, record.id).run();
    if (!claimed.meta.changes) return json({ error: "激活码已经被使用" }, 409);
    try {
      await runtime.DB.batch([
        runtime.DB.prepare("UPDATE user_plan_subscriptions SET status = 'expired' WHERE user_id = ? AND status = 'active'").bind(user.id),
        runtime.DB.prepare("INSERT INTO user_plan_subscriptions (id, user_id, plan_id, activation_code_id, source, status, starts_at, expires_at, created_at) VALUES (?, ?, ?, ?, 'activation_code', 'active', unixepoch(), ?, unixepoch())")
          .bind(id("subplan"), user.id, record.plan_id, record.id, subscriptionExpires),
      ]);
    } catch (error) {
      await runtime.DB.prepare("UPDATE activation_codes SET redeemed_by = NULL, redeemed_at = NULL WHERE id = ? AND redeemed_by = ?").bind(record.id, user.id).run();
      throw error;
    }
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
