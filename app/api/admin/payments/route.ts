import { requireAdminToken } from "../../../../lib/server/admin-auth";
import { errorResponse, json } from "../../../../lib/server/auth";
import { id, runtime } from "../../../../lib/server/crypto";

const methodMeta = { solana: { displayName: "Solana", network: "Solana", asset: "SOL" }, usdt_trc20: { displayName: "USDT（TRC20）", network: "TRON", asset: "USDT" } } as const;
const validAddress = (method: keyof typeof methodMeta, address: string) => method === "usdt_trc20" ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address) : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);

export async function GET(request: Request) {
  try {
    await requireAdminToken(request);
    const [settings, orders] = await Promise.all([
      runtime.DB.prepare("SELECT * FROM crypto_payment_settings ORDER BY method").all(),
      runtime.DB.prepare(`SELECT o.*, p.name AS plan_name, u.display_name AS user_name FROM crypto_payment_orders o
        JOIN plans p ON p.id = o.plan_id JOIN users u ON u.id = o.user_id ORDER BY CASE o.status WHEN 'pending' THEN 0 ELSE 1 END, o.created_at DESC LIMIT 200`).all(),
    ]);
    return json({ settings: settings.results, orders: orders.results });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    await requireAdminToken(request);
    const input = await request.json() as { method?: keyof typeof methodMeta; address?: string; enabled?: boolean };
    if (!input.method || !methodMeta[input.method]) return json({ error: "支付方式无效" }, 400);
    const address = String(input.address || "").trim();
    if (!validAddress(input.method, address)) return json({ error: input.method === "usdt_trc20" ? "TRON 地址应以 T 开头且为 34 位" : "Solana 地址格式不正确" }, 400);
    const meta = methodMeta[input.method];
    await runtime.DB.prepare(`INSERT INTO crypto_payment_settings (id, method, display_name, network, asset, address, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch()) ON CONFLICT(method) DO UPDATE SET address = excluded.address, enabled = excluded.enabled, updated_at = unixepoch()`)
      .bind(id("paycfg"), input.method, meta.displayName, meta.network, meta.asset, address, input.enabled === false ? 0 : 1).run();
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminToken(request);
    const input = await request.json() as { orderId?: string; action?: "approve" | "reject"; note?: string };
    if (!input.orderId || !["approve", "reject"].includes(input.action || "")) return json({ error: "审核操作无效" }, 400);
    const order = await runtime.DB.prepare(`SELECT o.id, o.user_id, o.plan_id, o.status, p.duration_days FROM crypto_payment_orders o JOIN plans p ON p.id = o.plan_id WHERE o.id = ? LIMIT 1`).bind(input.orderId).first<{ id: string; user_id: string; plan_id: string; status: string; duration_days: number }>();
    if (!order) return json({ error: "付款订单不存在" }, 404);
    if (order.status !== "pending") return json({ error: "该订单已经审核" }, 409);
    const note = String(input.note || "").trim().slice(0, 300) || null;
    if (input.action === "reject") {
      await runtime.DB.prepare("UPDATE crypto_payment_orders SET status = 'rejected', reviewer_note = ?, reviewed_at = unixepoch(), updated_at = unixepoch() WHERE id = ? AND status = 'pending'").bind(note, order.id).run();
      return json({ ok: true });
    }
    const current = await runtime.DB.prepare("SELECT max(expires_at) AS expires_at FROM user_plan_subscriptions WHERE user_id = ? AND status = 'active' AND expires_at > unixepoch()").bind(order.user_id).first<{ expires_at: number | null }>();
    const base = Math.max(Math.floor(Date.now() / 1000), Number(current?.expires_at || 0));
    await runtime.DB.batch([
      runtime.DB.prepare("UPDATE crypto_payment_orders SET status = 'approved', reviewer_note = ?, reviewed_at = unixepoch(), updated_at = unixepoch() WHERE id = ? AND status = 'pending'").bind(note, order.id),
      runtime.DB.prepare("UPDATE user_plan_subscriptions SET status = 'expired' WHERE user_id = ? AND status = 'active'").bind(order.user_id),
      runtime.DB.prepare("INSERT INTO user_plan_subscriptions (id, user_id, plan_id, source, status, starts_at, expires_at, created_at) VALUES (?, ?, ?, 'crypto', 'active', unixepoch(), ?, unixepoch())").bind(id("subplan"), order.user_id, order.plan_id, base + Math.max(1, order.duration_days) * 86400),
    ]);
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
