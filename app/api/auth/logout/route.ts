import { json, sessionCookie } from "../../../../lib/server/auth";
export async function POST() { return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) }); }
