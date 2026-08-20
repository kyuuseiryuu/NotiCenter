"use client";

import { FormEvent, useEffect, useState } from "react";

type User = { id: string; displayName: string };
type Provider = {
  id: string;
  type: string;
  name: string;
  slug: string;
  identity_id?: string;
  username?: string;
  email?: string;
};
type Plan = {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  duration_days: number;
  device_limit: number;
};
type Entitlement = {
  planId: string | null;
  planName: string;
  deviceLimit: number;
  expiresAt: number | null;
  source: string;
};
type PaymentMethod = {
  id: string;
  method: "solana" | "usdt_trc20";
  display_name: string;
  network: string;
  asset: string;
  address: string;
};
type PaymentOrder = {
  id: string;
  method: string;
  plan_name: string;
  amount_cents: number;
  currency: string;
  tx_hash: string;
  status: string;
  reviewer_note?: string;
  created_at: number;
};
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}
const price = (plan: Plan) =>
  plan.price_cents === 0
    ? "免费"
    : new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: plan.currency || "CNY",
      }).format(plan.price_cents / 100);

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [entitlement, setEntitlement] = useState<Entitlement>();
  const [endpointCount, setEndpointCount] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
  const [payingPlan, setPayingPlan] = useState<Plan | null>(null);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const me = await api<{ user: User | null }>("/api/me");
    setUser(me.user);
    if (!me.user) return;
    const [social, planData, paymentData] = await Promise.all([
      api<{ providers: Provider[] }>("/api/oauth/providers"),
      api<{ plans: Plan[]; entitlement: Entitlement; endpointCount: number }>(
        "/api/plans",
      ),
      api<{ methods: PaymentMethod[]; orders: PaymentOrder[] }>(
        "/api/payments",
      ),
    ]);
    setProviders(social.providers);
    setPlans(planData.plans);
    setEntitlement(planData.entitlement);
    setEndpointCount(planData.endpointCount);
    setPaymentMethods(paymentData.methods);
    setPaymentOrders(paymentData.orders);
  }
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("message")) setNotice(params.get("message")!);
    load().catch((error) =>
      setNotice(error instanceof Error ? error.message : "加载失败"),
    );
  }, []);
  async function run(task: () => Promise<unknown>, success: string) {
    setBusy(true);
    setNotice("");
    try {
      await task();
      setNotice(success);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  async function disconnect(identityId: string) {
    if (confirm("确定解除这个社交账户的绑定吗？"))
      await run(
        () =>
          api("/api/oauth/providers", {
            method: "DELETE",
            body: JSON.stringify({ identityId }),
          }),
        "已解除社交账户绑定",
      );
  }
  async function subscribe(plan: Plan) {
    if (plan.price_cents > 0) {
      setPayingPlan(plan);
      setSelectedMethod(paymentMethods[0]?.method || "");
      setNotice(
        paymentMethods.length
          ? "请选择支付网络并在转账后提交交易哈希"
          : "管理员尚未配置虚拟货币收款地址，也可使用激活码兑换",
      );
      return;
    }
    await run(
      () =>
        api("/api/plans", {
          method: "POST",
          body: JSON.stringify({ planId: plan.id }),
        }),
      "免费套餐订阅成功",
    );
  }
  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payingPlan) return;
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await api("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          planId: payingPlan.id,
          method: selectedMethod,
          txHash: form.get("txHash"),
        }),
      });
      event.currentTarget.reset();
      setPayingPlan(null);
    }, "付款信息已提交，管理员确认到账后套餐将自动生效");
  }
  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await api("/api/plans/redeem", {
        method: "POST",
        body: JSON.stringify({ code: form.get("code") }),
      });
      event.currentTarget.reset();
    }, "激活码兑换成功，套餐权益已经生效");
  }
  if (user === undefined)
    return (
      <main className="standalone-shell">
        <section className="standalone-card">正在加载个人中心…</section>
      </main>
    );
  if (!user)
    return (
      <main className="standalone-shell">
        <section className="standalone-card">
          <p className="eyebrow">PROFILE</p>
          <h1>请先登录</h1>
          <p>使用通知地址登录后即可管理套餐和社交账户。</p>
          <a className="primary-button standalone-action" href="/">
            返回并登录
          </a>
        </section>
      </main>
    );
  return (
    <main className="standalone-shell profile-wide">
      <header className="standalone-header">
        <a className="brand" href="/">
          <span className="brand-mark">N</span>NotiCenter
        </a>
        <a href="/">返回主题中心</a>
      </header>
      {notice && <p className="form-notice profile-notice">{notice}</p>}
      <section className="profile-grid">
        <div className="profile-main">
          <section className="standalone-card profile-card">
            <p className="eyebrow">CURRENT PLAN</p>
            <h1>{entitlement?.planName || "普通用户"}</h1>
            <div className="entitlement-stats">
              <div>
                <strong>
                  {endpointCount} / {entitlement?.deviceLimit || 3}
                </strong>
                <small>已用设备</small>
              </div>
              <div>
                <strong>
                  {entitlement?.expiresAt
                    ? new Date(entitlement.expiresAt * 1000).toLocaleDateString(
                        "zh-CN",
                      )
                    : "长期有效"}
                </strong>
                <small>套餐到期</small>
              </div>
            </div>
            <p>
              账号 ID：<code>{user.id}</code>
            </p>
          </section>
          <section className="standalone-card profile-card">
            <p className="eyebrow">AVAILABLE PLANS</p>
            <h1>选择套餐</h1>
            <div className="public-plan-grid">
              {plans.map((plan) => (
                <article
                  className={entitlement?.planId === plan.id ? "current" : ""}
                  key={plan.id}
                >
                  <span>{plan.device_limit} 台设备</span>
                  <h2>{plan.name}</h2>
                  <strong>{price(plan)}</strong>
                  <p>{plan.description || `${plan.duration_days} 天有效期`}</p>
                  <small>{plan.duration_days} 天</small>
                  <button
                    disabled={busy || entitlement?.planId === plan.id}
                    onClick={() => subscribe(plan)}
                  >
                    {entitlement?.planId === plan.id
                      ? "当前套餐"
                      : plan.price_cents === 0
                        ? "立即订阅"
                        : "选择支付方式"}
                  </button>
                </article>
              ))}
            </div>
            {plans.length === 0 && (
              <div className="empty-state">
                <strong>暂无可订阅套餐</strong>
              </div>
            )}
          </section>
        </div>
        <aside className="profile-side">
          <section className="standalone-card profile-card">
            <p className="eyebrow">REDEEM</p>
            <h1>兑换套餐</h1>
            <p>输入管理员提供的激活码，兑换后套餐立即生效。</p>
            <form className="redeem-form" onSubmit={redeem}>
              <input
                id="activation-code"
                name="code"
                placeholder="NTC-XXXX-XXXX-XXXX"
                autoComplete="off"
                required
              />
              <button className="primary-button" disabled={busy}>
                兑换
              </button>
            </form>
          </section>
          <section className="standalone-card profile-card">
            <p className="eyebrow">PAYMENT HISTORY</p>
            <h1>付款记录</h1>
            <div className="profile-payment-list">
              {paymentOrders.map((order) => (
                <article key={order.id}>
                  <div><strong>{order.plan_name}</strong><small>{order.method === "solana" ? "Solana" : "USDT（TRC20）"} · {new Date(order.created_at * 1000).toLocaleDateString("zh-CN")}</small></div>
                  <span className={`payment-state ${order.status}`}>{order.status === "pending" ? "待审核" : order.status === "approved" ? "已通过" : "已拒绝"}</span>
                  {order.reviewer_note && <p>{order.reviewer_note}</p>}
                </article>
              ))}
            </div>
            {paymentOrders.length === 0 && <p className="muted-copy">还没有虚拟货币付款记录。</p>}
          </section>
          <section className="standalone-card profile-card">
            <p className="eyebrow">SOCIAL ACCOUNTS</p>
            <h1>社交账户</h1>
            <div className="social-list">
              {providers.map((provider) => (
                <article className="social-row" key={provider.id}>
                  <span className={`oauth-logo ${provider.type}`}>
                    {provider.type === "github"
                      ? "GH"
                      : provider.type === "logto"
                        ? "L"
                        : "ID"}
                  </span>
                  <div>
                    <strong>{provider.name}</strong>
                    <small>
                      {provider.identity_id
                        ? provider.username || provider.email || "已连接"
                        : "尚未绑定"}
                    </small>
                  </div>
                  {provider.identity_id ? (
                    <button
                      disabled={busy}
                      onClick={() => disconnect(provider.identity_id!)}
                    >
                      解绑
                    </button>
                  ) : (
                    <a
                      className="social-connect"
                      href={`/api/oauth/${provider.slug}/start`}
                    >
                      连接
                    </a>
                  )}
                </article>
              ))}
            </div>
            {providers.length === 0 && (
              <p className="muted-copy">管理员尚未配置 OAuth 登录。</p>
            )}
          </section>
        </aside>
      </section>
      {payingPlan && <div className="modal-backdrop"><section className="dialog payment-dialog"><button className="dialog-close" onClick={() => setPayingPlan(null)}>×</button><p className="eyebrow">CRYPTO PAYMENT</p><h2>订阅 · {payingPlan.name}</h2><p>套餐标价为 {price(payingPlan)}。请按实时汇率转入等值资产，管理员将根据交易哈希人工核对到账金额。</p>{paymentMethods.length > 0 ? <form onSubmit={submitPayment}><label>支付网络<select value={selectedMethod} onChange={(event) => { setSelectedMethod(event.target.value); setCopied(false); }}>{paymentMethods.map((method) => <option value={method.method} key={method.id}>{method.display_name} · {method.network}</option>)}</select></label>{paymentMethods.filter((method) => method.method === selectedMethod).map((method) => <div className="payment-address" key={method.id}><small>收款地址 · {method.asset}</small><code>{method.address}</code><button type="button" className={copied ? "copied" : ""} onClick={async () => { await navigator.clipboard.writeText(method.address); setCopied(true); }}>{copied ? "已复制" : "复制地址"}</button></div>)}<label>交易哈希 / 签名<input name="txHash" autoComplete="off" required placeholder={selectedMethod === "usdt_trc20" ? "64 位 TRON TxID" : "Solana transaction signature"} /></label><button className="primary-button wide" disabled={busy}>提交付款信息</button></form> : <div className="empty-state"><strong>暂不可用</strong><p>管理员尚未配置收款地址，你仍可使用激活码兑换套餐。</p></div>}</section></div>}
    </main>
  );
}
