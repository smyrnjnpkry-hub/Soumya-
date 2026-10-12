import { describe, expect, it } from "vitest";
import { parseChatRequest, RequestError, textStreamResponse } from "@/lib/ai/server";

describe("parseChatRequest", () => {
  const valid = { provider: "xai", model: "grok-4", system: "s", messages: [{ role: "user", content: "hi" }] };

  it("accepts a valid request", () => {
    expect(parseChatRequest(valid)).toEqual(valid);
  });
  it.each([
    [{ ...valid, provider: "ollama" }, "Unknown provider"],
    [{ ...valid, model: "" }, "Invalid model name"],
    [{ ...valid, messages: [] }, "messages must be a non-empty array"],
    [{ ...valid, messages: [{ role: "system", content: "x" }] }, "Each message"],
  ])("rejects %j", (body, msg) => {
    expect(() => parseChatRequest(body)).toThrow(msg);
  });
  it("rejects oversized requests with 413", () => {
    try {
      parseChatRequest({ ...valid, system: "x".repeat(500_000) });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RequestError);
      expect((err as RequestError).status).toBe(413);
    }
  });
});

describe("textStreamResponse", () => {
  it("streams generator output and skips the empty ready signal", async () => {
    async function* gen() {
      yield "";
      yield "Hello";
      yield ", world";
    }
    const res = await textStreamResponse(gen());
    expect(await res.text()).toBe("Hello, world");
  });

  it("surfaces errors thrown before streaming as rejections", async () => {
    async function* gen(): AsyncGenerator<string> {
      throw new RequestError("bad key", 401);
    }
    await expect(textStreamResponse(gen())).rejects.toThrow("bad key");
  });

  it("appends a marker when the stream fails midway", async () => {
    async function* gen() {
      yield "";
      yield "partial";
      throw new Error("boom");
    }
    const res = await textStreamResponse(gen());
    expect(await res.text()).toBe("partial\n\n[Error: boom]");
  });
});
