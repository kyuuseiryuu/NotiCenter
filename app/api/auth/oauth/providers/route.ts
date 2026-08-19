import { errorResponse, json } from "../../../../../lib/server/auth";
import { runtime } from "../../../../../lib/server/crypto";

export async function GET() {
  try {
    const result = await runtime.DB.prepare("SELECT type, name, slug FROM oauth_providers WHERE enabled = 1 ORDER BY created_at ASC").all();
    return json({ providers: result.results });
  } catch (error) { return errorResponse(error); }
}
