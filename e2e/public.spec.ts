import { expect, test } from "@playwright/test";
import { expectAccessible, watch } from "./helpers";

const ROUTES = [
  "/", "/?aba=novas", "/?aba=descontos", "/cupons", "/gratis", "/busca?q=teclado", "/black-friday", "/c/eletronicos", "/loja/amazon",
  "/discussoes", "/sobre", "/como-ganhamos-dinheiro", "/privacidade", "/termos", "/conduta", "/entrar", "/cadastrar", "/recuperar-senha",
];

for (const path of ROUTES) {
  test(`F-PUB ${path}: abre sem erro e sem falha grave de acessibilidade`, async ({ page }) => {
    const errors = watch(page);
    const res = await page.goto(path);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });
}

test("F-PUB oferta: página de uma oferta abre, com ação principal e comentários", async ({ page }) => {
  const errors = watch(page);
  await page.goto("/");
  const link = page.locator('a[href^="/oferta/"]').first();
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  await page.goto(href!);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /ir para a oferta/i }).or(page.getByRole("button", { name: /copiar|cupom/i })).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expectAccessible(page);
  expect(errors).toEqual([]);
});

test("F-PUB busca: termo vazio e termo com aspas soltas não quebram", async ({ page }) => {
  for (const q of ["", '"', "a & b", "<script>alert(1)</script>"]) {
    const res = await page.goto(`/busca?q=${encodeURIComponent(q)}`);
    expect(res?.status()).toBeLessThan(500);
  }
  await page.goto(`/busca?q=${encodeURIComponent("<script>alert(1)</script>")}`);
  expect(await page.content()).not.toContain("<script>alert(1)</script>");
});

test("F-PUB 404: rota inexistente mostra página de não encontrado", async ({ page }) => {
  const res = await page.goto("/nao-existe-mesmo");
  expect(res?.status()).toBe(404);
});

test("F-PUB mobile @mobile: sem rolagem horizontal na home, na oferta e nas listagens", async ({ page }) => {
  for (const path of ["/", "/cupons", "/entrar"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
test("F-SEO oferta com preço tem dados estruturados válidos (Product/Offer)", async ({ page }) => {
  await page.goto("/");
  const links = await page.locator('a[href^="/oferta/"]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("href")))]);
  let found = false;
  for (const href of links.slice(0, 8)) {
    await page.goto(href!);
    const raw = await page.locator('script[type="application/ld+json"]').first().textContent({ timeout: 1500 }).catch(() => null);
    if (!raw) continue; // cupom sem preço não tem
    const data = JSON.parse(raw);
    expect(data["@type"]).toBe("Product");
    expect(data.offers.priceCurrency).toBe("BRL");
    expect(data.offers.price).toMatch(/^\d+\.\d{2}$/);
    found = true;
    break;
  }
  expect(found).toBe(true);
});

test("F-SHARE oferta tem prévia de compartilhamento (título com preço, imagem, canônico) e a imagem padrão existe", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('a[href^="/oferta/"]').first().getAttribute("href");
  await page.goto(href!);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /.{10,}/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /^https?:\/\//);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${href}$`));
  const img = await request.get("/opengraph-image");
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toContain("image/png");
});

test("F-BF hub da Black Friday mostra a contagem regressiva", async ({ page }) => {
  await page.goto("/black-friday");
  await expect(page.getByText(/Faltam \d+ dias para a Black Friday|começa amanhã|É hoje|passou/)).toBeVisible();
});

test("N-1 boletim: o formulário só aparece com SMTP ligado e os links de confirmar e cancelar exigem clique", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Seu e-mail", { exact: true })).toHaveCount(0); // sem SMTP configurado, não promete o que não entrega
  await page.goto("/boletim/confirmar?t=" + "0".repeat(32));
  await expect(page.getByRole("button", { name: "Confirmar inscrição" })).toBeVisible();
  await page.getByRole("button", { name: "Confirmar inscrição" }).click();
  await expect(page.locator("p[role=alert]")).toContainText(/não vale mais/);
  await page.goto("/boletim/sair?t=invalido");
  await page.getByRole("button", { name: "Cancelar inscrição" }).click();
  await expect(page.locator("p[role=alert]")).toContainText(/não vale mais/);
});

test("G-1 login com Google: desligado por padrão, sem botão e sem erro", async ({ page }) => {
  await page.goto("/entrar");
  await expect(page.getByRole("button", { name: "Continuar com Google" })).toHaveCount(0);
  await page.goto("/cadastrar");
  await expect(page.getByRole("button", { name: "Continuar com Google" })).toHaveCount(0);
});
