import { runtime } from "./crypto";

export const FREE_DEVICE_LIMIT = 3;

export type Entitlement = {
  planId: string | null;
  planName: string;
  deviceLimit: number;
  expiresAt: number | null;
  source: string;
};

export async function getEntitlement(userId: string): Promise<Entitlement> {
  const row = await runtime.DB.prepare(`SELECT p.id AS plan_id, p.name AS plan_name, p.device_limit, s.expires_at, s.source
    FROM user_plan_subscriptions s JOIN plans p ON p.id = s.plan_id
    WHERE s.user_id = ? AND s.status = 'active' AND s.expires_at > unixepoch()
    ORDER BY s.expires_at DESC, s.created_at DESC LIMIT 1`).bind(userId).first<Record<string, string | number>>();
  if (!row) return { planId: null, planName: "普通用户", deviceLimit: FREE_DEVICE_LIMIT, expiresAt: null, source: "free_default" };
  return { planId: String(row.plan_id), planName: String(row.plan_name), deviceLimit: Number(row.device_limit), expiresAt: Number(row.expires_at), source: String(row.source) };
}
