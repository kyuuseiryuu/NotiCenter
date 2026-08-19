import { getUser, json } from "../../../lib/server/auth";
export async function GET(request: Request) { return json({ user: await getUser(request) }); }
