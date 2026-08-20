"use client";

import { FormEvent, useEffect, useState } from "react";

type Provider = {
  id: string;
  type: "github" | "logto" | "oidc";
  name: string;
  slug: string;
  client_id: string;
};
type Plan = {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  duration_days: number;
  device_limit: number;
  enabled: number;
  sort_order: number;
  code_count: number;
  subscriber_count: number;
};
type User = {
  id: string;
  display_name: string;
  status: string;
  endpoint_count: number;
  plan_id?: string;
  plan_name?: string;
  device_limit?: number;
  plan_expires_at?: number;
};
type ActivationCode = {
  id: string;
  plan_id: string;
  plan_name: string;
  code_hint: string;
  expires_at?: number;
  redeemed_by?: string;
  redeemed_at?: number;
  redeemed_user_name?: string;
};
type PaymentSetting = {
  id: string;
  method: "solana" | "usdt_trc20";
  display_name: string;
  address: string;
  price_currency: string;
  unit_price_micros: number;
  enabled: number;
};
type PaymentOrder = {
  id: string;
  user_name: string;
  user_id: string;
  plan_name: string;
  method: string;
  amount_cents: number;
  currency: string;
  asset: string;
  crypto_amount: string;
  tx_hash: string;
  status: string;
  reviewer_note?: string;
  created_at: number;
};
type Tab = "users" | "plans" | "codes" | "payments" | "oauth";
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}
const dateText = (value?: number) =>
  value ? new Date(value * 1000).toLocaleString("zh-CN") : "永久";
const money = (plan: Plan) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: plan.currency || "CNY",
  }).format(plan.price_cents / 100);
