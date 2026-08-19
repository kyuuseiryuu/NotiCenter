import { handleIngress } from "../route";

type Context = { params: Promise<{ topicId: string; segments: string[] }> };

async function dispatch(request: Request, context: Context) {
  const { topicId, segments } = await context.params;
  return handleIngress(request, topicId, segments);
}

export const GET = dispatch;
export const POST = dispatch;
