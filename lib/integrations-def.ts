// Quais integrações existem e quais campos cada uma pede. Campos "secret" ficam criptografados e nunca voltam para a tela.
export type IntegrationKey = "shopee" | "telegram" | "uazapi" | "smtp" | "anthropic" | "mercadolivre";

export type FieldDef = { name: string; label: string; secret: boolean; placeholder?: string };

export type IntegrationDef = { key: IntegrationKey; title: string; help: string; fields: FieldDef[]; connect?: { href: string; label: string } };

export const INTEGRATIONS: IntegrationDef[] = [
  {
    key: "shopee",
    title: "Shopee Afiliados",
    help: "Credenciais da API aberta do programa de afiliados (App ID e chave secreta). Usada pelo robô de captação e pela leitura de comissões.",
    fields: [
      { name: "appId", label: "App ID", secret: false },
      { name: "secret", label: "Chave secreta", secret: true },
    ],
  },
  {
    key: "telegram",
    title: "Telegram",
    help: "Token do bot criado no @BotFather. O bot precisa ser administrador do canal onde vai publicar.",
    fields: [{ name: "botToken", label: "Token do bot", secret: true }],
  },
  {
    key: "uazapi",
    title: "WhatsApp (UAZAPI)",
    help: "Endereço do servidor e token da instância que envia para o canal ou grupo.",
    fields: [
      { name: "baseUrl", label: "Endereço do servidor", secret: false, placeholder: "https://seu-servidor.uazapi.com" },
      { name: "token", label: "Token da instância", secret: true },
    ],
  },
  {
    key: "smtp",
    title: "E-mail (SMTP)",
    help: "Servidor que envia o boletim e a confirmação de inscrição. Porta 465 usa conexão segura direta; 587 usa STARTTLS. O e-mail de cadastro e de recuperar senha é configurado à parte, no Supabase.",
    fields: [
      { name: "host", label: "Servidor", secret: false, placeholder: "smtp.seudominio.com.br" },
      { name: "port", label: "Porta", secret: false, placeholder: "587" },
      { name: "user", label: "Usuário", secret: false },
      { name: "password", label: "Senha", secret: true },
      { name: "from", label: "Remetente", secret: false, placeholder: "Nome do site <ofertas@seudominio.com.br>" },
    ],
  },
  {
    key: "anthropic",
    title: "IA para textos (Claude)",
    help: "Chave da API da Anthropic. Liga o botão que sugere título e descrição na hora de publicar. A pessoa sempre vê a sugestão e decide se usa; nada é publicado sozinho.",
    fields: [
      { name: "apiKey", label: "Chave da API", secret: true },
      { name: "model", label: "Modelo", secret: false, placeholder: "claude-haiku-5-5" },
    ],
  },
  {
    key: "mercadolivre",
    title: "Mercado Livre (preços)",
    help: "App criado em developers.mercadolivre.com.br/devcenter, com o endereço de retorno https://www.promovaleu.com.br/api/mercadolivre/retorno e escopo de leitura. Salve o Client ID e a Secret Key, marque Ligada e clique em Conectar. O robô passa a conferir os preços do Mercado Livre pela API (a página da loja bloqueia robôs).",
    fields: [
      { name: "clientId", label: "Client ID", secret: false, placeholder: "Ex.: 1234567890123456" },
      { name: "clientSecret", label: "Secret Key", secret: true },
    ],
    connect: { href: "/api/mercadolivre/conectar", label: "Conectar com o Mercado Livre" },
  },
];

export const integrationDef = (key: string) => INTEGRATIONS.find((i) => i.key === key);