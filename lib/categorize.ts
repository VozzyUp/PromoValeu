// Categoria automática pelo nome do produto (ofertas do robô sem categoria fixa na fonte).
// Regras por palavra, na ordem: a primeira categoria que casar ganha. Testado em tests/categorize.test.ts.

export type CategorySlug = "eletronicos" | "casa-e-cozinha" | "games" | "moda" | "mercado" | "beleza-e-saude" | "viagem" | "outros";

/** Sem acento e em minúsculas, para as regras não dependerem de como a loja escreveu. */
export function normalizeTitle(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const w = (words: string) => new RegExp(`(^|[^a-z0-9])(${words})([^a-z0-9]|$)`);

const RULES: [CategorySlug, RegExp][] = [
  ["games", w("gamer|ps5|ps4|playstation|xbox|nintendo|switch 2|console|joystick|controle (sem fio )?(ps|xbox|dualsense|para (ps|xbox|pc))|dualsense|steam deck|jogo (para |de )?(ps|xbox|switch|pc)|gift card|cadeira gamer|mouse ?pad gamer")],
  ["eletronicos", w(
    "iphone|ipad|macbook|smartphone|celular|galaxy|redmi|xiaomi|motorola|moto g|poco|realme|smart ?tv|tv|televisao|monitor|notebook|laptop|tablet|kindle|" +
    "fones?|headphone|headset|earbuds?|airpods|caixa de som|soundbar|alexa|echo dot|echo pop|power ?bank|carregador|bateria portatil|cabo (usb|hdmi|tipo c)|" +
    "camera|dash ?cam|webcam|smartwatch|relogio inteligente|smart ?band|processador|placa de video|placa mae|ssd|hd externo|memoria ram|pendrive|cartao de memoria|" +
    "teclado|mouse|roteador|repetidor|smart ?box|tv box|chromecast|fire tv|projetor|impressora|ventoinhas?|cooler|pasta termica|fonte atx|gabinete|" +
    "drone|microfone|ring ?light|estabilizador|nobreak|filtro de linha|apple watch|echo show",
  )],
  ["beleza-e-saude", w(
    "perfumes?|colonia|deo colonia|desodorante|eau de (parfum|toilette)|edp|edt|shampoo|condicionador|mascara capilar|creme|hidratante|protetor solar|" +
    "maquiagem|batom|base liquida|serum|skincare|sabonete|barbeador|aparador|secador|chapinha|prancha alisadora|escova (secadora|alisadora|dental|de dente)|" +
    "creatina|whey|suplemento|vitamina|colageno|proteina|termometro|medidor de pressao|oximetro|boticario|natura|eudora|avon|nivea|loreal|vichy|" +
    "cerave|la roche|neutrogena|kit presente|esmalte|depilador|massageador",
  )],
  // Mercado inconfundível vem antes de Casa ("café solúvel pote de vidro" não é pote).
  ["mercado", w("cafe (soluvel|em graos|torrado|moido|em capsulas)|capsulas? de cafe|cerveja|whisky|vodka|fraldas?|papel higienico|racao|achocolatado|leite (em po|integral|desnatado)")],
  ["casa-e-cozinha", w(
    "panelas?|frigideira|liquidificador|air ?fryer|fritadeira|cafeteira|sanduicheira|micro-?ondas|geladeira|refrigerador|freezer|fogao|cooktop|forno|" +
    "maquina de lavar|lava e seca|lavadora|secadora de roupas|aspirador|robo aspirador|ventilador|ar condicionado|climatizador|umidificador|purificador|" +
    "guarda-?roupa|comoda|sofa|cama|colchao|travesseiro|toalhas?|jogo de cama|edredom|mesa|cadeira|sala de jantar|balcao|armario|estante|rack|cuba|pia|" +
    "tacas?|copos?|garrafa termica|potes?|multiprocessador|processador de alimentos|batedeira|mixer|pipoqueira|ferro de passar|adega|chaleira|torradeira|" +
    "panela de pressao|panela eletrica|lampadas?|furadeira|parafusadeira|ferramentas?|balanca|organizador|tapete|cortina|varal|lixeira|escorredor|" +
    "jogo de facas|talheres|pratos?|assadeira|forma de bolo|garrafa|cooler termico|caixa termica|stanley|tramontina|electrolux|brastemp|consul|mondial|britania|philco",
  )],
  ["moda", w(
    "tenis|camisetas?|camisas?|calcas?|bermudas?|shorts?|vestidos?|saias?|blusas?|jaquetas?|moletom|casaco|bones?|chinelos?|sandalias?|sapatos?|botas?|" +
    "meias?|cuecas?|calcinhas?|sutia|lingerie|camisola|pijamas?|relogio|oculos|bolsas?|mochilas?|carteira|cinto|touca|luvas?|roupas?|biquini|maio|" +
    "havaianas|nike|adidas|puma|olympikus|mizuno|fila|reserva|hering|polo wear|lacoste|levis",
  )],
  ["mercado", w(
    "cafe|capsulas?|leite|chocolate|bombom|biscoito|bolacha|arroz|feijao|azeite|oleo de soja|macarrao|cerveja|vinho|whisky|vodka|gin|refrigerante|agua mineral|" +
    "suco|achocolatado|fraldas?|papel higienico|lenco umedecido|sabao|detergente|amaciante|desinfetante|racao|petisco|snack|wafer|pasta de amendoim|granola|" +
    "cereal|atum|molho|tempero|acucar|adocante",
  )],
  ["viagem", w("passagens?|voos?|hotel|hospedagem|pacote de viagem|mala de viagem|malas?|resort|cruzeiro|aluguel de carro")],
];

/** Categoria pelo título. Cupom e o que não casar com nada vão para "Outros". */
export function categorize(title: string): CategorySlug {
  const t = normalizeTitle(title);
  if (/^cupom\b/.test(t)) return "outros";
  for (const [slug, re] of RULES) if (re.test(t)) return slug;
  return "outros";
}

export const CATEGORY_SLUGS: CategorySlug[] = ["eletronicos", "casa-e-cozinha", "games", "moda", "mercado", "beleza-e-saude", "viagem", "outros"];

/** Pedido para a IA: uma linha por produto, numerada. */
export function aiCategoryPrompt(titles: string[]): { system: string; user: string } {
  return {
    system:
      "Você classifica produtos de um site de ofertas brasileiro. Categorias: " +
      "eletronicos (celular, TV, fone, informática, câmera), casa-e-cozinha (eletrodomésticos, móveis, utensílios, ferramentas, decoração), " +
      "games (consoles, jogos, acessórios gamer), moda (roupas, calçados, relógios, bolsas, acessórios), mercado (comida, bebida, limpeza, fraldas, pet), " +
      "beleza-e-saude (perfume, cosméticos, higiene, suplementos, saúde), viagem (passagens, hotéis, malas), outros (o resto, cupons, automotivo). " +
      "Responda só com linhas no formato 'número: categoria', uma para cada produto, sem explicação.",
    user: titles.map((t, i) => `${i + 1}: ${t.slice(0, 140)}`).join("\n"),
  };
}

/** Lê a resposta da IA. Linha faltando ou categoria desconhecida fica null (as regras decidem). */
export function parseAiCategories(text: string, count: number): (CategorySlug | null)[] {
  const out: (CategorySlug | null)[] = Array.from({ length: count }, () => null);
  for (const line of text.split("\n")) {
    const m = /^\s*(\d+)\s*[:.)-]\s*([a-z-]+)/i.exec(line);
    if (!m) continue;
    const i = Number(m[1]) - 1;
    const slug = m[2].toLowerCase() as CategorySlug;
    if (i >= 0 && i < count && CATEGORY_SLUGS.includes(slug)) out[i] = slug;
  }
  return out;
}
