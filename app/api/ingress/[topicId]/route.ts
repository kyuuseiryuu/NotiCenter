import { getPushAdapter } from "../../../../lib/push/adapters";
import { BARK_MESSAGE_FIELDS, type PushProvider } from "../../../../lib/push/types";
import { errorResponse, json } from "../../../../lib/server/auth";
import { decrypt, id, runtime } from "../../../../lib/server/crypto";

type IngressInput = Record<string, unknown> & { title?: string; subtitle?: string; body?: string; markdown?: string; url?: string; group?: string; dedupeKey?: string; payload?: Record<string, unknown> };

async function parseInput(request: Request, segments: string[] = []): Promise<IngressInput> {
  const url = new URL(request.url);
  let input: IngressInput = Object.fromEntries(url.searchParams.entries());
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("application/json")) input = { ...input, ...await request.json() as IngressInput };
    else {
      const form = await request.formData();
      input = { ...input, ...Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)])) };
    }
  }
  if (segments.length === 1) input.body ??= segments[0];
  if (segments.length === 2) { input.title ??= segments[0]; input.body ??= segments[1]; }
  if (segments.length >= 3) { input.title ??= segments[0]; input.subtitle ??= segments[1]; input.body ??= segments.slice(2).join("/"); }
  return input;
}

export async function handleIngress(request: Request, topicId: string, segments: string[] = []) {
  try {
    const topic = await runtime.DB.prepare("SELECT id FROM topics WHERE id = ? AND status = 'active' LIMIT 1").bind(topicId).first();
    if (!topic) return json({ code: 404, message: "topic not found" }, 404);
    const input = await parseInput(request, segments);
    const body = String(input.body ?? input.markdown ?? "").trim();
    const title = String(input.title ?? "").trim();
    if (!body) return json({ code: 400, message: "body is required" }, 400);
    if (input.dedupeKey) {
      const prior = await runtime.DB.prepare("SELECT id FROM messages WHERE topic_id = ? AND dedupe_key = ? LIMIT 1").bind(topicId, input.dedupeKey).first<{ id: string }>();
      if (prior) return json({ code: 200, message: "success", timestamp: Date.now(), duplicate: true, messageId: prior.id });
    }
    const barkPayload: Record<string, unknown> = typeof input.payload === "object" && input.payload ? { ...input.payload } : {};
    for (const field of BARK_MESSAGE_FIELDS) if (input[field] !== undefined && !["title", "body", "url", "group"].includes(field)) barkPayload[field] = input[field];
    const messageId = id("msg");
    await runtime.DB.prepare("INSERT INTO messages (id, topic_id, dedupe_key, title, body, payload_json, received_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())")
      .bind(messageId, topicId, input.dedupeKey ?? null, title.slice(0, 160), body.slice(0, 4000), JSON.stringify(barkPayload)).run();
    const subscriptions = await runtime.DB.prepare(`SELECT s.id AS subscription_id, pe.provider, pe.endpoint_ciphertext, pe.config_json
      FROM subscriptions s JOIN push_endpoints pe ON pe.id = s.endpoint_id
      WHERE s.topic_id = ? AND s.status = 'active' AND pe.verified_at IS NOT NULL
      AND (SELECT count(*) FROM push_endpoints ranked WHERE ranked.user_id = pe.user_id
        AND (ranked.created_at < pe.created_at OR (ranked.created_at = pe.created_at AND ranked.id <= pe.id))) <= COALESCE(
          (SELECT p.device_limit FROM user_plan_subscriptions ups JOIN plans p ON p.id = ups.plan_id
           WHERE ups.user_id = pe.user_id AND ups.status = 'active' AND ups.expires_at > unixepoch()
           ORDER BY ups.expires_at DESC, ups.created_at DESC LIMIT 1), 3)`).bind(topicId).all<Record<string, string>>();
    const attempts = await Promise.all(subscriptions.results.map(async (row: Record<string, string>) => {
      const attemptId = id("del");
      await runtime.DB.prepare("INSERT INTO delivery_attempts (id, message_id, subscription_id, provider, status, attempt_count, created_at, updated_at) VALUES (?, ?, ?, ?, 'sending', 1, unixepoch(), unixepoch())").bind(attemptId, messageId, row.subscription_id, row.provider).run();
      try {
        const delivery = await getPushAdapter(row.provider as PushProvider).send(await decrypt(row.endpoint_ciphertext), { title, body, url: input.url, group: input.group, payload: barkPayload }, JSON.parse(row.config_json || "{}"));
        const status = delivery.ok ? "delivered" : delivery.retryable ? "retry" : "failed";
        await runtime.DB.prepare("UPDATE delivery_attempts SET status = ?, response_code = ?, last_error = ?, delivered_at = CASE WHEN ? = 'delivered' THEN unixepoch() ELSE NULL END, next_retry_at = CASE WHEN ? = 'retry' THEN unixepoch() + 60 ELSE NULL END, updated_at = unixepoch() WHERE id = ?").bind(status, delivery.status, delivery.detail ?? null, status, status, attemptId).run();
        return delivery.ok;
      } catch (error) {
        await runtime.DB.prepare("UPDATE delivery_attempts SET status = 'retry', last_error = ?, next_retry_at = unixepoch() + 60, updated_at = unixepoch() WHERE id = ?").bind(error instanceof Error ? error.message.slice(0, 500) : "发送失败", attemptId).run();
        return false;
      }
    }));
    return json({ code: 200, message: "success", timestamp: Date.now(), messageId, recipients: attempts.length, delivered: attempts.filter(Boolean).length });
  } catch (error) { return errorResponse(error); }
}

export async function GET(request: Request, context: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await context.params;
  return handleIngress(request, topicId);
}

export async function POST(request: Request, context: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await context.params;
  return handleIngress(request, topicId);
}
