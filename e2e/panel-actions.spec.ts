import { expect, test } from "@playwright/test";
import { adminLogin, login, watch } from "./helpers";

// Cada teste desfaz pela própria interface o que fez (apagar regra, desbloquear domínio, voltar texto padrão).
test.describe("ações do painel", () => {
  test.skip(!adminLogin.password, "sem SEED_ADMIN_PASSWORD no .env.local");
  const stamp = Date.now().toString(36);

  test.beforeEach(async ({ page }) => {
    await login(page, adminLogin);
  });

  test("M-1 fila em lote: aprova um cupom de teste, edita, destaca e remove", async ({ page }) => {
    const errors = watch(page);
    await page.goto("/painel");
    const item = page.locator("main li").filter({ hasText: "[e2e]" }).first();
    test.skip((await item.count()) === 0, "nenhuma oferta [e2e] pendente na fila");
    const title = (await item.locator("a").first().innerText()).trim();
    await item.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Aprovar marcadas" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main li").filter({ hasText: title })).toHaveCount(0);

    await page.goto(`/painel/ofertas?q=${encodeURIComponent(title)}&status=published`);
    const row = page.locator("main li").filter({ hasText: title }).first();
    await expect(row).toBeVisible();
    await row.getByLabel("Horas de destaque").selectOption("12");
    await row.getByRole("button", { name: "Destacar", exact: true }).click();
    await expect(row.getByText("em destaque")).toBeVisible();
    await row.getByRole("button", { name: "Tirar destaque" }).click();
    await expect(row.getByText("em destaque")).toHaveCount(0);

    // selo "Patrocinada": aparece na página pública e some ao tirar
    const dealHref = await row.getByRole("link").first().getAttribute("href");
    await row.getByRole("button", { name: "Marcar patrocinada" }).click();
    await expect(row.getByText(/· patrocinada/)).toBeVisible();
    await page.goto(dealHref!);
    await expect(page.getByText("Patrocinada", { exact: true })).toBeVisible();
    await page.goto(`/painel/ofertas?q=${encodeURIComponent(title)}&status=published`);
    await page.locator("main li").filter({ hasText: title }).first().getByRole("button", { name: "Tirar patrocínio" }).click();
    await expect(page.locator("main li").filter({ hasText: title }).first().getByText(/· patrocinada/)).toHaveCount(0);

    await row.getByText("Editar", { exact: true }).click();
    const newTitle = `${title} (editado ${stamp})`.slice(0, 140);
    await row.getByLabel("Título").fill(newTitle);
    await row.getByRole("button", { name: "Salvar" }).click();
    await expect(row.getByText("Salvo.")).toBeVisible();

    await row.getByRole("button", { name: "Remover" }).click();
    await expect(page.locator("main li").filter({ hasText: newTitle })).toHaveCount(0); // sai da lista de publicadas
    await page.goto(`/painel/ofertas?q=${encodeURIComponent("[e2e]")}&status=removed`);
    await expect(page.locator("main li").filter({ hasText: `editado ${stamp}` })).toBeVisible();
    expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  });

  test("M-1b fila: \"Marcar todas\" marca e desmarca todas as ofertas (sem enviar)", async ({ page }) => {
    const errors = watch(page);
    await page.goto("/painel");
    const boxes = page.locator('main li input[type="checkbox"][name="ids"]');
    test.skip((await boxes.count()) === 0, "fila vazia");
    const all = page.getByRole("checkbox", { name: /Marcar todas/ });
    await all.check();
    await expect(page.locator('main li input[name="ids"]:not(:checked)')).toHaveCount(0);
    await expect(page.getByText(`(${await boxes.count()} marcada`)).toBeVisible();
    await all.uncheck();
    await expect(page.locator('main li input[name="ids"]:checked')).toHaveCount(0);
    await boxes.first().check();
    await expect(page.getByText("(1 marcada)")).toBeVisible();
    await boxes.first().uncheck();
    expect(errors).toEqual([]);
  });

  test("M-2 usuários: confiança e suspensão do tester, e o resultado é desfeito", async ({ page }) => {
    await page.goto("/painel/usuarios?q=tester");
    const row = page.locator("main li").filter({ hasText: "@tester" }).first();
    await expect(row).toBeVisible();
    // Aprovar as ofertas de teste na fila (M-1) faz o tester ganhar confiança: tira de volta, para as próximas publicações dele irem para a fila.
    if (await row.getByRole("button", { name: "Tirar confiança" }).count()) {
      await row.getByRole("button", { name: "Tirar confiança" }).click();
      await expect(row.getByText(/· confiável/)).toHaveCount(0);
    }
    try {
      await row.getByPlaceholder("Motivo").fill("teste automatizado");
      await row.getByRole("button", { name: "Suspender" }).click();
      await expect(row.getByText(/suspenso \(teste automatizado\)/)).toBeVisible();
    } finally {
      await page.goto("/painel/usuarios?q=tester");
      const again = page.locator("main li").filter({ hasText: "@tester" }).first();
      if (await again.getByRole("button", { name: "Reativar" }).count()) await again.getByRole("button", { name: "Reativar" }).click();
      await expect(page.locator("main li").filter({ hasText: "@tester" }).first().getByText(/suspenso/)).toHaveCount(0);
    }
  });

  test("M-3 usuários: admin não aparece com botões de ação sobre si mesmo", async ({ page }) => {
    await page.goto("/painel/usuarios?q=admin");
    const me = page.locator("main li").filter({ hasText: "@admin" }).first();
    await expect(me.getByText("você")).toBeVisible();
    await expect(me.getByRole("button", { name: "Suspender" })).toHaveCount(0);
  });

  test("M-4 lojas: domínio inválido é recusado e salvar sem mudar funciona", async ({ page }) => {
    await page.goto("/painel/lojas");
    const first = page.locator("main li details").first();
    if (!(await first.evaluate((d) => (d as HTMLDetailsElement).open))) await first.locator("summary").click();
    const domains = first.locator("input[name=domains]");
    const original = await domains.inputValue();
    await domains.fill("isto não é domínio");
    await first.getByRole("button", { name: "Salvar loja" }).click();
    await expect(first.getByText(/domínio é inválido/i)).toBeVisible();
    await domains.fill(original);
    await first.getByRole("button", { name: "Salvar loja" }).click();
    await expect(first.getByText("Salvo.")).toBeVisible();
  });

  test("M-5 domínio bloqueado: bloqueia, recusa no assistente de publicar e desbloqueia", async ({ page }) => {
    const domain = `bloqueado-${stamp}.example.org`;
    await page.goto("/painel/lojas");
    await page.getByLabel("Domínio", { exact: true }).fill(domain);
    await page.getByLabel("Motivo").fill("teste automatizado");
    await page.getByRole("button", { name: "Bloquear", exact: true }).click();
    await expect(page.getByText("Bloqueado.")).toBeVisible();
    try {
      await page.goto("/publicar/oferta");
      await page.locator("#w-url").fill(`https://www.${domain}/produto`);
      await page.getByRole("button", { name: "Verificar link" }).click();
      await expect(page.getByText("Não aceitamos ofertas desta loja.")).toBeVisible({ timeout: 15_000 });
    } finally {
      await page.goto("/painel/lojas");
      await page.locator("li").filter({ hasText: domain }).getByRole("button", { name: "Desbloquear" }).click();
      await expect(page.locator("li").filter({ hasText: domain })).toHaveCount(0);
    }
  });

  test("M-6 robô: cron inválido é recusado; regra válida é criada e apagada", async ({ page }) => {
    await page.goto("/painel/robo");
    await page.locator("#n-new").fill(`Regra e2e ${stamp}`);
    await page.locator("#c-new").fill("isto nao e cron");
    await page.getByRole("button", { name: "Criar regra" }).click();
    await expect(page.getByText(/Horário inválido/)).toBeVisible();
    await page.locator("#c-new").fill("0 8 * * *");
    await page.locator("#k-new").fill("fone\nteclado");
    await page.getByRole("button", { name: "Criar regra" }).click();
    await expect(page.getByText("Salvo.")).toBeVisible();
    await page.goto("/painel/robo");
    const rule = page.locator("main ul > li").filter({ hasText: `Regra e2e ${stamp}` });
    await expect(rule).toHaveCount(1);
    await expect(rule).toContainText("Desligada");
    await rule.locator("summary").click();
    await rule.getByRole("button", { name: "Apagar regra" }).click();
    await expect(page.getByText(`Regra e2e ${stamp}`)).toHaveCount(0); // espera a lista atualizar antes de conferir de novo
    await page.goto("/painel/robo");
    await expect(page.getByText(`Regra e2e ${stamp}`)).toHaveCount(0);
  });

  test("M-7 canais: modelo sem {link} é recusado; canal criado, teste de envio falha com aviso claro e canal apagado", async ({ page }) => {
    await page.goto("/painel/canais");
    await page.locator("#n-new").fill(`Canal e2e ${stamp}`);
    await page.locator("#g-new").fill("@canal_e2e");
    await page.locator("#m-new").fill("mensagem sem o campo do endereço");
    await page.getByRole("button", { name: "Criar canal" }).click();
    await expect(page.getByText(/precisa ter \{link\}/)).toBeVisible();
    await page.locator("#m-new").fill("Oferta: {titulo} {link}");
    await page.getByRole("button", { name: "Criar canal" }).click();
    await expect(page.getByText("Salvo.")).toBeVisible();
    await page.goto("/painel/canais");
    const ch = page.locator("main ul > li").filter({ hasText: `Canal e2e ${stamp}` });
    await expect(ch).toHaveCount(1);
    await ch.locator("summary").click();
    await ch.getByRole("button", { name: "Enviar mensagem de teste" }).click();
    await expect(ch.getByText(/desligada ou incompleta|Falha|Unauthorized|inválid/i)).toBeVisible({ timeout: 20_000 });
    await ch.getByRole("button", { name: "Apagar canal" }).click();
    await expect(page.getByText(`Canal e2e ${stamp}`)).toHaveCount(0);
    await page.goto("/painel/canais");
    await expect(page.getByText(`Canal e2e ${stamp}`)).toHaveCount(0);
  });

  test("M-8 execuções: rodar agora o job de expirar registra a execução", async ({ page }) => {
    await page.goto("/painel/execucoes");
    await page.getByRole("button", { name: "Expirar vencidas" }).click();
    await expect(page.getByText(/Terminou: \{"expired":\d+\}/)).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByText(/expire · Ok · manual/).first()).toBeVisible();
  });

  test("M-9 anúncios: ID fora do formato é recusado", async ({ page }) => {
    await page.goto("/painel/anuncios");
    await page.getByLabel("ID do editor").fill("123");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText(/formato ca-pub-/)).toBeVisible();
  });

  test("M-10 páginas: editar o texto aparece no site e voltar ao padrão restaura", async ({ page }) => {
    await page.goto("/painel/paginas");
    const card = page.locator("details", { has: page.locator("summary", { hasText: "· /conduta" }) });
    await card.locator("summary").click();
    const box = card.getByRole("textbox");
    const original = await box.inputValue();
    await box.fill(`## Seção de teste ${stamp}\n- item **em negrito** e [link interno](/sobre)\n\nParágrafo com texto suficiente para salvar.`);
    await card.getByRole("button", { name: "Salvar" }).click();
    await expect(card.getByText("Salvo.")).toBeVisible();
    try {
      await page.goto("/conduta");
      await expect(page.getByRole("heading", { level: 2, name: `Seção de teste ${stamp}` })).toBeVisible();
      await expect(page.locator("article strong", { hasText: "em negrito" })).toBeVisible();
      await expect(page.locator('article a[href="/sobre"]')).toBeVisible();
    } finally {
      await page.goto("/painel/paginas");
      const again = page.locator("details", { has: page.locator("summary", { hasText: "· /conduta" }) });
      await again.locator("summary").click();
      await again.getByRole("button", { name: "Voltar ao texto padrão" }).click();
      await expect(again.getByText("Salvo.")).toBeVisible();
      await page.goto("/conduta");
      await expect(page.getByRole("heading", { level: 2, name: "O que não pode" })).toBeVisible();
    }
    expect(original.length).toBeGreaterThan(20);
  });

  test("M-11 faixa da Black Friday: liga, aparece no topo do site e desliga", async ({ page }) => {
    await page.goto("/painel/aparencia");
    const box = page.getByLabel("Mostrar a faixa no topo do site");
    const was = await box.isChecked();
    try {
      await box.check();
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Salvo.")).toBeVisible();
      await page.goto("/");
      await expect(page.getByRole("link", { name: "Ver ofertas" })).toBeVisible();
    } finally {
      await page.goto("/painel/aparencia");
      if (!was) await page.getByLabel("Mostrar a faixa no topo do site").uncheck();
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByText("Salvo.")).toBeVisible();
    }
    await page.goto("/");
    if (!was) await expect(page.getByRole("link", { name: "Ver ofertas" })).toHaveCount(0);
  });

  test("M-12 integrações: sem MASTER_KEY o painel avisa em vez de aceitar credenciais", async ({ page }) => {
    await page.goto("/painel/integracoes");
    const masterKeySet = (await page.getByRole("alert").count()) === 0;
    test.skip(masterKeySet, "o servidor deste teste tem MASTER_KEY");
    await page.getByLabel("Token do bot").fill("123:abc");
    await page.getByRole("button", { name: "Salvar", exact: true }).first().click();
    await expect(page.getByText(/MASTER_KEY não configurada/)).toBeVisible();
  });
  test("M-13 ranking: valor fora do limite é recusado; peso salvo volta na tela e o padrão é restaurado", async ({ page }) => {
    await page.goto("/painel/ranking");
    await page.getByLabel("Votos (quente menos frio)").fill("99");
    await page.getByRole("button", { name: "Salvar pesos" }).click();
    await expect(page.getByText(/fica entre 0 e 10/)).toBeVisible();
    await page.getByLabel("Votos (quente menos frio)").fill("2,5");
    await page.getByRole("button", { name: "Salvar pesos" }).click();
    await expect(page.getByText("Salvo.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Votos (quente menos frio)")).toHaveValue("2,5");
    await page.getByRole("button", { name: "Voltar ao padrão" }).click();
    await expect(page.getByText("Salvo.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Votos (quente menos frio)")).toHaveValue("1,5");
  });
});