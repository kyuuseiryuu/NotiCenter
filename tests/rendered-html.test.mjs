import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the NotiCenter application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>NotiCenter — 让重要消息准时抵达<\/title>/i);
  assert.match(html, /订阅值得抵达的消息/);
  assert.match(html, /Bark、NTFY 或 Webhook/);
  assert.match(html, /href="\/_next\/static\/css\//);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("keeps product metadata and client capabilities in source", async () => {
  const [page, layout, profile, admin, adminSession, oauthStart, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/profile/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/session/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/oauth/[slug]/start/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /title:\s*"NotiCenter — 让重要消息准时抵达"/);
  assert.match(layout, /description:\s*"面向 Bark、NTFY 与 Webhook/);
  assert.match(page, /const barkMappingFields/);
  assert.match(page, /function ManualSendFields/);
  assert.match(page, /\/api\/subscriptions/);
  assert.match(page, /\/api\/endpoints\/test/);
  assert.match(page, /\/api\/account-links/);
  assert.match(page, /确认并合并两个账号/);
  assert.match(page, /method: "PATCH"/);
  assert.match(page, /ID · \{item\.id\}/);
  assert.match(page, /topic\.owner_id/);
  assert.match(page, /shortUserId/);
  assert.match(page, /\/t\/\$\{topic\.slug\}/);
  assert.match(page, /href="\/profile"/);
  assert.match(profile, /连接账户/);
  assert.match(profile, /\/api\/oauth\/providers/);
  assert.match(admin, /验证 Admin Token/);
  assert.match(admin, /\/api\/admin\/oauth/);
  assert.match(adminSession, /adminSessionCookie/);
  assert.match(oauthStart, /code_challenge_method/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
