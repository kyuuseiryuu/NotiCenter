import { adminSessionCookie, requireAdminToken, verifyAdminToken } from "../../../../lib/server/admin-auth";
import { errorResponse, json } from "../../../../lib/server/auth";

export async function GET(request: Request) {
  try { await requireAdminToken(request); return json({ authenticated: true }); }
  catch { return json({ authenticated: false }); }
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as { token?: string };
    if (!await verifyAdminToken(input.token ?? "")) return json({ error: "Admin Token 不正确" }, 401);
    return json({ ok: true }, 200, { "set-cookie": await adminSessionCookie() });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE() {
  return json({ ok: true }, 200, { "set-cookie": "noticenter_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });
}
