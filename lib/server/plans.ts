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

export async function getEligibleEndpointIds(userId: string) {
  const entitlement = await getEntitlement(userId);
  const rows = await runtime.DB.prepare("SELECT id FROM push_endpoints WHERE user_id = ? ORDER BY created_at ASC, id ASC LIMIT ?")
    .bind(userId, entitlement.deviceLimit).all<{ id: string }>();
  return { entitlement, ids: new Set(rows.results.map((row: { id: string }) => row.id)) };
}

export async function isEndpointEligible(userId: string, endpointId: string) {
  const { entitlement, ids } = await getEligibleEndpointIds(userId);
  return { eligible: ids.has(endpointId), entitlement };
}
