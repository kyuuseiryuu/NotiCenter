"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type User = { id: string; displayName: string; provider: string; endpointLabel: string; isAdmin: boolean };
type Topic = { id: string; slug: string; name: string; description: string; visibility: "public" | "unlisted" | "private"; owner_id: string; subscriber_count: number; subscribed: number; owned: number; status: string };
type Credentials = { topic: { name: string }; ingress: string };
type Endpoint = { id: string; provider: "bark" | "ntfy" | "webhook"; label: string; config: { mapping?: Record<string, string> }; verified_at: number; last_tested_at?: number; is_default: number; subscription_count: number; eligible: boolean; deprecated: boolean };
type OAuthProvider = { type: "github" | "logto" | "oidc"; name: string; slug: string };
type Subscription = { id: string; topic_id: string; topic_name: string; slug: string; description: string; endpoint_id: string; endpoint_label: string; provider: string; created_at: number };
type Delivery = { id: string; status: string; provider: string; response_code?: number; last_error?: string; attempt_count: number; created_at: number; delivered_at?: number; title: string; body: string; topic_name: string; endpoint_label: string };

const shortUserId = (userId: string) => userId.replace(/^usr_/, "").slice(0, 8).toUpperCase();

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

const barkMappingFields = [
  ["title", "标题"], ["subtitle", "副标题"], ["body", "正文"], ["markdown", "Markdown 正文"],
  ["device_key", "设备 Key"], ["device_keys", "设备 Key 数组"], ["level", "通知级别"], ["volume", "重要警告音量"],
  ["badge", "角标"], ["call", "持续响铃"], ["autoCopy", "自动复制"], ["copy", "复制内容"],
  ["sound", "铃声"], ["icon", "图标 URL"], ["image", "图片 URL"], ["group", "分组"],
  ["ciphertext", "加密正文"], ["isArchive", "保存历史"], ["ttl", "历史保留秒数"], ["url", "点击跳转 URL"], ["action", "点击动作"],
] as const;

function MappingFields({ provider: _provider }: { provider: "webhook" }) {
  const defaults: Record<string, string> = {};
  return <div className="mapping-grid">{barkMappingFields.map(([field, label]) => <label key={field}><span>{label}<small>{field}</small></span><input name={`map_${field}`} defaultValue={defaults[field] ?? field} /></label>)}</div>;
}

function ManualSendFields() {
  return <div className="manual-fields">
    <div className="form-grid"><label>标题 title<input name="title" maxLength={160} /></label><label>副标题 subtitle<input name="subtitle" maxLength={160} /></label></div>
    <label>正文 body<textarea name="body" rows={4} required /></label>
    <label>Markdown 正文 markdown<textarea name="markdown" rows={4} /></label>
    <div className="form-grid"><label>通知级别 level<select name="level" defaultValue=""><option value="">跟随客户端默认</option><option value="active">active</option><option value="timeSensitive">timeSensitive</option><option value="passive">passive</option><option value="critical">critical</option></select></label><label>点击动作 action<select name="action" defaultValue=""><option value="">默认打开</option><option value="none">none · 不执行动作</option></select></label></div>
    <div className="form-grid"><label>重要警告音量 volume<input name="volume" type="number" min="0" max="10" step="1" /></label><label>应用角标 badge<input name="badge" type="number" min="0" step="1" /></label><label>历史保留秒数 ttl<input name="ttl" type="number" min="0" step="1" /></label><label>铃声 sound<input name="sound" /></label></div>
    <div className="form-grid"><label>分组 group<input name="group" /></label><label>复制内容 copy<input name="copy" /></label><label>点击跳转 URL<input name="url" type="url" /></label><label>图标 URL icon<input name="icon" type="url" /></label><label>图片 URL image<input name="image" type="url" /></label><label>设备 Key device_key<input name="device_key" /></label></div>
    <label>设备 Key 数组 device_keys<textarea name="device_keys" rows={2} placeholder="每行或逗号分隔一个 Key" /></label>
    <label>加密正文 ciphertext<textarea name="ciphertext" rows={3} /></label>
    <div className="boolean-grid"><label><input name="call" type="checkbox" /> 持续响铃 call</label><label><input name="autoCopy" type="checkbox" /> 自动复制 autoCopy</label><label><input name="isArchive" type="checkbox" /> 保存到历史 isArchive</label></div>
  </div>;
}

