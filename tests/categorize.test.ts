import { describe, expect, it } from "vitest";
import { aiCategoryPrompt, categorize, parseAiCategories, type CategorySlug } from "../lib/categorize";

// Títulos reais das ofertas do robô (26/10/2026).
const CASES: [string, CategorySlug][] = [
  ["Fone de Ouvido Bluetooth 6.1 Esportivo c/ Gancho", "eletronicos"],
  ["Power Bank Pro 20000mAH ELG PB200BK, Bateria Portátil", "eletronicos"],
  ["Barbeador Elétrico Mondial Power Shave BE-02 - Preto+Prata", "beleza-e-saude"],
  ["Copo Térmico Stanley Pint Adventure Black 2.0 354ml", "casa-e-cozinha"],
  ["Apple iPhone 16e 128GB Branco 6,1\" 48MP iOS 5G", "eletronicos"],
  ["Kit Ventoinhas Acegeek Neon Argb 3x120mm Preto Ag-neon3x1-bk", "eletronicos"],
  ["Smart Box Proeletronic Smartpro PROSB-3000/16gb 4K HD", "eletronicos"],
  ["Balança Digital Precisão 10kg Cozinha Fitness", "casa-e-cozinha"],
  ["Conjunto Sala De Jantar Madesa Tampo De Madeira 4 Cadeiras", "casa-e-cozinha"],
  ["O Boticário Clash Extreme Desodorante Colônia 100ml", "beleza-e-saude"],
  ["Cooktop 5 Bocas A Gás Atlas Agile Up Mega Chama Preto", "casa-e-cozinha"],
  ["Kit Inverno Completo Touca Luva Touch Protetor Pescoço Preto Un", "moda"],
  ["Jogo De Panelas Polido Fortlar 5 Pçs. Polida", "casa-e-cozinha"],
  ["Cupom 15% OFF - Mercado Livre", "outros"],
  ["Guarda-roupa Casal 100% Mdf Com 6 Portas Multimóveis Cr35524 Marrom", "casa-e-cozinha"],
  ["Relogio Technos Masculino 2115MYN/1A 45mm + Pulseira", "moda"],
  ["Philips Walita Multiprocessador PowerChop 750, 4 Acessórios, 750W, 110V", "casa-e-cozinha"],
  ["Creatina Monohidratada 500g Pouch - Growth Supplements", "beleza-e-saude"],
  ["Headset Gamer Havit Gamenote H2002C + U Adaptador USB 7.1", "games"],
  ["Tênis Nike Charge Suede Masculino", "moda"],
  ["Liquidificador Easy Power 550w 1,9 Litros Mondial 220V", "casa-e-cozinha"],
  ["L'OR, Café Solúvel Classique Pote de Vidro 130g", "mercado"],
  ["Ventilador de Mesa 30cm Super Power, Mondial, 60W - VSP-30-AP 127V", "casa-e-cozinha"],
  ["Máquina de Lavar 14 Kg Philco Preto PLR14B 12 Programas de Lavagem", "casa-e-cozinha"],
  ["Kit 2 Chinelos Estampados Polo Wear", "moda"],
  ["Panela De Arroz Elétrica Midea 7 Xícaras 220v", "casa-e-cozinha"],
  ["Câmera Automotiva Icarbonx Icx0524 Wifi 1080p Dash Cam", "eletronicos"],
  ["PHILIPS, Smart TV Ambilight 65\" 4K, Titan OS, 65PUG8100/78", "eletronicos"],
  ["Adega de vinho climatizada Electrolux 12 garrafas Uma Porta", "casa-e-cozinha"],
  ["Protetor Solar Corporal em Loção Neutrogena Sun Fresh, FPS 70, 200ml", "beleza-e-saude"],
  ["Kit 6 Peças Conjunto De Roupas Infantil Menina Sortida Verão", "moda"],
  ["Processador AMD Ryzen 7 7700 Box(AM5/8Cores/16Threads)", "eletronicos"],
  ["Camisola Feminina Sexy Renda E Microfibra Lingerie De Luxo", "moda"],
  ["Pneu Sunwide RS-Zero 185/60 R14 82H Kit4", "outros"],
  ["Teclado Mecânico TGT Sherman V3 C1 Compacto 60% Rainbow ABNT2", "eletronicos"],
  ["Shampoo Anticaspa Cabelos Secos com Selênio DS, Dercos DS Vichy", "beleza-e-saude"],
  ["Caixa de Som Redragon Gamer Calliope RGB Preto", "games"],
  ["Garrafa Térmica Gocase Urban Inox Parede Dupla Isolada 500ml", "casa-e-cozinha"],
  ["Fritadeira Air Fryer 5,5L Cyclone Preto e Inox Midea", "casa-e-cozinha"],
];

describe("categorize", () => {
  it.each(CASES)("%s -> %s", (title, slug) => {
    expect(categorize(title)).toBe(slug);
  });
});

describe("resposta da IA", () => {
  it("lê 'número: categoria' e ignora o que não entende", () => {
    expect(parseAiCategories("1: games\n2: casa-e-cozinha\n3: carros\nlixo", 4)).toEqual(["games", "casa-e-cozinha", null, null]);
    expect(parseAiCategories("2) moda\n1. eletronicos", 2)).toEqual(["eletronicos", "moda"]);
  });
  it("monta o pedido numerado", () => {
    expect(aiCategoryPrompt(["A", "B"]).user).toBe("1: A\n2: B");
  });
});
