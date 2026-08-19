import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTopicBySlug, shortUserId } from "../../../lib/server/topic-detail";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const topic = await getTopicBySlug((await params).slug);
  if (!topic) return { title: "主题不存在 — NotiCenter", robots: { index: false, follow: false } };
  const description = topic.description || `订阅 ${topic.name} 的统一通知。`;
  return {
    title: `${topic.name} — NotiCenter`,
    description,
    openGraph: { title: topic.name, description, images: [] },
    twitter: { title: topic.name, description, images: [] },
    robots: topic.visibility === "public" ? undefined : { index: false, follow: false },
  };
}

export default async function TopicPage({ params }: Props) {
  const topic = await getTopicBySlug((await params).slug);
  if (!topic) notFound();
  const visibility = topic.visibility === "public" ? "公开主题" : topic.visibility === "unlisted" ? "仅链接可见" : "私有主题";

  return <main className="topic-detail-shell">
    <header className="topic-detail-header"><Link className="brand" href="/"><span className="brand-mark">N</span><span>NotiCenter</span></Link><Link className="detail-back" href="/">返回主题中心</Link></header>
    <section className="topic-detail-card">
      <div className="detail-meta"><span className="topic-state active">{visibility}</span><code>/t/{topic.slug}</code></div>
      <h1>{topic.name}</h1>
      <p className="detail-description">{topic.description || "发布者暂未填写主题介绍。"}</p>
      <dl className="detail-stats">
        <div><dt>发布者</dt><dd title={topic.owner_id}>{shortUserId(topic.owner_id)}</dd></div>
        <div><dt>订阅者</dt><dd>{topic.subscriber_count.toLocaleString()}</dd></div>
        <div><dt>状态</dt><dd>{topic.status === "active" ? "运行中" : topic.status}</dd></div>
      </dl>
      <div className="detail-actions"><Link className="primary-button detail-action" href="/">{topic.owned ? "管理这个主题" : topic.subscribed ? "管理接收客户端" : "选择客户端订阅"}</Link></div>
      {topic.visibility === "private" && <p className="private-detail-note">此页面仅对发布者和已订阅用户开放。</p>}
    </section>
  </main>;
}
