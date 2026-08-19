"use client";

import { useEffect, useState } from "react";

type User = { id: string; displayName: string };
type Provider = { id: string; type: string; name: string; slug: string; identity_id?: string; username?: string; email?: string; profile_url?: string; avatar_url?: string; connected_at?: number };

async function api<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } }); const data = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(data.error || "请求失败"); return data; }

export default function ProfilePage() {
  const [user, setUser] = useState<User | null | undefined>(undefined); const [providers, setProviders] = useState<Provider[]>([]); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  async function load() { const me = await api<{ user: User | null }>("/api/me"); setUser(me.user); if (me.user) setProviders((await api<{ providers: Provider[] }>("/api/oauth/providers")).providers); }
  useEffect(() => { const params = new URLSearchParams(location.search); if (params.get("message")) setNotice(params.get("message")!); load().catch((error) => setNotice(error instanceof Error ? error.message : "加载失败")); }, []);
  async function disconnect(identityId: string) { if (!confirm("确定解除这个社交账户的绑定吗？")) return; setBusy(true); try { await api("/api/oauth/providers", { method: "DELETE", body: JSON.stringify({ identityId }) }); setNotice("已解除社交账户绑定"); await load(); } catch (error) { setNotice(error instanceof Error ? error.message : "解绑失败"); } finally { setBusy(false); } }
  if (user === undefined) return <main className="standalone-shell"><section className="standalone-card">正在加载个人中心…</section></main>;
  if (!user) return <main className="standalone-shell"><section className="standalone-card"><p className="eyebrow">PROFILE</p><h1>请先登录</h1><p>使用通知地址登录后即可绑定社交账户。</p><a className="primary-button standalone-action" href="/?view=profile">返回并登录</a></section></main>;
  return <main className="standalone-shell"><header className="standalone-header"><a className="brand" href="/"><span className="brand-mark">N</span>NotiCenter</a><a href="/">返回主题中心</a></header><section className="standalone-card wide-card"><p className="eyebrow">PROFILE</p><h1>个人中心</h1><p className="standalone-copy">账号 ID：<code>{user.id}</code><br />社交账户只用于展示身份和后续登录扩展，不会获得通知客户端地址。</p><div className="social-list">{providers.map((provider) => <article className="social-row" key={provider.id}><span className={`oauth-logo ${provider.type}`}>{provider.type === "github" ? "GH" : provider.type === "logto" ? "L" : "ID"}</span><div><strong>{provider.name}</strong>{provider.identity_id ? <><small>{provider.username || provider.email || "已连接"}</small>{provider.email && provider.username && <small>{provider.email}</small>}</> : <small>尚未绑定</small>}</div>{provider.identity_id ? <button disabled={busy} onClick={() => disconnect(provider.identity_id!)}>解除绑定</button> : <a className="social-connect" href={`/api/oauth/${provider.slug}/start`}>连接账户</a>}</article>)}</div>{providers.length === 0 && <div className="empty-state"><strong>暂无可用的社交登录</strong><p>管理员需要先在 /admin 中添加并启用 OAuth 配置。</p></div>}{notice && <p className="form-notice">{notice}</p>}</section></main>;
}
