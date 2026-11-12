// Formato comum de uma publicação, venha da página pública do canal ou da conta logada.
export type RawPost = {
  id: number; // número da mensagem no canal ou grupo
  postedAt: Date | null;
  text: string; // texto puro, com quebras de linha
  links: string[]; // endereços dos links, na ordem em que aparecem
  bold: string[]; // trechos em negrito
  strike: string[]; // trechos riscados (costuma ser o preço antigo)
  imageUrl: string | null; // foto pública (só na página do canal)
  postUrl: string | null; // endereço da publicação no Telegram
  mediaId?: string; // WhatsApp: id da mensagem que traz uma imagem (para baixar pela API)
};
