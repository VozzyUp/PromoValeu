-- A migração 7 recriou a view deals_ranked sem security_invoker: quem tinha a chave pública
-- conseguia ler todas as ofertas (pendentes, recusadas, motivo da recusa) passando por cima do RLS.
-- O site lê a view com a chave do servidor, então nada muda para ele.
alter view public.deals_ranked set (security_invoker = on);
revoke insert, update, delete, truncate, references, trigger on public.deals_ranked from anon, authenticated;

-- Índice que o Supabase sugeriu (chave estrangeira sem índice).
create index if not exists newsletter_subscribers_user_id_idx on public.newsletter_subscribers (user_id);
