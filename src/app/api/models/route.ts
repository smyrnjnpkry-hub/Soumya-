import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { CLOUD_CHAT_PROVIDERS, OPENAI_COMPATIBLE_BASE_URL, type CloudChatProvider } from "@/lib/ai/providers";
import { errorResponse, readKey, RequestError } from "@/lib/ai/server";

// Lists the models a key can use, so model names never go stale in the UI.
export async function POST(req: Request) {
  try {
    const apiKey = readKey(req);
    const body = (await req.json().catch(() => null)) as { provider?: unknown } | null;
    const provider = body?.provider as CloudChatProvider;
    if (!CLOUD_CHAT_PROVIDERS.includes(provider)) throw new RequestError("Unknown provider");

    const ids: string[] = [];
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey });
      for await (const model of client.models.list({ limit: 100 })) ids.push(model.id);
    } else {
      const client = new OpenAI({ apiKey, baseURL: OPENAI_COMPATIBLE_BASE_URL[provider] });
      for await (const model of client.models.list()) ids.push(model.id);
    }
    return Response.json({ models: ids.sort() });
  } catch (err) {
    return errorResponse(err);
  }
}
