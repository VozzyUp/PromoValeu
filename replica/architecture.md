# Architecture: promo-br (comunidade de ofertas; modelo inspirado no promodescuentos.com)

Fonte: `replica/recon.md` + `replica/features.csv`. Schema completo: `replica/schema.sql`.

## Stack

| layer | choice | why |
| --- | --- | --- |
| web | Next.js 16 (App Router) + React 19 + TypeScript | mesma stack da Big Assessoria; SSR/ISR para SEO das páginas de oferta/loja/categoria |
| styling | Tailwind + tokens de `/replica-design` | rápido, consistente, sem CSS morto |
| database | Postgres no Supabase gerenciado | um banco só, backups, RLS; o mesmo já operado na Big |
| acesso a dados | `@supabase/supabase-js` + SQL em funções `rpc` para o que é pesado (ranking, verificação) | sem ORM extra; a lógica de ranking fica perto dos dados |
| auth | Supabase Auth: e-mail + senha com confirmação, Google opcional | pedido do dono; e-mails transacionais prontos |
| captcha | Cloudflare Turnstile | grátis, sem quebra-cabeça para o usuário; chave no painel |
| email | SMTP próprio no Supabase Auth (Resend ou similar), configurado no painel | entregabilidade melhor que o SMTP padrão |
| arquivos | Supabase Storage, bucket `deal-images` (público) | imagens das ofertas; upload sempre pelo servidor, com redimensionamento via `sharp` |
| jobs | **worker Node na mesma imagem**, serviço separado na stack (1 réplica), agendador interno lendo crons do banco | sem n8n; tudo configurado no painel; web pode escalar sem duplicar jobs |
| pagamentos | Pix (Mercado Pago ou Asaas), **depois da BF** | só para "impulsionar oferta" |
| anúncios | Google AdSense (script carregado após consentimento de cookies) | receita principal; slots vindos de `ad_slots` |
| hosting | imagem `ghcr.io/vozzyup/promo-br` (GitHub Actions) → Portainer, Docker Swarm, Traefik | padrão de `Clientes/Big Assessoria/site` |

