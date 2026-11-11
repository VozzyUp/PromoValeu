// Cliente mínimo da API de mensagens da Anthropic (sem SDK: uma chamada só).
import "server-only";

export type AnthropicConfig = { apiKey: string; model: string };

type Reply = { content?: { type: string; text?: string }[]; stop_reason?: string; error?: { message?: string } };

// Os modelos novos pensam antes de responder e o pensamento conta no max_tokens.
// O limite é só um teto (o pensamento é cobrado pelo que usa), então nunca vai abaixo disto.
const MIN_MAX_TOKENS = 2048;

export async function complete(cfg: AnthropicConfig, o: { system: string; user: string; maxTokens: number }): Promise<string> {
  // ANTHROPIC_API_BASE só existe para os testes apontarem para um servidor de mentira.
  const base = process.env.ANTHROPIC_API_BASE ?? "https://api.anthropic.com";
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: cfg.model, max_tokens: Math.max(o.maxTokens, MIN_MAX_TOKENS), system: o.system, messages: [{ role: "user", content: o.user }] }),
    signal: AbortSignal.timeout(25_000),
  });
  const json = (await res.json().catch(() => null)) as Reply | null;
  if (!res.ok) throw new Error(json?.error?.message ?? `A API respondeu ${res.status}.`);
  const text = json?.content?.find((c) => c.type === "text")?.text;
  if (!text) {
    const stop = json?.stop_reason;
    if (stop === "refusal") throw new Error("A IA recusou o pedido.");
    throw new Error(`A API não devolveu texto${stop ? ` (stop_reason: ${stop})` : ""}.`);
  }
  return text;
}