export default function Home() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [query, setQuery] = useState("");
  const [publisherId, setPublisherId] = useState("");
  const [loginStep, setLoginStep] = useState<"endpoint" | "code">("endpoint");
  const [provider, setProvider] = useState<"bark" | "webhook">("bark");
  const [endpoint, setEndpoint] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [showPublish, setShowPublish] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [copied, setCopied] = useState(false);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [showAdapters, setShowAdapters] = useState(false);
  const [subscribeTopic, setSubscribeTopic] = useState<Topic | null>(null);
  const [sendTopic, setSendTopic] = useState<Topic | null>(null);
  const [adapterProvider, setAdapterProvider] = useState<"bark" | "webhook">("bark");
  const [linkStep, setLinkStep] = useState<"endpoint" | "code">("endpoint");
  const [linkProvider, setLinkProvider] = useState<"bark" | "webhook">("bark");
  const [linkEndpoint, setLinkEndpoint] = useState("");
  const [linkCode, setLinkCode] = useState("");
  const [linkChallengeId, setLinkChallengeId] = useState("");
  const [view, setView] = useState<"discover" | "subscriptions" | "topics" | "deliveries">("discover");
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [editingEndpointId, setEditingEndpointId] = useState<string | null>(null);
  const [editingEndpointLabel, setEditingEndpointLabel] = useState("");
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);
  const subscribeLinkHandled = useRef(false);

  const load = async () => {
    const [{ user }, { topics }] = await Promise.all([api<{ user: User | null }>("/api/me"), api<{ topics: Topic[] }>("/api/topics")]);
    setUser(user); setTopics(topics);
    if (user) { const [endpointResult, subscriptionResult, deliveryResult] = await Promise.all([api<{ endpoints: Endpoint[] }>("/api/endpoints"), api<{ subscriptions: Subscription[] }>("/api/subscriptions/list"), api<{ deliveries: Delivery[] }>("/api/deliveries")]); setEndpoints(endpointResult.endpoints); setSubscriptions(subscriptionResult.subscriptions); setDeliveries(deliveryResult.deliveries); }
  };
  useEffect(() => { const params = new URLSearchParams(window.location.search); setPublisherId(params.get("publisher") ?? ""); if (params.get("view") === "topics") setView("topics"); if (params.get("oauth_login") === "error") setNotice(params.get("message") || "社交账号登录失败"); Promise.all([load(), api<{ providers: OAuthProvider[] }>("/api/auth/oauth/providers").then((result) => setOauthProviders(result.providers))]).catch(() => setUser(null)); }, []);
  useEffect(() => {
    if (subscribeLinkHandled.current || !user || topics.length === 0) return;
    const params = new URLSearchParams(window.location.search); const slug = params.get("subscribe");
    if (!slug) return;
    const topic = topics.find((item) => item.slug === slug); if (!topic) return;
    subscribeLinkHandled.current = true; setView("discover"); setSubscribeTopic(topic); setNotice("");
    params.delete("subscribe"); const queryString = params.toString(); window.history.replaceState(null, "", `${window.location.pathname}${queryString ? `?${queryString}` : ""}`);
  }, [topics, user]);

  async function requestCode(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try { await api("/api/auth/request", { method: "POST", body: JSON.stringify({ provider, endpoint }) }); setLoginStep("code"); setNotice("验证码已发送到你的通知终端"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "发送失败"); } finally { setBusy(false); }
  }
  async function verify(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try { const result = await api<{ user: User }>("/api/auth/verify", { method: "POST", body: JSON.stringify({ provider, endpoint, code }) }); setUser(result.user); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "验证失败"); } finally { setBusy(false); }
  }
  async function setEndpointSubscription(endpointId: string, subscribe: boolean) {
    if (!subscribeTopic) return;
    setBusy(true); setNotice("");
    try { await api("/api/subscriptions", { method: "POST", body: JSON.stringify({ topicId: subscribeTopic.id, endpointId, subscribe }) }); setNotice(subscribe ? "订阅成功，可以立即发送测试通知" : "已取消此客户端的订阅"); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : subscribe ? "订阅失败" : "取消订阅失败"); } finally { setBusy(false); }
  }
  async function testEndpoint(endpointId: string, topicName?: string) {
    setBusy(true); setNotice("");
    try { await api("/api/endpoints/test", { method: "POST", body: JSON.stringify({ endpointId, topicName }) }); setNotice("测试通知已成功送达"); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "测试失败"); } finally { setBusy(false); }
  }
  async function addEndpoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(""); const form = new FormData(event.currentTarget);
    const mapping = Object.fromEntries(barkMappingFields.map(([field]) => [field, form.get(`map_${field}`)]));
    try { await api("/api/endpoints", { method: "POST", body: JSON.stringify({ provider: adapterProvider, endpoint: form.get("endpoint"), label: form.get("label"), config: { mapping } }) }); setNotice("客户端已通过测试并添加"); event.currentTarget.reset(); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "添加失败"); } finally { setBusy(false); }
  }
  async function renameEndpoint(event: FormEvent<HTMLFormElement>, endpointId: string) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      await api("/api/endpoints", { method: "PATCH", body: JSON.stringify({ endpointId, label: editingEndpointLabel }) });
      setEditingEndpointId(null); setEditingEndpointLabel(""); setNotice("客户端名称已更新"); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "修改失败"); } finally { setBusy(false); }
  }
  async function removeEndpoint(item: Endpoint) {
    if (!window.confirm(`确定移除「${item.label}」吗？该设备的所有主题订阅会自动取消。`)) return;
    setBusy(true); setNotice("");
    try { await api("/api/endpoints", { method: "DELETE", body: JSON.stringify({ endpointId: item.id }) }); setNotice(`已移除设备「${item.label}」并取消其订阅`); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "移除设备失败"); } finally { setBusy(false); }
  }
  async function requestAccountLink(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const result = await api<{ challengeId: string; targetLabel: string }>("/api/account-links", { method: "POST", body: JSON.stringify({ action: "request", provider: linkProvider, endpoint: linkEndpoint }) });
      setLinkChallengeId(result.challengeId); setLinkStep("code"); setNotice(`验证码已发送到「${result.targetLabel}」`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "关联验证码发送失败"); } finally { setBusy(false); }
  }
  async function verifyAccountLink(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const result = await api<{ mergedEndpoints: number }>("/api/account-links", { method: "POST", body: JSON.stringify({ action: "verify", challengeId: linkChallengeId, code: linkCode }) });
      await load(); setLinkStep("endpoint"); setLinkEndpoint(""); setLinkCode(""); setLinkChallengeId("");
      setNotice(`账号关联成功，已合并 ${result.mergedEndpoints} 个通知客户端`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "账号关联失败"); } finally { setBusy(false); }
  }
  async function deleteTopic(topic: Topic) {
    if (!confirm(`确定删除「${topic.name}」吗？所有关联订阅会自动取消，此操作无法撤销。`)) return;
    setBusy(true); setNotice("");
    try { await api("/api/topics", { method: "DELETE", body: JSON.stringify({ topicId: topic.id }) }); setNotice("主题已删除，关联订阅已自动取消"); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "删除失败"); } finally { setBusy(false); }
  }
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    const form = new FormData(event.currentTarget);
    try { const result = await api<Credentials>("/api/topics", { method: "POST", body: JSON.stringify({ name: form.get("name"), description: form.get("description"), visibility: form.get("visibility") }) }); setShowPublish(false); setNotice(""); setCopied(false); setCredentials(result); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "发布失败"); } finally { setBusy(false); }
  }
  async function sendManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sendTopic) return;
    setBusy(true); setNotice("");
    const form = new FormData(event.currentTarget); const payload: Record<string, unknown> = { topicId: sendTopic.id };
    for (const field of ["title", "subtitle", "body", "markdown", "level", "action", "sound", "group", "copy", "url", "icon", "image", "device_key", "ciphertext"]) { const value = String(form.get(field) ?? "").trim(); if (value) payload[field] = value; }
    for (const field of ["volume", "badge", "ttl"]) { const value = String(form.get(field) ?? "").trim(); if (value) payload[field] = Number(value); }
    for (const field of ["call", "autoCopy", "isArchive"]) if (form.get(field)) payload[field] = "1";
    const deviceKeys = String(form.get("device_keys") ?? "").split(/[\n,]/).map((value) => value.trim()).filter(Boolean); if (deviceKeys.length) payload.device_keys = deviceKeys;
    try { const result = await api<{ recipients: number; delivered: number }>("/api/topics/send", { method: "POST", body: JSON.stringify(payload) }); setNotice(`发送完成：${result.delivered}/${result.recipients} 个客户端已送达`); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "发送失败"); } finally { setBusy(false); }
  }

  function openPublish() { setNotice(""); setShowPublish(true); }
  function openCredentials(value: Credentials) { setNotice(""); setCopied(false); setCredentials(value); }
  async function copyCredentials() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(credentials.ingress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { setNotice("复制失败，请手动选择上方接入信息"); }
  }

  const visible = topics.filter((topic) => (!publisherId || (topic.owner_id === publisherId && topic.visibility === "public")) && `${topic.name}${topic.description}${topic.owner_id}`.toLowerCase().includes(query.toLowerCase()));
  const owned = topics.filter((topic) => topic.owned);
  const supportedEndpointCount = endpoints.filter((item) => !item.deprecated).length;

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">N</span><span>NotiCenter</span></div>
      <nav aria-label="主导航"><button className={`nav-item nav-button ${view === "discover" ? "active" : ""}`} onClick={() => setView("discover")}><span>⌂</span>发现主题</button><button className={`nav-item nav-button ${view === "subscriptions" ? "active" : ""}`} onClick={() => setView("subscriptions")}><span>◉</span>我的订阅 <b>{subscriptions.length}</b></button><button className={`nav-item nav-button ${view === "topics" ? "active" : ""}`} onClick={() => setView("topics")}><span>◇</span>我发布的 <b>{owned.length}</b></button><button className={`nav-item nav-button ${view === "deliveries" ? "active" : ""}`} onClick={() => setView("deliveries")}><span>↗</span>推送记录</button></nav>
      <div className="sidebar-bottom">{user && <a className="nav-item" href="/profile"><span>♙</span>个人中心</a>}<button className="nav-item nav-button" onClick={() => { setNotice(""); setShowAdapters(true); }}><span>⚙</span>适配器与客户端 <b>{endpoints.length}</b></button>{user && <div className="user-card"><span className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</span><span><strong>{user.displayName}</strong><small>{endpoints.length} 个通知客户端</small></span><button aria-label="退出登录" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); setUser(null); }}>退出</button></div>}</div>
    </aside>
    <section className="content" id="discover">
      <header className="topbar"><label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索主题、介绍或发布者" /></label><button className="ghost-button" onClick={() => openCredentials({ topic: { name: "Bark 兼容接入" }, ingress: "https://your-site/api/ingress/TOPIC_ID" })}>接入文档</button><button className="primary-button" disabled={!user} onClick={openPublish}>＋ 发布主题</button></header>
      {view === "discover" && <><div className="hero"><div><p className="eyebrow">DISCOVER</p><h1>订阅值得抵达的消息。</h1><p>发布统一通知入口，将一条消息安全分发到每位订阅者的 Bark 或 Webhook。</p></div><div className="signal-card"><div className="pulse"><span></span><i></i><b></b></div><div><strong>端到端推送已就绪</strong><small>验证码登录 · 加密终端 · 幂等分发</small></div></div></div>
      <div className="section-head"><div><h2>{publisherId ? `发布者 ${shortUserId(publisherId)} 的公开主题` : "公开主题"}</h2><p>{visible.length ? "发现并订阅社区维护的通知源" : "还没有匹配的主题"}</p></div><div className="section-filter-actions">{publisherId && <a href="/">清除筛选</a>}<span className="soft-count">{visible.length} 个主题</span></div></div>
      <div className="topic-grid">{visible.map((topic, index) => <article className="topic-card" key={topic.id}><div className="card-top"><span className={`topic-icon ${["mint", "blue", "orange"][index % 3]}`}>{["↗", "◎", "⌁"][index % 3]}</span><span className={`topic-state ${topic.status}`}>{topic.status === "active" ? "运行中" : topic.status}</span></div><h3>{topic.name}</h3><p className="owner"><a href={`/?publisher=${encodeURIComponent(topic.owner_id)}`} title={`查看 ${topic.owner_id} 发布的公开主题`}>{shortUserId(topic.owner_id)}</a><span>·</span><a href={`/t/${topic.slug}`}>/{topic.slug}</a></p><p className="description">{topic.description || "发布者暂未填写主题介绍。"}</p><div className="tags"><span>统一推送</span><span>{topic.owned ? "我发布的" : "公开"}</span></div><div className="card-footer"><span><b>{Number(topic.subscriber_count).toLocaleString()}</b> 位订阅者</span><button className={topic.subscribed ? "subscribed" : "subscribe"} onClick={() => { setSubscribeTopic(topic); setNotice(""); }}>{topic.subscribed ? "管理客户端" : "选择客户端订阅"}</button></div></article>)}</div>
      {owned.length > 0 && <section className="my-channel" id="topics"><div className="section-head"><div><h2>你的发布主题</h2><p>统一入口，自动分发到每一位订阅者</p></div></div>{owned.map((topic) => <div className="channel-row" key={topic.id}><span className="topic-icon dark">⌁</span><div className="channel-main"><strong>{topic.name}</strong><small>/t/{topic.slug}</small></div><div className="metric"><strong>{topic.subscriber_count}</strong><small>订阅者</small></div><div className="metric"><strong>{topic.status === "active" ? "正常" : topic.status}</strong><small>状态</small></div><span className="status"><i></i>运行中</span></div>)}</section>}</>}
      {view === "subscriptions" && <section className="page-panel"><div className="page-title"><p className="eyebrow">SUBSCRIPTIONS</p><h1>我的订阅</h1><p>每个主题可以分发到一个或多个通知客户端。</p></div><div className="data-list">{subscriptions.map((item) => <article className="data-row" key={item.id}><span className={`provider-badge ${item.provider}`}>{item.provider.toUpperCase()}</span><div><strong>{item.topic_name}</strong><small>{item.endpoint_label} · /{item.slug}</small><p>{item.description || "暂无主题介绍"}</p></div><button onClick={() => testEndpoint(item.endpoint_id, item.topic_name)}>测试推送</button></article>)}{subscriptions.length === 0 && <div className="empty-state"><strong>还没有订阅</strong><p>前往“发现主题”，选择一个通知客户端开始订阅。</p><button className="primary-button" onClick={() => setView("discover")}>发现主题</button></div>}</div></section>}
      {view === "topics" && <section className="page-panel"><div className="page-title title-actions"><div><p className="eyebrow">PUBLISHED</p><h1>我发布的主题</h1><p>管理主题状态、订阅人数和生命周期。</p></div><button className="primary-button" onClick={openPublish}>＋ 发布主题</button></div><div className="management-grid">{owned.map((topic) => <article className="manage-card" key={topic.id}><div><span className="topic-state active">运行中</span><h3>{topic.name}</h3><p>{topic.description || "暂无主题介绍"}</p><small><a href={`/t/${topic.slug}`}>/{topic.slug}</a> · {topic.subscriber_count} 位订阅者</small></div><div className="manage-actions"><a className="detail-button" href={`/t/${topic.slug}`}>查看详情</a><button className="send-button" onClick={() => { setSendTopic(topic); setNotice(""); }}>手动发送</button><button onClick={() => openCredentials({ topic: { name: topic.name }, ingress: `${location.origin}/api/ingress/${topic.id}` })}>接入信息</button><button className="danger-button" disabled={busy} onClick={() => deleteTopic(topic)}>删除主题</button></div></article>)}{owned.length === 0 && <div className="empty-state"><strong>还没有发布主题</strong><p>创建主题后会获得专属消息写入地址。</p></div>}</div>{notice && <p className="form-notice">{notice}</p>}</section>}
      {view === "deliveries" && <section className="page-panel"><div className="page-title"><p className="eyebrow">DELIVERIES</p><h1>推送记录</h1><p>查看最近 100 条发送结果、目标客户端和失败原因。</p></div><div className="delivery-table"><div className="delivery-head"><span>消息</span><span>主题 / 客户端</span><span>状态</span><span>时间</span></div>{deliveries.map((item) => <article className="delivery-row" key={item.id}><div><strong>{item.title}</strong><small>{item.body}</small></div><div><strong>{item.topic_name}</strong><small>{item.endpoint_label}{item.provider ? ` · ${item.provider.toUpperCase()}` : ""}</small></div><span className={`delivery-status ${item.status}`}>{item.status === "delivered" ? "已送达" : item.status === "retry" ? "等待重试" : item.status === "failed" ? "失败" : item.status === "no_recipients" ? "无接收方" : "处理中"}</span><time>{new Date(item.created_at * 1000).toLocaleString("zh-CN")}</time>{item.last_error && <p className="delivery-error">{item.last_error}</p>}</article>)}{deliveries.length === 0 && <div className="empty-state"><strong>还没有推送记录</strong><p>发送主题消息或客户端测试后，结果会显示在这里。</p></div>}</div></section>}
    </section>

    {user === null && <div className="modal-backdrop login-backdrop"><section className="login-panel"><div className="login-brand"><span className="brand-mark">N</span> NotiCenter</div><p className="eyebrow">SECURE SIGN IN</p><h2>登录 NotiCenter</h2>{oauthProviders.length > 0 && <><div className="social-login-list">{oauthProviders.map((item) => <a className="social-login-button" key={item.slug} href={`/api/auth/oauth/${item.slug}/start`}>{item.type === "github" ? "◆" : "◎"} 使用 {item.name} 登录</a>)}</div><div className="login-divider"><span>或使用通知地址</span></div></>}<p className="login-copy">无需密码。验证码会直接发送到你的通知终端，验证后地址将加密保存。</p>{loginStep === "endpoint" ? <form onSubmit={requestCode}><label>推送系统<select value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}><option value="bark">Bark</option><option value="webhook">自定义 Webhook</option></select></label><label>通知地址<input type="url" required value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder={provider === "bark" ? "https://api.day.app/你的密钥" : "https://…"} /></label><button className="primary-button wide" disabled={busy}>{busy ? "正在发送…" : "发送验证码"}</button></form> : <form onSubmit={verify}><button type="button" className="back-link" onClick={() => setLoginStep("endpoint")}>← 修改通知地址</button><label>6 位验证码<input className="code-input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" /></label><button className="primary-button wide" disabled={busy}>{busy ? "正在验证…" : "验证并登录"}</button></form>}{notice && <p className="form-notice">{notice}</p>}<small className="privacy-note">首次使用社交账号前，请先通过通知地址登录并在个人中心完成绑定。</small></section></div>}
    {showPublish && <div className="modal-backdrop"><section className="dialog"><button className="dialog-close" onClick={() => { setShowPublish(false); setNotice(""); }}>×</button><p className="eyebrow">NEW TOPIC</p><h2>发布通知主题</h2><form onSubmit={publish}><label>主题名称<input name="name" required maxLength={80} placeholder="例如：服务器状态播报" /></label><label>主题介绍<textarea name="description" maxLength={500} rows={4} placeholder="告诉订阅者会收到什么消息" /></label><label>可见范围<select name="visibility" defaultValue="public"><option value="public">公开，可被发现</option><option value="unlisted">不公开，仅链接可见</option><option value="private">私有</option></select></label><button className="primary-button wide" disabled={busy}>{busy ? "正在创建…" : "创建主题与写入地址"}</button></form>{notice && <p className="form-notice">{notice}</p>}</section></div>}
    {credentials && <div className="modal-backdrop"><section className="dialog credentials"><button className="dialog-close" onClick={() => { setCredentials(null); setCopied(false); setNotice(""); }}>×</button><p className="eyebrow">BARK COMPATIBLE API</p><h2>{credentials.topic.name}</h2><p>无需密钥。可直接使用 Bark 的 GET、JSON POST、表单 POST 或路径参数格式发送通知。</p><label>主题接入地址<code>{credentials.ingress}</code></label><pre>{`curl -X POST '${credentials.ingress}' \\\n  -H 'Content-Type: application/json; charset=utf-8' \\\n  -d '{"title":"标题","body":"消息内容"}'\n\n# Bark 路径格式\ncurl '${credentials.ingress}/标题/消息内容'`}</pre><button className={`primary-button wide copy-feedback ${copied ? "copied" : ""}`} aria-live="polite" onClick={copyCredentials}>{copied ? "✓ 已复制到剪贴板" : "复制接入地址"}</button>{notice && <p className="form-notice">{notice}</p>}</section></div>}
    {showAdapters && <div className="modal-backdrop"><section className="dialog adapter-dialog">
      <button className="dialog-close" onClick={() => setShowAdapters(false)}>×</button>
      <p className="eyebrow">ADAPTERS</p><h2>适配器与通知客户端</h2>
      <p>一个账号可以添加多个 Bark 或 Webhook。关联已有账号后，使用其中任意客户端登录都能管理全部设备。</p>
      <div className="endpoint-list">{endpoints.map((item) => <article className={`endpoint-row ${item.deprecated ? "endpoint-paused" : ""}`} key={item.id}><span className={`provider-badge ${item.provider}`}>{item.provider.toUpperCase()}</span><div>{editingEndpointId === item.id ? <form className="endpoint-rename-form" onSubmit={(event) => renameEndpoint(event, item.id)}><input autoFocus value={editingEndpointLabel} maxLength={60} required onChange={(event) => setEditingEndpointLabel(event.target.value)} aria-label="客户端名称" /><button className="select-button" disabled={busy}>保存</button><button type="button" disabled={busy} onClick={() => { setEditingEndpointId(null); setEditingEndpointLabel(""); }}>取消</button></form> : <strong>{item.label}</strong>}<code className="endpoint-id">ID · {item.id}</code><small>{item.deprecated ? "NTFY 支持已停止，请移除此设备" : `${item.subscription_count} 个订阅 · ${item.last_tested_at ? "测试通过" : "已验证"}`}</small></div><div className="endpoint-actions"><button disabled={busy || editingEndpointId === item.id} onClick={() => { setEditingEndpointId(item.id); setEditingEndpointLabel(item.label); setNotice(""); }}>修改名称</button><button disabled={busy || item.deprecated} onClick={() => testEndpoint(item.id)}>发送测试</button><button className="danger-button" disabled={busy || (!item.deprecated && supportedEndpointCount <= 1)} title={!item.deprecated && supportedEndpointCount <= 1 ? "不能移除最后一台受支持登录设备" : "移除设备并取消其订阅"} onClick={() => removeEndpoint(item)}>移除</button></div></article>)}</div>
      <div className="adapter-divider"><span>添加新客户端</span></div>
      <form onSubmit={addEndpoint}><div className="form-grid"><label>推送类型<select value={adapterProvider} onChange={(e) => setAdapterProvider(e.target.value as typeof adapterProvider)}><option value="bark">Bark</option><option value="webhook">Webhook</option></select></label><label>客户端名称<input name="label" required placeholder="例如：工作手机" /></label></div><label>通知地址<input name="endpoint" type="url" required placeholder={adapterProvider === "bark" ? "https://api.day.app/设备密钥" : "https://example.com/webhook"} /></label>{adapterProvider === "webhook" && <fieldset className="mapping-fieldset"><legend>字段映射</legend><p>NotiCenter 标准字段 → 目标载荷字段名</p><MappingFields provider={adapterProvider} /></fieldset>}<button className="primary-button wide" disabled={busy}>{busy ? "正在发送测试…" : "测试连接并添加"}</button></form>
      <div className="adapter-divider"><span>关联另一个已有账号</span></div>
      <section className="link-account-box">
        <p>验证码会发送到目标客户端。确认后，目标账号的全部客户端、主题和订阅会安全合并，且无法自动拆分。</p>
        {linkStep === "endpoint" ? <form onSubmit={requestAccountLink}><div className="form-grid"><label>目标推送类型<select value={linkProvider} onChange={(e) => setLinkProvider(e.target.value as typeof linkProvider)}><option value="bark">Bark</option><option value="webhook">Webhook</option></select></label><label>已登录过的通知地址<input type="url" required value={linkEndpoint} onChange={(e) => setLinkEndpoint(e.target.value)} placeholder={linkProvider === "bark" ? "https://api.day.app/另一台设备的密钥" : "https://…"} /></label></div><button className="ghost-button wide" disabled={busy}>{busy ? "正在发送…" : "发送账号关联验证码"}</button></form> : <form onSubmit={verifyAccountLink}><button type="button" className="back-link" onClick={() => { setLinkStep("endpoint"); setLinkCode(""); setNotice(""); }}>← 修改目标通知地址</button><label>目标客户端收到的 6 位验证码<input className="code-input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={linkCode} onChange={(e) => setLinkCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" /></label><button className="primary-button wide" disabled={busy}>{busy ? "正在合并…" : "确认并合并两个账号"}</button></form>}
      </section>
      {notice && <p className="form-notice">{notice}</p>}
    </section></div>}
    {subscribeTopic && <div className="modal-backdrop"><section className="dialog"><button className="dialog-close" onClick={() => setSubscribeTopic(null)}>×</button><p className="eyebrow">DELIVERY TARGET</p><h2>选择接收客户端</h2><p>订阅「{subscribeTopic.name}」后，可以向有效客户端发送测试通知。</p><div className="endpoint-list selectable">{endpoints.map((item) => { const isSubscribed = subscriptions.some((subscription) => subscription.topic_id === subscribeTopic.id && subscription.endpoint_id === item.id); return <article className={`endpoint-row ${item.eligible ? "" : "endpoint-paused"}`} key={item.id}><span className={`provider-badge ${item.provider}`}>{item.provider.toUpperCase()}</span><div><strong>{item.label}</strong><small>{item.deprecated ? "NTFY 支持已停止，可取消订阅后移除设备" : !item.eligible ? "超出套餐额度 · 暂停投递" : isSubscribed ? "已订阅 · 可以发送测试" : item.provider === "bark" ? "未订阅 · 原生格式" : "未订阅 · 使用字段映射"}</small></div><button className={isSubscribed ? "unsubscribe-button" : "select-button"} disabled={busy || (item.deprecated && !isSubscribed) || (!item.eligible && !isSubscribed)} onClick={() => setEndpointSubscription(item.id, !isSubscribed)}>{isSubscribed ? "取消订阅" : item.deprecated ? "已停用" : item.eligible ? "订阅" : "已暂停"}</button><button disabled={busy || !isSubscribed || !item.eligible || item.deprecated} title={item.deprecated ? "NTFY 支持已停止" : !item.eligible ? "设备已超出套餐额度" : isSubscribed ? "发送测试通知" : "请先订阅此客户端"} onClick={() => testEndpoint(item.id, subscribeTopic.name)}>测试</button></article>; })}</div>{endpoints.length === 0 && <button className="primary-button wide" onClick={() => { setSubscribeTopic(null); setShowAdapters(true); }}>先添加通知客户端</button>}{notice && <p className="form-notice">{notice}</p>}</section></div>}
    {sendTopic && <div className="modal-backdrop"><section className="dialog manual-dialog"><button className="dialog-close" onClick={() => { setSendTopic(null); setNotice(""); }}>×</button><p className="eyebrow">MANUAL PUSH</p><h2>手动发送 · {sendTopic.name}</h2><p>按 Bark 参数类型填写；空白字段不会加入请求。设备 Key 仅供映射到 Webhook，Bark 客户端始终使用订阅者已验证的地址。</p><form onSubmit={sendManual}><ManualSendFields /><button className="primary-button wide" disabled={busy}>{busy ? "正在分发…" : "发送到所有订阅客户端"}</button></form>{notice && <p className="form-notice">{notice}</p>}</section></div>}
    <style>{`.manual-dialog{width:min(780px,100%)}.manual-fields{display:grid;gap:15px}.boolean-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.dialog .boolean-grid label{display:flex;align-items:center;gap:8px;padding:11px;border:1px solid #dfe6e2;border-radius:9px;background:#f6f8f7}.dialog .boolean-grid input{width:auto}.manage-actions .send-button{background:#245f4d;border-color:#245f4d;color:white}@media(max-width:600px){.boolean-grid{grid-template-columns:1fr}}.delivery-status.no_recipients{background:#f1f2f1;color:#77817c}.form-notice{margin:14px 0 0!important}.selectable .endpoint-row button:disabled{opacity:.42;cursor:not-allowed}.endpoint-row .unsubscribe-button{border-color:#e7c9c6;background:#fff6f5;color:#9a4d47}.endpoint-id{display:block;margin-top:4px;color:#63736b;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:9px;overflow-wrap:anywhere}.endpoint-actions{display:flex;gap:7px}.endpoint-rename-form{display:flex;align-items:center;gap:6px}.endpoint-rename-form input{min-width:0;height:32px;padding:0 8px}.endpoint-rename-form button{flex:0 0 auto}.copy-feedback{position:relative;transition:transform .2s ease,background .2s ease,box-shadow .2s ease}.copy-feedback:active{transform:scale(.98)}.copy-feedback.copied{background:#2f8164;border-color:#2f8164;box-shadow:0 7px 18px #2f81643d;animation:copy-pop .35s ease}@keyframes copy-pop{0%{transform:scale(.97)}60%{transform:scale(1.025)}100%{transform:scale(1)}}`}</style>
  </main>;
}