const explorerUrl = (method: string, txHash: string) =>
  method === "solana"
    ? `https://explorer.solana.com/tx/${encodeURIComponent(txHash)}`
    : `https://tronscan.org/transaction/${encodeURIComponent(txHash)}/overview`;

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState<boolean>();
  const [tab, setTab] = useState<Tab>("users");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [codes, setCodes] = useState<ActivationCode[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSetting[]>([]);
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
  const [oauthType, setOauthType] = useState<Provider["type"]>("github");
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [newCodes, setNewCodes] = useState<string[]>([]);
  async function loadAll() {
    const [providerData, planData, userData, codeData, paymentData] =
      await Promise.all([
        api<{ providers: Provider[] }>("/api/admin/oauth"),
        api<{ plans: Plan[] }>("/api/admin/plans"),
        api<{ users: User[] }>("/api/admin/users"),
        api<{ codes: ActivationCode[] }>("/api/admin/activation-codes"),
        api<{ settings: PaymentSetting[]; orders: PaymentOrder[] }>(
          "/api/admin/payments",
        ),
      ]);
    setProviders(providerData.providers);
    setPlans(planData.plans);
    setUsers(userData.users);
    setCodes(codeData.codes);
    setPaymentSettings(paymentData.settings);
    setPaymentOrders(paymentData.orders);
  }
  useEffect(() => {
    api<{ authenticated: boolean }>("/api/admin/session")
      .then(async ({ authenticated }) => {
        setAuthenticated(authenticated);
        if (authenticated) await loadAll();
      })
      .catch(() => setAuthenticated(false));
  }, []);
  async function run(task: () => Promise<unknown>, success: string) {
    setBusy(true);
    setNotice("");
    try {
      await task();
      setNotice(success);
      await loadAll();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api("/api/admin/session", {
        method: "POST",
        body: JSON.stringify({ token: form.get("token") }),
      });
      setAuthenticated(true);
      await loadAll();
      setNotice("管理身份验证成功");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "验证失败");
    } finally {
      setBusy(false);
    }
  }
  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      id: editingPlan?.id,
      name: form.get("name"),
      description: form.get("description"),
      priceCents: Math.round(Number(form.get("price")) * 100),
      currency: form.get("currency"),
      durationDays: Number(form.get("durationDays")),
      deviceLimit: Number(form.get("deviceLimit")),
      sortOrder: Number(form.get("sortOrder")),
      enabled: form.get("enabled") === "on",
    };
    await run(
      async () => {
        await api("/api/admin/plans", {
          method: editingPlan ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        });
        setEditingPlan(null);
      },
      editingPlan ? "套餐已更新" : "套餐已创建",
    );
  }
  async function generateCodes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const result = await api<{ codes: string[] }>(
        "/api/admin/activation-codes",
        {
          method: "POST",
          body: JSON.stringify({
            planId: form.get("planId"),
            count: Number(form.get("count")),
            expiresAt: form.get("expiresAt") || null,
          }),
        },
      );
      setNewCodes(result.codes);
    }, "激活码已生成，请立即复制保存");
  }
  async function manageUser(event: FormEvent<HTMLFormElement>, userId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(
      () =>
        api("/api/admin/users", {
          method: "PATCH",
          body: JSON.stringify({
            userId,
            action: "assign",
            planId: form.get("planId"),
            expiresAt: form.get("expiresAt") || undefined,
          }),
        }),
      "用户套餐已更新",
    );
  }
  async function createProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(
      () =>
        api("/api/admin/oauth", {
          method: "POST",
          body: JSON.stringify({
            ...Object.fromEntries(form.entries()),
            type: oauthType,
            enabled: true,
          }),
        }),
      "OAuth 配置已添加",
    );
  }
  async function savePaymentSetting(
    event: FormEvent<HTMLFormElement>,
    method: PaymentSetting["method"],
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(
      () =>
        api("/api/admin/payments", {
          method: "PUT",
          body: JSON.stringify({
            method,
            address: form.get("address"),
            priceCurrency: form.get("priceCurrency"),
            unitPrice: Number(form.get("unitPrice")),
            enabled: form.get("enabled") === "on",
          }),
        }),
      "收款地址已保存",
    );
  }
  async function reviewPayment(orderId: string, action: "approve" | "reject") {
    const note =
      window.prompt(
        action === "approve" ? "审核备注（可选）" : "请输入拒绝原因（可选）",
      ) || "";
    await run(
      () =>
        api("/api/admin/payments", {
          method: "PATCH",
          body: JSON.stringify({ orderId, action, note }),
        }),
      action === "approve" ? "付款已确认，套餐已激活" : "付款订单已拒绝",
    );
  }
  if (authenticated === undefined)
    return (
      <main className="standalone-shell">
        <section className="standalone-card">正在验证管理会话…</section>
      </main>
    );
  if (!authenticated)
    return (
      <main className="standalone-shell admin-token-shell">
        <section className="standalone-card admin-token-card">
          <p className="eyebrow">ADMIN ACCESS</p>
          <h1>验证 Admin Token</h1>
          <p>验证后进入用户、套餐、激活码、虚拟货币支付和 OAuth 管理。</p>
          <form onSubmit={login}>
            <label>
              Admin Token
              <input name="token" type="password" required autoFocus />
            </label>
            <button className="primary-button wide" disabled={busy}>
              进入管理页面
            </button>
          </form>
          {notice && <p className="form-notice">{notice}</p>}
        </section>
      </main>
    );
  const defaults =
    oauthType === "github"
      ? { name: "GitHub", scopes: "read:user user:email" }
      : oauthType === "logto"
        ? { name: "Logto", scopes: "openid profile email" }
        : { name: "OIDC", scopes: "openid profile email" };
  return (
    <main className="standalone-shell admin-wide">
      <header className="standalone-header">
        <a className="brand" href="/">
          <span className="brand-mark">N</span>NotiCenter Admin
        </a>
        <button
          onClick={async () => {
            await api("/api/admin/session", { method: "DELETE" });
            setAuthenticated(false);
          }}
        >
          退出管理
        </button>
      </header>
      <nav className="admin-tabs" aria-label="管理功能">
        {(
          [
            ["users", "用户管理"],
            ["plans", "套餐管理"],
            ["codes", "激活码"],
            ["payments", "虚拟货币支付"],
            ["oauth", "OAuth 配置"],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {notice && <p className="form-notice admin-global-notice">{notice}</p>}
      {tab === "users" && (
        <section className="admin-section">
          <div className="admin-section-title">
            <div>
              <p className="eyebrow">USERS</p>
              <h1>用户管理</h1>
            </div>
            <span>{users.length} 位用户</span>
          </div>
          <div className="admin-user-list">
            {users.map((user) => (
              <article className="admin-user-row" key={user.id}>
                <div>
                  <strong>{user.display_name}</strong>
                  <code>{user.id}</code>
                  <small>
                    {user.endpoint_count} 个设备 ·{" "}
                    {user.plan_name || "普通用户（3 台设备）"}
                    {user.plan_expires_at
                      ? ` · ${dateText(user.plan_expires_at)} 到期`
                      : ""}
                  </small>
                </div>
                <form onSubmit={(event) => manageUser(event, user.id)}>
                  <select
                    name="planId"
                    defaultValue={user.plan_id || ""}
                    required
                  >
                    <option value="" disabled>
                      选择套餐
                    </option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                  <input
                    name="expiresAt"
                    type="datetime-local"
                    aria-label="自定义到期时间"
                  />
                  <button disabled={busy}>分配</button>
                </form>
                <div className="row-actions">
                  <button
                    onClick={() =>
                      run(
                        () =>
                          api("/api/admin/users", {
                            method: "PATCH",
                            body: JSON.stringify({
                              userId: user.id,
                              action: "status",
                              status:
                                user.status === "active"
                                  ? "suspended"
                                  : "active",
                            }),
                          }),
                        user.status === "active" ? "用户已停用" : "用户已恢复",
                      )
                    }
                  >
                    {user.status === "active" ? "停用" : "恢复"}
                  </button>
                  {user.plan_id && (
                    <button
                      onClick={() =>
                        run(
                          () =>
                            api("/api/admin/users", {
                              method: "PATCH",
                              body: JSON.stringify({
                                userId: user.id,
                                action: "revoke",
                              }),
                            }),
                          "套餐已撤销",
                        )
                      }
                    >
                      撤销套餐
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {tab === "plans" && (
        <section className="admin-split">
          <div className="admin-section">
            <p className="eyebrow">PLANS</p>
            <h1>套餐列表</h1>
            <div className="plan-admin-list">
              {plans.map((plan) => (
                <article key={plan.id}>
                  <div>
                    <strong>{plan.name}</strong>
                    <span className={plan.enabled ? "state-on" : "state-off"}>
                      {plan.enabled ? "上架" : "下架"}
                    </span>
                    <p>{plan.description || "暂无说明"}</p>
                    <small>
                      {money(plan)} · {plan.duration_days} 天 ·{" "}
                      {plan.device_limit} 台设备 · {plan.subscriber_count}{" "}
                      位有效用户
                    </small>
                  </div>
                  <button onClick={() => setEditingPlan(plan)}>编辑</button>
                  <button
                    onClick={() =>
                      run(
                        () =>
                          api("/api/admin/plans", {
                            method: "DELETE",
                            body: JSON.stringify({ id: plan.id }),
                          }),
                        "套餐已下架",
                      )
                    }
                  >
                    下架
                  </button>
                </article>
              ))}
            </div>
          </div>
          <div className="standalone-card admin-form-card">
            <p className="eyebrow">{editingPlan ? "EDIT PLAN" : "NEW PLAN"}</p>
            <h1>{editingPlan ? "编辑套餐" : "创建套餐"}</h1>
            <form
              className="oauth-config-form"
              key={editingPlan?.id || "new"}
              onSubmit={savePlan}
            >
              <label>
                套餐名称
                <input name="name" defaultValue={editingPlan?.name} required />
              </label>
              <label>
                套餐说明
                <textarea
                  name="description"
                  defaultValue={editingPlan?.description}
                  rows={3}
                />
              </label>
              <div className="form-grid">
                <label>
                  价格
                  <input
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={
                      editingPlan ? editingPlan.price_cents / 100 : 0
                    }
                    required
                  />
                </label>
                <label>
                  币种
                  <input
                    name="currency"
                    defaultValue={editingPlan?.currency || "CNY"}
                    required
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  有效天数
                  <input
                    name="durationDays"
                    type="number"
                    min="1"
                    defaultValue={editingPlan?.duration_days || 30}
                    required
                  />
                </label>
                <label>
                  设备数量
                  <input
                    name="deviceLimit"
                    type="number"
                    min="1"
                    defaultValue={editingPlan?.device_limit || 5}
                    required
                  />
                </label>
              </div>
              <label>
                排序
                <input
                  name="sortOrder"
                  type="number"
                  defaultValue={editingPlan?.sort_order || 0}
                />
              </label>
              <label className="check-label">
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={
                    editingPlan ? Boolean(editingPlan.enabled) : true
                  }
                />
                立即上架
              </label>
              <button className="primary-button wide" disabled={busy}>
                保存套餐
              </button>
              {editingPlan && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setEditingPlan(null)}
                >
                  取消编辑
                </button>
              )}
            </form>
          </div>
        </section>
      )}
      {tab === "codes" && (
        <section className="admin-split">
          <div className="admin-section">
            <p className="eyebrow">ACTIVATION CODES</p>
            <h1>激活码管理</h1>
            {newCodes.length > 0 && (
              <div className="generated-codes">
                <strong>新生成的激活码（仅显示本次）</strong>
                <pre>{newCodes.join("\n")}</pre>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(newCodes.join("\n"))
                  }
                >
                  复制全部
                </button>
              </div>
            )}
            <div className="code-admin-list">
              {codes.map((code) => (
                <article key={code.id}>
                  <div>
                    <strong>{code.plan_name}</strong>
                    <code>••••-{code.code_hint}</code>
                    <small>
                      {code.redeemed_at
                        ? `已由 ${code.redeemed_user_name || code.redeemed_by} 兑换`
                        : code.expires_at
                          ? `${dateText(code.expires_at)} 失效`
                          : "未使用 · 永久有效"}
                    </small>
                  </div>
                  {!code.redeemed_at && (
                    <button
                      onClick={() =>
                        run(
                          () =>
                            api("/api/admin/activation-codes", {
                              method: "DELETE",
                              body: JSON.stringify({ id: code.id }),
                            }),
                          "激活码已删除",
                        )
                      }
                    >
                      删除
                    </button>
                  )}
                </article>
              ))}
            </div>
          </div>
          <div className="standalone-card admin-form-card">
            <p className="eyebrow">GENERATE</p>
            <h1>生成激活码</h1>
            <form className="oauth-config-form" onSubmit={generateCodes}>
              <label>
                对应套餐
                <select name="planId" required>
                  <option value="">请选择</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                生成数量
                <input
                  name="count"
                  type="number"
                  min="1"
                  max="100"
                  defaultValue="1"
                  required
                />
              </label>
              <label>
                激活码失效时间（可选）
                <input name="expiresAt" type="datetime-local" />
              </label>
              <button className="primary-button wide" disabled={busy}>
                生成激活码
              </button>
            </form>
          </div>
        </section>
      )}
      {tab === "payments" && (
        <section className="admin-split">
          <div className="admin-section">
            <p className="eyebrow">PAYMENT ORDERS</p>
            <h1>付款审核</h1>
            <div className="payment-order-list">
              {paymentOrders.map((order) => (
                <article key={order.id}>
                  <div>
                    <strong>
                      {order.user_name} · {order.plan_name}
                    </strong>
                    <small>
                      {order.crypto_amount} {order.asset} · 套餐标价{" "}
                      {(order.amount_cents / 100).toFixed(2)} {order.currency} ·{" "}
                      {dateText(order.created_at)}
                    </small>
                    <code>{order.tx_hash}</code>
                    <a
                      className="transaction-link"
                      href={explorerUrl(order.method, order.tx_hash)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      在区块链浏览器中查看 ↗
                    </a>
                    {order.reviewer_note && <p>{order.reviewer_note}</p>}
                  </div>
                  <span className={`payment-state ${order.status}`}>
                    {order.status === "pending"
                      ? "待审核"
                      : order.status === "approved"
                        ? "已通过"
                        : "已拒绝"}
                  </span>
                  {order.status === "pending" && (
                    <div className="row-actions">
                      <button
                        disabled={busy}
                        onClick={() => reviewPayment(order.id, "approve")}
                      >
                        确认到账
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => reviewPayment(order.id, "reject")}
                      >
                        拒绝
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
            {paymentOrders.length === 0 && (
              <div className="mini-empty">暂无付款订单</div>
            )}
          </div>
          <div className="standalone-card admin-form-card">
            <p className="eyebrow">RECEIVING ADDRESSES</p>
            <h1>收款地址</h1>
            {(["solana", "usdt_trc20"] as const).map((method) => {
              const setting = paymentSettings.find(
                (item) => item.method === method,
              );
              return (
                <form
                  className="oauth-config-form payment-setting-form"
                  key={method}
                  onSubmit={(event) => savePaymentSetting(event, method)}
                >
                  <strong>
                    {method === "solana"
                      ? "Solana（SOL）"
                      : "TRON（USDT-TRC20）"}
                  </strong>
                  <label>
                    收款地址
                    <input
                      name="address"
                      defaultValue={setting?.address || ""}
                      placeholder={
                        method === "solana"
                          ? "Solana 钱包地址"
                          : "T 开头的 TRON 地址"
                      }
                      required
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      套餐计价币种
                      <input
                        name="priceCurrency"
                        defaultValue={setting?.price_currency || "CNY"}
                        maxLength={8}
                        required
                      />
                    </label>
                    <label>
                      1 {method === "solana" ? "SOL" : "USDT"} 的价格
                      <input
                        name="unitPrice"
                        type="number"
                        min="0.000001"
                        step="0.000001"
                        defaultValue={
                          setting
                            ? setting.unit_price_micros / 1_000_000
                            : method === "usdt_trc20"
                              ? 7.2
                              : ""
                        }
                        placeholder={
                          method === "solana" ? "例如 1080 CNY" : "例如 7.2 CNY"
                        }
                        required
                      />
                    </label>
                  </div>
                  <label className="check-label">
                    <input
                      name="enabled"
                      type="checkbox"
                      defaultChecked={setting ? Boolean(setting.enabled) : true}
                    />
                    在用户端启用
                  </label>
                  <button className="primary-button wide" disabled={busy}>
                    保存地址
                  </button>
                </form>
              );
            })}
            <p className="callback-help">
              系统用这里维护的单币价格换算应付数量，并在用户提交订单时锁定汇率快照。修改价格不会影响旧订单。
            </p>
          </div>
        </section>
      )}
      {tab === "oauth" && (
        <section className="admin-split">
          <div className="admin-section">
            <p className="eyebrow">OAUTH PROVIDERS</p>
            <h1>OAuth 配置</h1>
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
                      {provider.client_id} · /{provider.slug}
                    </small>
                  </div>
                  <button
                    onClick={() =>
                      run(
                        () =>
                          api("/api/admin/oauth", {
                            method: "DELETE",
                            body: JSON.stringify({ id: provider.id }),
                          }),
                        "OAuth 配置已删除",
                      )
                    }
                  >
                    删除
                  </button>
                </article>
              ))}
            </div>
          </div>
          <div className="standalone-card admin-form-card">
            <p className="eyebrow">NEW PROVIDER</p>
            <h1>添加配置</h1>
            <form className="oauth-config-form" onSubmit={createProvider}>
              <label>
                类型
                <select
                  value={oauthType}
                  onChange={(event) =>
                    setOauthType(event.target.value as Provider["type"])
                  }
                >
                  <option value="github">GitHub</option>
                  <option value="logto">Logto</option>
                  <option value="oidc">通用 OIDC</option>
                </select>
              </label>
              <div className="form-grid">
                <label>
                  显示名称
                  <input
                    name="name"
                    key={`${oauthType}-name`}
                    defaultValue={defaults.name}
                    required
                  />
                </label>
                <label>
                  标识 slug
                  <input name="slug" placeholder="例如 logto" />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Client ID
                  <input name="clientId" required />
                </label>
                <label>
                  Client Secret
                  <input name="clientSecret" type="password" required />
                </label>
              </div>
              {oauthType !== "github" && (
                <label>
                  Issuer URL
                  <input
                    name="issuer"
                    type="url"
                    required={oauthType === "logto"}
                  />
                </label>
              )}
              {oauthType === "oidc" && (
                <>
                  <label>
                    Authorization URL
                    <input name="authorizationUrl" type="url" required />
                  </label>
                  <label>
                    Token URL
                    <input name="tokenUrl" type="url" required />
                  </label>
                  <label>
                    UserInfo URL
                    <input name="userInfoUrl" type="url" required />
                  </label>
                </>
              )}
              <label>
                Scopes
                <input
                  name="scopes"
                  key={`${oauthType}-scopes`}
                  defaultValue={defaults.scopes}
                  required
                />
              </label>
              <button className="primary-button wide" disabled={busy}>
                保存 OAuth 配置
              </button>
            </form>
          </div>
        </section>
      )}
    </main>
  );
}
