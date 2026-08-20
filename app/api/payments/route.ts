import { errorResponse, json, requireUser } from "../../../lib/server/auth";
import { id, runtime } from "../../../lib/server/crypto";

const validTx = (method: string, value: string) => method === "usdt_trc20" ? /^[a-fA-F0-9]{64}$/.test(value) : /^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(value);

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const [methods, orders] = await Promise.all([
      runtime.DB.prepare("SELECT id, method, display_name, network, asset, address FROM crypto_payment_settings WHERE enabled = 1 ORDER BY method").all(),
      runtime.DB.prepare(`SELECT o.id, o.method, o.amount_cents, o.currency, o.tx_hash, o.status, o.reviewer_note, o.created_at, o.reviewed_at, p.name AS plan_name
        FROM crypto_payment_orders o JOIN plans p ON p.id = o.plan_id WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 20`).bind(user.id).all(),
    ]);
    return json({ methods: methods.results, orders: orders.results });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await request.json() as { planId?: string; method?: string; txHash?: string };
    const txHash = String(input.txHash || "").trim();
    const [plan, setting] = await Promise.all([
      runtime.DB.prepare("SELECT id, price_cents, currency FROM plans WHERE id = ? AND enabled = 1 AND price_cents > 0 LIMIT 1").bind(input.planId).first<{ id: string; price_cents: number; currency: string }>(),
      runtime.DB.prepare("SELECT id, method, address FROM crypto_payment_settings WHERE method = ? AND enabled = 1 LIMIT 1").bind(input.method).first<{ id: string; method: string; address: string }>(),
    ]);
    if (!plan) return json({ error: "付费套餐不存在或已下架" }, 404);
    if (!setting) return json({ error: "该支付方式尚未配置" }, 400);
    if (!validTx(setting.method, txHash)) return json({ error: setting.method === "usdt_trc20" ? "请输入 64 位 TRON 交易哈希" : "请输入有效的 Solana 交易签名" }, 400);
    const pending = await runtime.DB.prepare("SELECT id FROM crypto_payment_orders WHERE user_id = ? AND plan_id = ? AND status = 'pending' LIMIT 1").bind(user.id, plan.id).first();
    if (pending) return json({ error: "该套餐已有待审核付款，请等待管理员处理" }, 409);
    const orderId = id("pay");
    await runtime.DB.prepare(`INSERT INTO crypto_payment_orders (id, user_id, plan_id, payment_setting_id, method, address_snapshot, amount_cents, currency, tx_hash, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', unixepoch(), unixepoch())`).bind(orderId, user.id, plan.id, setting.id, setting.method, setting.address, plan.price_cents, plan.currency, txHash).run();
    return json({ ok: true, id: orderId }, 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) return json({ error: "该交易哈希已经提交过" }, 409);
    return errorResponse(error);
  }
}
