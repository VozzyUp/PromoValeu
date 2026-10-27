-- Fontes de ofertas do WhatsApp (pela UAZAPI): canais (target = 1203...@newsletter) e grupos (target = ...@g.us).
-- Canal: message_id = número do post (serverid). Grupo: message_id = horário da mensagem em milissegundos.
alter table public.sources drop constraint if exists sources_kind_check;
alter table public.sources add constraint sources_kind_check
  check (kind in ('telegram_public', 'telegram_account', 'whatsapp_channel', 'whatsapp_group'));
