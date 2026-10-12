import {
  errorResponse,
  parseChatRequest,
  readKey,
  streamChat,
  textStreamResponse,
} from "@/lib/ai/server";

export async function POST(req: Request) {
  try {
    const apiKey = readKey(req);
    const chat = parseChatRequest(await req.json().catch(() => null));
    return await textStreamResponse(streamChat(chat, apiKey, req.signal));
  } catch (err) {
    return errorResponse(err);
  }
}
