import { requireAdminToken } from "../../../../lib/server/admin-auth";
import { errorResponse, json } from "../../../../lib/server/auth";
import { id, runtime, sha256, token } from "../../../../lib/server/crypto";

function createCode() { return `NTC-${token(12).replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 16).match(/.{1,4}/g)?.join("-")}`; }

export async function GET(request: Request) {
  try { await requireAdminToken(request); const result = await runtime.DB.prepare(`SELECT ac.id, ac.plan_id, ac.code_hint, ac.expires_at, ac.redeemed_by, ac.redeemed_at, ac.created_at, p.name AS plan_name, u.display_name AS redeemed_user_name FROM activation_codes ac JOIN plans p ON p.id = ac.plan_id LEFT JOIN users u ON u.id = ac.redeemed_by ORDER BY ac.created_at DESC LIMIT 500`).all(); return json({ codes: result.results }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await requireAdminToken(request); const input = await request.json() as { planId?: string; count?: number; expiresAt?: string | null };
    const plan = await runtime.DB.prepare("SELECT id FROM plans WHERE id = ? LIMIT 1").bind(input.planId).first(); if (!plan) return json({ error: "套餐不存在" }, 404);
    const count = Math.max(1, Math.min(100, Math.round(Number(input.count) || 1))); const expires = input.expiresAt ? Math.floor(new Date(input.expiresAt).getTime() / 1000) : null;
    if (expires !== null && (!Number.isFinite(expires) || expires <= Date.now() / 1000)) return json({ error: "激活码到期时间必须晚于当前时间" }, 400);
    const codes = Array.from({ length: count }, () => createCode());
    await runtime.DB.batch(await Promise.all(codes.map(async (code) => runtime.DB.prepare("INSERT INTO activation_codes (id, plan_id, code_hash, code_hint, expires_at, created_at) VALUES (?, ?, ?, ?, ?, unixepoch())").bind(id("act"), input.planId, await sha256(code), code.slice(-9), expires))));
    return json({ ok: true, codes }, 201);
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try { await requireAdminToken(request); const input = await request.json() as { id?: string }; const result = await runtime.DB.prepare("DELETE FROM activation_codes WHERE id = ? AND redeemed_at IS NULL").bind(input.id).run(); if (!result.meta.changes) return json({ error: "激活码不存在或已被使用" }, 409); return json({ ok: true }); }
  catch (error) { return errorResponse(error); }
}