Variáveis de ambiente (só o mínimo; o resto é painel):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MASTER_KEY` (32 bytes, criptografa `integrations`),
`HASH_SALT` (hash de visitante), `DOMAIN`, `TRAEFIK_NETWORK`, `ROLE=web|worker`.

Stack no Portainer: dois serviços com a mesma imagem.
- `web`: `ROLE=web`, porta 3000, labels Traefik, 1+ réplicas, `start-first`.
- `worker`: `ROLE=worker`, sem porta, **1 réplica**, `stop-first` (nunca dois agendadores).

## Schema

Tables: 27. Access rules: **RLS ligado em tudo + checagens no código.**
- O navegador só lê o que é público (ofertas publicadas/expiradas, lojas, categorias, comentários visíveis, perfis não banidos, slots e configurações `public.*`).
- Nenhuma escrita direta do navegador: toda escrita é uma server action/rota que valida sessão, papel (`user|moderator|admin`), banimento e limites, e grava com a service role.
- Contadores de voto/comentário mantidos por trigger; `hot_score` mantido pelo job `rank`.
- Restrições "duras" no banco: um voto por usuário/oferta (PK), uma oferta ativa por anúncio de loja (índice único parcial), uma denúncia por pessoa/tipo, um envio por oferta/canal, conversão única por rede/pedido, um clique contado por visitante/oferta/dia.

Grupos: pessoas (`profiles`) · catálogo (`stores`, `affiliate_networks`, `blocked_domains`, `categories`, `products`, `listings`, `price_snapshots`) ·
ofertas (`deals`, `verifications`, `coupons`) · comunidade (`votes`, `comments`, `reports`, `reputation_events`, `moderation_actions`, `alerts`) ·
dinheiro (`clicks`, `conversions`, `boosts`) · painel/jobs (`site_settings`, `integrations`, `ad_slots`, `robot_rules`, `channels`, `dispatches`, `job_runs`).

## API

### Público e comunidade

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| GET `/` | feed "Mais quentes" (padrão) | todos | `?aba=quentes|descontos|novas&cursor` | HTML (SSR, ISR 60s) | F01 |
| GET `/oferta/[slug]` | detalhe + prova de preço + comentários | todos | — | HTML (ISR 60s, revalidado em mudança) | F01 |
| GET `/c/[slug]`, `/loja/[slug]`, `/cupons`, `/busca` | listas filtradas | todos | filtros, cursor | HTML | F01 |
| GET `/black-friday` | hub sazonal | todos | — | HTML | F06 |
| GET `/ir/[code]` | registra clique e redireciona | todos | `?c=canal` | 302 para o link escolhido (autor/dono/direto) ou página "acabou" | F01 |
| GET `/api/feed` | paginação do scroll infinito | todos | aba, categoria, loja, cursor | JSON (cards) | F01 |
| POST action `submitDeal` | publica oferta | logado, e-mail confirmado, não banido | url, título, preço, "de", cupom, categoria, imagem, Turnstile | deal (pending ou published) | F07 |
| POST action `previewLink` | lê o link colado: loja, destino final, título/imagem (og:) | logado | url | sugestão de campos | F07 |
| POST action `vote` | voto quente/frio | logado | dealId, ±1 | contadores | F03 |
| POST action `comment` / `deleteComment` | comentar | logado | dealId, body, parentId | comentário | F07 |
| POST action `report` | funcionou / preço mudou / cupom falhou / spam | todos (anônimo com hash) | dealId ou commentId, kind | ok | verificação |
| POST action `submitCoupon` | publica cupom | logado | loja, código, descrição, validade | coupon | F07 |
| POST action `updateProfile` | nome, avatar | dono do perfil | campos | perfil | — |
| POST action `deleteAccount` | apaga conta (LGPD) | dono | confirmação | ok | — |
| GET `/sitemap.xml`, `/robots.txt`, `/ads.txt` | SEO e anúncios | todos | — | gerados do banco/painel | — |

### Painel (`/painel`, papel moderator/admin; itens marcados ★ só admin)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| action `moderateDeal` | aprovar, rejeitar, expirar, editar, destacar (lote) | mod | ids, ação, motivo | resultado por id | A02 |
| action `createDealAsOwner` | oferta do dono (aplica modo de link da loja) | mod | url, campos | deal | A03 |
| action `moderateUser` | banir, confiar, ajustar reputação | mod | userId, ação | perfil | A13 |
| action `upsertStore` / `upsertCategory` / `upsertCoupon` | cadastros | mod | campos | registro | A04, A05 |
| action `saveIntegration` ★ | salva credenciais criptografadas | admin | key, campos | status | F05 |
| action `testIntegration` ★ | chama a API com a credencial e grava status | admin | key | ok/erro legível | F05 |
| action `upsertRobotRule` ★ / `runJobNow` ★ | robô e "rodar agora" | admin | regra / job | job_run id | F02, A12 |
| action `upsertChannel` ★ / `previewMessage` ★ | canais e modelo de mensagem | admin | campos | preview | F03 |
| action `saveSettings` ★ | marca, SEO, textos, pesos do ranking, limiares | admin | key, value | ok | A09–A11 |
| action `upsertAdSlot` ★ | anúncios | admin | campos | slot | A09 |
| GET `/painel/api/metrics` | cliques, conversões, comissão, cliques sem comissão por loja | mod | período, agrupamento | JSON | A01 |
| GET `/painel/api/runs` | log de jobs | mod | filtro | JSON | A12 |

### Webhooks e saídas

- **Entrada:** pagamento Pix dos boosts (pós-BF; idempotente por `payment_ref`). Nenhum outro webhook no MVP.
- **Saída:** Telegram Bot API, UAZAPI (canal/grupo), Shopee Affiliate Open API (busca, short link, relatório de conversões), feeds/APIs das redes. **Só APIs oficiais com as chaves do dono.**

### Jobs (worker; crons e liga/desliga editáveis no painel; horário America/Sao_Paulo)

| job | padrão | o que faz |
| --- | --- | --- |
| `robot:<regra>` | por regra (ex.: 8h, 13h, 19h) | busca na fonte → normaliza → `listings` + `price_snapshots` → verifica → fila ou publica |
| `snapshot` | 1x/dia (madrugada) | grava preço de todos os `listings` ativos que a fonte permite consultar (histórico) |
| `verify` | a cada 1 min (fila `verdict='pending'`) | casa produto, compara lojas, calcula referência e selo; inflado → rejeita |
| `recheck` | a cada 30 min (10 min na semana da BF) | revalida preço/estoque das publicadas; expira o que mudou |
| `rank` | a cada 5 min | `clicks_24h`, `hot_score` com pesos/gravidade do painel |
| `dispatch` | a cada 1 min | envia `dispatches` dentro da janela e do limite por hora; retry com backoff |
| `sync:shopee` | a cada 1 h | relatório de conversões → `conversions` (idempotente) |
| `expire` | a cada 10 min | expira por `expires_at`, 3+ denúncias (volta para a fila), boosts vencidos |
| `reputation` | a cada 15 min | aplica pontos (aprovado, quente, inflado, denúncia procedente) |
| `cleanup` | 1x/dia | apaga `clicks` > 13 meses, `job_runs` > 90 dias, snapshots além da janela configurada |

Cada execução: `pg_try_advisory_lock(hash(job))`, linha em `job_runs`, timeout por job, erro legível no painel.

## The parts that bite

- **Fuso:** banco em UTC; crons e janelas dos canais em America/Sao_Paulo via lib de fuso (nunca offset fixo).
- **Idempotência:** conversão única por (rede, pedido); envio único por (oferta, canal); pagamento único por `payment_ref`; "rodar agora" respeita a trava.
- **Corrida:** dois usuários postando o mesmo produto → índice único parcial em `listing_id`; o segundo recebe "já existe, vote nela". Voto duplicado → PK.
- **Limites de API:** fila, backoff exponencial e limite por hora configurável; WhatsApp em excesso = número banido.
- **Busca:** Postgres full-text (`pt_unaccent`) + trigram; sem serviço externo.
- **Arquivos:** imagem máx. 5 MB, convertida para WebP no servidor; sem hotlink de imagem da loja.
- **Prévia do link:** uma requisição por link colado, com timeout e tamanho máximo; muitas lojas bloqueiam robôs → sempre dá para preencher à mão. Proteção contra SSRF (bloquear IPs privados/localhost).
- **Spam/abuso:** Turnstile, e-mail confirmado, limite de posts/dia por reputação, fila para iniciantes, domínios bloqueados, banimento.
- **Cache x frescor:** páginas ISR; ao mudar preço/status/votos, `revalidateTag` da oferta e do feed.
- **Performance com anúncios:** slots com altura reservada, AdSense só após consentimento e com carregamento tardio; meta LCP < 2,5 s no 4G.
- **Segredos:** `integrations` só com service role; descriptografa só no servidor; o painel mostra os 4 últimos caracteres.
- **LGPD:** sem IP cru (só hash diário); exclusão de conta apaga o perfil e anonimiza posts; banner de cookies antes dos anúncios.
- **Multi-tenant:** não se aplica (site único); `site_settings` sem `tenant_id` de propósito.

## Build order

1. **Fatia vertical** (prova a stack ponta a ponta, feia):
   cadastro/login (S08) → publicar oferta com link do autor (S06) → feed (S01) → detalhe (S02) → clique `/ir/` registrado → painel aprova (A02).
   Tabelas: `profiles, stores, categories, deals, clicks, moderation_actions`. Deploy na VPS já nesta etapa.
2. **Must-haves para a BF**
   - Comunidade: votos, comentários, denúncias, reputação, limites, banimento (S09, A13).
   - Verificação: `products, listings, price_snapshots, verifications`; jobs `verify/recheck/snapshot`; selos e prova de preço na S02.
   - Ranking: abas Quentes / Maiores descontos / Novas; job `rank`; pesos no painel.
   - Painel: integrações (cripto + testar), robô Shopee, execuções, lojas/modo de link, cupons, aparência/SEO, páginas legais (A02–A07, A10–A12).
   - Monetização: slots AdSense + consentimento + `ads.txt` (A09); hub `/black-friday` (S11); sitemap e dados estruturados.
3. **Should-haves:** envio Telegram/WhatsApp (A08 + `dispatch`), métricas (A01) + `sync:shopee`, busca, categorias, placar de caçadores.
4. **Could / dezembro:** alertas, feeds de redes, Amazon automática, impulsionar com Pix, política "dividir", patrocinados.
5. **Fixes do `/replica-entrepreneur`** quando rodar.

## Diferencial: "Desconto conferido" (plano de 27/10/2026)

**Promessa ao visitante:** toda oferta mostra três fatos com hora, e diz quando não conseguiu conferir.
Nada de "garantido": o selo afirma o que foi visto e quando.

| selo | o que afirma | prova usada |
| --- | --- | --- |
| **Ativa** · conferida há 8 min | o preço na loja é igual ou menor que o anunciado e há estoque | consulta à loja (API ou página) |
| **Desconto real** · 18% abaixo da média de 30 dias | o preço "De" não foi inflado | histórico próprio, Keepa (Amazon), outras lojas |
| **Cupom confirmado** · 12 pessoas nas últimas 2 h | o cupom funcionou de verdade | botão "Funcionou?" + teste automático (fase 3) |
| **Não conferida** | a loja bloqueou a conferência | honestidade, em vez de selo falso |

### Diagnóstico (job_runs de 27/10, recheck)

- Cerca de **50% das conferências falham**.
- **Mercado Livre** (65% das ofertas): `/items` responde 403 em parte dos anúncios, `/user-products` responde 403 sempre, e há 429 (limite de pedidos).
- **Amazon, Shopee, Magalu, Netshoes, Nike, Centauro e AliExpress**: a página não mostra o preço ao servidor, por bloqueio de robô ou porque o preço só aparece depois do JavaScript.
- Não existem ainda:
  - a conferência logo após publicar (hoje só depois de 6 h, 30 por rodada);
  - a conferência antes de enviar aos canais;
  - o job `snapshot` diário (histórico antes da oferta aparecer);
  - o efeito automático das denúncias "preço mudou / cupom falhou" (hoje só vão para a fila).

### Escada de conferência (do mais barato e confiável ao mais caro)

1. **API oficial**:
   - ML: catálogo e anúncio.
   - Shopee: API de afiliados, quando liberarem.
   - Amazon: Keepa, que traz o preço atual e o histórico de anos (plano pago, a confirmar), ou a API de afiliados da Amazon quando houver vendas para liberar.
   - Redes de afiliados com feed de produtos, para lojas que estiverem nelas.
2. **Página simples** (fetch + JSON-LD), como já existe.
3. **Navegador sem tela** (Playwright num serviço `browser` interno do Swarm): abre a página como um navegador, espera o preço e devolve o texto. Lojas com CAPTCHA ou bloqueio forte ficam **Não conferida**; não contornamos bloqueio.
4. **IA lendo o texto da página** (modelo pequeno, só quando o leitor falha). Devolve em JSON:
   - preço;
   - preço no Pix;
   - estoque;
   - condições do cupom (valor mínimo, só app, primeira compra).
5. **Pessoas**: "Funcionou? Sim/Não" ao voltar da loja, mais as denúncias. Duas respostas "não" sem nenhuma "sim" disparam uma conferência na hora.
6. **Teste de cupom no carrinho** (fase 3, opcional):
   - Usa um roteiro fixo por loja (adicionar ao carrinho, aplicar cupom, ler o total), com uma conta de teste do dono.
   - Roda só nas 10–20 ofertas mais clicadas.
   - Não usamos agente de IA "livre" no navegador: é lento, caro, quebra fácil e esbarra em login e CAPTCHA.
   - Antes de ligar, ler os termos de cada loja.

A loja ganha no painel um campo `check_method` (`api | page | browser | none`), e o painel mostra a **cobertura por loja** (% de conferências que deram certo nas últimas 24 h).

### Quando conferir (fila por prioridade, em vez de "a cada 6 h")

- **Oferta nova:** 15 min, 1 h, 3 h, 6 h, e depois a cada 6 h enquanto estiver publicada.
- **Clique em `/ir/`:** se a última conferência tem mais de 30 min, `next_check_at = now()`. As ofertas mais clicadas são conferidas mais.
- **Antes de enviar a um canal (WhatsApp/Telegram/newsletter):** a conferência precisa ter menos de 15 min. Se não tiver, confere na hora. Se falhar, não envia. **O canal é onde a confiança se ganha ou se perde.**
- **Denúncia "preço mudou / acabou / cupom falhou" ou duas respostas "não funcionou":** confere na hora.
- **Limite por loja** (ML: pedidos por minuto). Quando dá 429, espera e tenta de novo, sem contar como falha da oferta.
- **Preço subiu:** mostra "Preço subiu para R$ X (conferido às 14:10)". A oferta só expira depois de duas conferências seguidas com o preço acima.

### Histórico antes da Black Friday (o prazo mais apertado)

O "Desconto real" precisa de 30 dias de preço. A BF é em 27/11, então **a coleta tem que começar já**:

- **Lista de produtos acompanhados** (`listings.tracked_until`), com dois preços por dia. Entram:
  - produtos já postados;
  - os mais vendidos do ML por categoria (endpoint de destaques, a confirmar);
  - uma lista à mão no painel (TVs, celulares, air fryer, notebooks, consoles).
- **Amazon:** o Keepa traz o histórico passado, sem esperar.
- Com histórico, o selo pode dizer "menor preço em 30 dias" ou "subiu 25% em outubro e voltou ao normal". Isso desmonta a "Black Fraude".

### Onde a IA entra (e onde não entra)

- **Entra:**
  - ler a página quando o leitor falha;
  - ler as condições do cupom;
  - decidir casos de "é o mesmo produto?" na comparação entre lojas;
  - escrever a frase de prova ("18% abaixo da média; conferido há 10 min");
  - ler comentários do tipo "comigo não funcionou" como sinal.
- **Não entra:** como robô principal navegando sozinho. O custo, o tempo e os bloqueios não cabem em ~300 ofertas por dia com várias conferências cada.

### Schema (SQL para o Fernando rodar quando a fase 1 for construída)

```sql
create table deal_checks (
  id bigint generated always as identity primary key,
  deal_id uuid not null references deals(id) on delete cascade,
  method text not null check (method in ('api','page','browser','ai','user','staff','cart')),
  outcome text not null check (outcome in ('ok','price_up','price_down','out_of_stock','ended','coupon_ok','coupon_failed','unverifiable','error')),
  price_cents integer check (price_cents >= 0),
  pix_price_cents integer check (pix_price_cents >= 0),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on deal_checks (deal_id, created_at desc);
alter table deal_checks enable row level security;   -- só service role

alter table deals add column last_checked_at timestamptz, add column next_check_at timestamptz,
  add column check_state text check (check_state in ('active','price_up','unverifiable','pending'));
create index deals_due on deals (next_check_at) where status = 'published';

alter table stores add column check_method text not null default 'page' check (check_method in ('api','page','browser','none'));
alter table listings add column tracked_until timestamptz;
create index listings_tracked on listings (tracked_until) where tracked_until is not null;

alter table price_snapshots drop constraint price_snapshots_source_check,
  add constraint price_snapshots_source_check check (source in ('robot','recheck','post','feed','watch','browser'));
```

`reports.kind = 'worked'` já existe e serve para o "Funcionou? Sim".

### Rotas e jobs novos

| o quê | faz |
| --- | --- |
| job `recheck` (a cada 2 min) | pega `next_check_at <= now()` por prioridade, respeita o limite por loja, grava `deal_checks` e agenda a próxima |
| job `watch` (2x/dia) | grava o preço dos `listings` acompanhados |
| job `bestsellers` (1x/dia) | põe os mais vendidos do ML na lista acompanhada |
| serviço `browser` (interno, com token) | `POST /render {url}` → texto visível + JSON-LD |
| `/ir/[code]` | marca a oferta para conferir se a última conferência passou de 30 min |
| action `confirmDeal(id, worked)` | grava "Funcionou?"; dois "não" seguidos disparam a conferência |
| `dispatch` | conferência fresca obrigatória antes de enviar |
| página `/como-conferimos` | explica o método (confiança + SEO + imprensa) |
| painel: cobertura | % conferido por loja nas últimas 24 h, ofertas "Não conferidas" |

### Riscos

- **Bloqueio de robô:** não contornar. Marcar "Não conferida" e medir a cobertura.
- **Termos das lojas:** frequência moderada e só nas ofertas publicadas. O teste de carrinho só depois de ler os termos.
- **Falso negativo expirando oferta boa:** exigir duas falhas seguidas e mostrar "preço subiu" em vez de apagar.
- **Texto do selo:** "conferido às 14:10", nunca "garantido" (CDC).
- **Custo da IA:** só quando o leitor falha, com limite diário no painel.

### Ordem (até a BF, 27/11)

1. **Semana 1 (28/10–03/11):**
   - `deal_checks` + fila por prioridade;
   - conferência antes do envio e no clique;
   - selo "Ativa · conferida há X min" / "Não conferida";
   - serviço `browser` + IA lendo a página;
   - **começar o `watch`** (o histórico não pode esperar).
2. **Semana 2:**
   - "Funcionou?";
   - denúncias disparando a conferência;
   - Keepa na Amazon;
   - mais vendidos do ML na lista acompanhada;
   - "menor preço em 30 dias";
   - painel de cobertura.
3. **Semana 3:**
   - IA lendo as condições do cupom;
   - página `/como-conferimos`;
   - teste de carrinho em 1–2 lojas, se os termos permitirem.
4. **Semana da BF:** conferência a cada 10 min nas ofertas quentes e conteúdo "maquiagem de preço detectada" com os dados do histórico.
