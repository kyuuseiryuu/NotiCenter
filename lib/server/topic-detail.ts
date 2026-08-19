import { headers } from "next/headers";
import { getUser } from "./auth";
import { runtime } from "./crypto";

export type TopicDetail = {
  id: string;
  slug: string;
  name: string;
  description: string;
  visibility: "public" | "unlisted" | "private";
  status: string;
  owner_id: string;
  subscriber_count: number;
  subscribed: number;
  owned: number;
};

export function shortUserId(userId: string) {
  return userId.replace(/^usr_/, "").slice(0, 8).toUpperCase();
}

export async function getTopicBySlug(slug: string): Promise<TopicDetail | null> {
  const requestHeaders = await headers();
  const user = await getUser(new Request("https://noticenter.local", { headers: requestHeaders }));
  const row = await runtime.DB.prepare(`SELECT t.id, t.slug, t.name, t.description, t.visibility, t.status,
    t.owner_user_id AS owner_id,
    count(DISTINCT CASE WHEN s.status = 'active' THEN s.user_id END) AS subscriber_count,
    max(CASE WHEN s.user_id = ? AND s.status = 'active' THEN 1 ELSE 0 END) AS subscribed,
    CASE WHEN t.owner_user_id = ? THEN 1 ELSE 0 END AS owned
    FROM topics t LEFT JOIN subscriptions s ON s.topic_id = t.id
    WHERE t.slug = ? AND t.status != 'archived'
    GROUP BY t.id LIMIT 1`)
    .bind(user?.id ?? "", user?.id ?? "", slug).first<TopicDetail>();

  if (!row) return null;
  if (row.visibility === "private" && !Number(row.owned) && !Number(row.subscribed)) return null;
  return { ...row, subscriber_count: Number(row.subscriber_count), subscribed: Number(row.subscribed), owned: Number(row.owned) };
}
