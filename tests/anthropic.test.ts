import { afterEach, describe, expect, it, vi } from "vitest";
import { complete } from "../lib/integrations/anthropic";

const cfg = { apiKey: "k", model: "claude-sonnet-5-5" };
const ask = { system: "s", user: "u", maxTokens: 60 };

function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("complete (Anthropic)", () => {
  it("devolve o texto e manda max_tokens de pelo menos 2048", async () => {
    const fn = stubFetch({ content: [{ type: "thinking" }, { type: "text", text: "ok" }], stop_reason: "end_turn" });
    expect(await complete(cfg, ask)).toBe("ok");
    const sent = JSON.parse((fn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.max_tokens).toBeGreaterThanOrEqual(2048);
    expect(sent.thinking).toBeUndefined();
  });

  it("mantém um maxTokens maior que o piso", async () => {
    const fn = stubFetch({ content: [{ type: "text", text: "ok" }] });
    await complete(cfg, { ...ask, maxTokens: 5000 });
    const sent = JSON.parse((fn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.max_tokens).toBe(5000);
  });

  it("só bloco de pensamento com max_tokens: erro cita o stop_reason", async () => {
    stubFetch({ content: [{ type: "thinking" }], stop_reason: "max_tokens" });
    await expect(complete(cfg, ask)).rejects.toThrow(/stop_reason: max_tokens/);
  });

  it("recusa: mensagem própria", async () => {
    stubFetch({ content: [], stop_reason: "refusal" });
    await expect(complete(cfg, ask)).rejects.toThrow("A IA recusou o pedido.");
  });
});
