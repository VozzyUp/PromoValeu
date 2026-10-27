import { describe, expect, it } from "vitest";
import { parsePost } from "../lib/sources/parse-post";
import {
  channelInviteKey, channelJid, channelPosts, extractLinks, groupPosts, messageText, readChannelInfo, stripFormatting,
} from "../lib/sources/whatsapp-parse";

const OFFER = [
  "🔥 *Smart TV LG 55\" 4K UHD 55UR8750PSA* 🔥",
  "",
  "~De R$ 3.299,00~",
  "Por *R$ 2.199,00* à vista",
  "",
  "🛒 https://produto.mercadolivre.com.br/MLB-1352321521-smart-tv-lg-_JM",
  "",
  "📲 Entre no grupo: https://chat.whatsapp.com/AbCdEf123",
].join("\n");

describe("messageText", () => {
  it("lê texto simples, texto com prévia e legenda de foto", () => {
    expect(messageText({ conversation: "a" })).toBe("a");
    expect(messageText({ extendedTextMessage: { text: "b" } })).toBe("b");
    expect(messageText({ imageMessage: { caption: "c" } })).toBe("c");
    expect(messageText({ imageMessage: {} })).toBe("");
    expect(messageText(null)).toBe("");
  });
});

describe("stripFormatting e extractLinks", () => {
  it("tira *negrito* e ~riscado~ guardando os trechos", () => {
    const r = stripFormatting(OFFER);
    expect(r.text).toContain("Por R$ 2.199,00 à vista");
    expect(r.text).not.toContain("~");
    expect(r.bold).toContain("R$ 2.199,00");
    expect(r.strike).toEqual(["De R$ 3.299,00"]);
  });
  it("não estraga link com sublinhado e ignora links de grupo", () => {
    expect(extractLinks(stripFormatting(OFFER).text)).toEqual(["https://produto.mercadolivre.com.br/MLB-1352321521-smart-tv-lg-_JM"]);
    expect(extractLinks("veja https://amzn.to/abc. e https://wa.me/5511")).toEqual(["https://amzn.to/abc"]);
  });
});

describe("channelPosts", () => {
  it("monta publicações em ordem e a leitura de oferta entende preço, preço antigo e título", () => {
    const posts = channelPosts([
      { serverid: 102, timestamp: "2026-10-26T20:00:00Z", message: { conversation: "Bom dia, pessoal!" } },
      { serverid: 101, timestamp: "2026-10-26T19:00:00Z", message: { imageMessage: { caption: OFFER } } },
      { serverid: 103, message: { stickerMessage: {} } },
    ]);
    expect(posts.map((p) => p.id)).toEqual([101, 102]);
    expect(posts[0].postedAt?.toISOString()).toBe("2026-10-26T19:00:00.000Z");
    const parsed = parsePost(posts[0]);
    expect(parsed.priceCents).toBe(219900);
    expect(parsed.listPriceCents).toBe(329900);
    expect(parsed.title).toContain("Smart TV LG");
    expect(parsed.links).toHaveLength(1);
  });
});

describe("groupPosts", () => {
  it("usa o horário como número e ignora as mensagens enviadas pela própria conta", () => {
    const posts = groupPosts([
      { messageTimestamp: 1761500000000, text: OFFER },
      { messageTimestamp: 1761400000000, text: "oi" },
      { messageTimestamp: 1761600000000, text: "nossa mensagem", fromMe: true },
      { messageTimestamp: 1761700000000, text: "" },
    ]);
    expect(posts.map((p) => p.id)).toEqual([1761400000000, 1761500000000]);
  });
});

describe("identificação do canal", () => {
  it("lê a chave do link de convite e o JID digitado", () => {
    expect(channelInviteKey("https://whatsapp.com/channel/0029VaExemploChave123")).toBe("0029VaExemploChave123");
    expect(channelInviteKey("https://www.whatsapp.com/channel/0029VaExemploChave123/150")).toBe("0029VaExemploChave123");
    expect(channelInviteKey("@promocoes")).toBeNull();
    expect(channelJid("120363123456789012@newsletter")).toBe("120363123456789012@newsletter");
    expect(channelJid("120363123456789012")).toBe("120363123456789012@newsletter");
    expect(channelJid("abc")).toBeNull();
  });
  it("acha JID e nome na resposta, em formatos diferentes", () => {
    expect(readChannelInfo({ response: { ID: "120363123456789012@newsletter", ThreadMeta: { Name: { Text: "Ofertas X" } } } }))
      .toEqual({ jid: "120363123456789012@newsletter", name: "Ofertas X" });
    expect(readChannelInfo({ response: { id: "120363999999999999@newsletter", name: "Canal Y" } }))
      .toEqual({ jid: "120363999999999999@newsletter", name: "Canal Y" });
    expect(readChannelInfo({ response: {} })).toEqual({ jid: null, name: null });
  });
});
