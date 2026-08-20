# NotiCenter

NotiCenter 是一个运行在 Cloudflare 上的通知主题订阅与消息分发中心。发布者可以创建主题并获得 Bark 兼容的推送地址；订阅者可以把一个或多个 Bark 或 Webhook 客户端绑定到主题，统一接收消息。

## 功能

- 使用自己的通知地址验证身份，或通过已绑定的 GitHub、Logto、OIDC 社交账号登录
- 发布、管理和删除通知主题
- 订阅自己或其他用户发布的主题
- 为每个订阅选择一个或多个接收客户端
- 添加、命名和移除多个 Bark 与 Webhook 客户端；移除设备时自动取消其订阅
- 为每个客户端显示稳定的唯一 ID，并可随时修改便于辨认的终端名称
- 公共主题以不可变的发布者用户 ID 标识来源
- 主题卡片显示短发布者 ID，并通过 `/t/{slug}` 打开带可见性保护的详情页
- 通过目标客户端验证码合并已有账号，关联后可用任一设备登录并统一管理全部客户端
- 从完整 Bark 示例 URL 中自动识别设备 Key
- 提供客户端推送测试和订阅测试
- 为 Webhook 配置请求字段映射
- 支持 Bark API 参数映射，包括布尔值、枚举值和扩展参数
- 发布者可通过完整参数表单手动发送主题通知
- 记录消息及每个订阅客户端的投递结果
- 删除主题时自动取消其全部关联订阅
- 提供无需额外鉴权的 Bark 兼容接入地址
- 提供个人中心，可将 GitHub、Logto 或通用 OIDC 社交身份绑定到当前账号
- 提供受 Admin Token 保护的 `/admin` OAuth 配置入口
- 普通用户默认可添加 3 个通知设备，套餐可提升设备额度
- 有效设备按添加时间排序取最早的套餐额度数量；超额设备保留登录与订阅数据，但暂停新增订阅、测试和消息投递，升级后自动恢复
- 后台支持用户、套餐与单次激活码管理，并可为用户设置自定义套餐到期时间
- 个人中心展示当前权益和套餐列表，支持免费套餐订阅及激活码兑换
- 付费套餐支持 Solana 与 TRON USDT（TRC20）付款：后台配置收款地址，用户提交交易哈希，管理员确认到账后激活套餐
- 后台维护 SOL/USDT 对套餐币种的单币价格，下单时计算并锁定应付数量；付款记录可直接跳转 Solana Explorer 或 TRONSCAN

## 技术栈

- React 19
- [vinext](https://github.com/cloudflare/vinext)
- Cloudflare Workers Static Assets
- Cloudflare D1
- Drizzle ORM
- TypeScript

## 本地开发

要求 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

构建和测试：

```bash
npm run build
npm test
```

本地数据库由 Cloudflare Vite 插件模拟，数据库绑定名为 `DB`。数据库结构位于 `db/schema.ts`，SQL 迁移位于 `drizzle/`。

## Bark 兼容推送

创建主题后，页面会显示该主题专属的接入地址。该地址不需要额外的 Authorization Header，可以像 Bark 服务端一样直接调用。

JSON 请求示例：

```bash
curl -X POST 'https://your-domain.example/api/ingress/TOPIC_ID' \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data '{"title":"标题","body":"消息内容"}'
```

路径参数形式也受到支持，适合直接替换已有 Bark Server 地址。接收到的 Bark 参数会保存到消息载荷，并按照每个客户端的适配器配置转换后投递。

## 部署到 Cloudflare

该应用包含 SSR、API 与 D1，不是纯静态站点。推荐使用 Cloudflare Workers Static Assets；部署完成后可在 Cloudflare 控制台的 **Workers & Pages** 中管理。

### 1. 创建 D1 数据库

```bash
npx wrangler d1 create noticenter-db
```

将返回的数据库 ID 配置到 Cloudflare 构建配置中的 `DB` 绑定，然后执行 `drizzle/` 下的迁移文件：

```bash
npx wrangler d1 execute noticenter-db --remote --file drizzle/0000_past_centennial.sql
npx wrangler d1 execute noticenter-db --remote --file drizzle/0001_supreme_purifiers.sql
npx wrangler d1 execute noticenter-db --remote --file drizzle/0002_jazzy_the_hunter.sql
npx wrangler d1 execute noticenter-db --remote --file drizzle/0003_colossal_santa_claus.sql
npx wrangler d1 execute noticenter-db --remote --file drizzle/0004_shocking_warhawk.sql
npx wrangler d1 execute noticenter-db --remote --file drizzle/0005_silly_crusher_hogan.sql
```

### 2. 配置 Secrets

终端地址会使用 AES-GCM 加密后再写入 D1。生产环境必须设置稳定且不可公开的密钥：

```bash
npx wrangler secret put ENDPOINT_ENCRYPTION_KEY
```

建议同时设置会话哈希 Pepper：

```bash
npx wrangler secret put SESSION_PEPPER
```

管理页面 `/admin` 使用独立的 Admin Token 建立 8 小时管理会话。该值也必须作为 Secret 配置：

```bash
npx wrangler secret put ADMIN_TOKEN
```

进入 `/admin` 后可添加 GitHub、Logto 或通用 OIDC 配置。OAuth 服务端登记的回调地址为：

```text
https://your-domain.example/api/oauth/{配置-slug}/callback
```

登录页只展示已启用的 OAuth 配置。社交账号必须先在“个人中心”绑定到通知账号，之后才能用于直接登录；未绑定身份不会自动创建新账号或合并用户。

不要把这些值写入源码、README、`.env` 示例或 Git 历史。更换 `ENDPOINT_ENCRYPTION_KEY` 后，数据库内已有终端地址将无法解密。

### 3. 构建与部署

```bash
npm run build
npx wrangler deploy --config dist/server/wrangler.json --name noticenter
```

部署前需要把生成配置中的 D1 `database_id` 替换为第一步得到的真实 ID。静态资源配置应允许 Cloudflare 直接响应 `/_next/static/*` 等资源；如果强制所有请求先经过 Worker，会造成 CSS、JavaScript 或字体返回 404。

可选的运行时变量：

- `SITE_URL`：生产站点的完整公开地址，用于生成分享元数据
- `ENDPOINT_ENCRYPTION_KEY`：必需，终端地址加密密钥
- `SESSION_PEPPER`：推荐，会话令牌哈希附加密钥
- `ADMIN_TOKEN`：必需，用于保护 `/admin` 与 OAuth 配置接口

## 数据安全

- Bark 和 Webhook 地址以 AES-GCM 密文保存
- 地址去重使用单向 SHA-256 哈希
- 会话令牌只保存哈希值
- `.env*`、构建产物、本地 Wrangler 状态和依赖目录均被 Git 忽略
- 主题接入地址是公开写入端点，应视为机密链接；如有泄露，应删除并重新创建主题

## 项目结构

```text
app/          页面与 API 路由
db/           D1/Drizzle 数据模型
drizzle/      数据库迁移
lib/server/   身份、加密、适配器与投递逻辑
public/       公开静态资源
worker/       Cloudflare Worker 入口
tests/        自动化测试
```

## License

暂未指定开源许可证。在添加许可证前，代码默认保留所有权利。
