-- Conferência das ofertas: registro de cada conferência, fila por horário, "Funcionou?" e acompanhamento de preço.
-- Rodar no SQL Editor do Supabase ANTES de atualizar o site.

create table if not exists deal_checks (
  id bigint generated always as identity primary key,
  deal_id uuid not null references deals(id) on delete cascade,
  method text not null check (method in ('api','page','ai','staff')),
  outcome text not null check (outcome in ('ok','price_up','ended','unverifiable','error')),
  price_cents integer check (price_cents >= 0),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists deal_checks_deal on deal_checks (deal_id, created_at desc);
create index if not exists deal_checks_ai on deal_checks (created_at) where method = 'ai';
alter table deal_checks enable row level security; -- só o servidor (service role) lê e grava

-- "Funcionou pra você?": uma resposta por pessoa (conta ou visitante) por oferta; pode mudar de ideia.
create table if not exists deal_feedback (
  deal_id uuid not null references deals(id) on delete cascade,
  voter_hash text not null,
  worked boolean not null,
  created_at timestamptz not null default now(),
  primary key (deal_id, voter_hash)
);
create index if not exists deal_feedback_recent on deal_feedback (deal_id, created_at desc);
alter table deal_feedback enable row level security;

alter table deals
  add column if not exists last_checked_at timestamptz,
  add column if not exists next_check_at timestamptz,
  add column if not exists check_state text check (check_state in ('active','price_up','unverifiable'));
create index if not exists deals_check_due on deals (next_check_at) where status = 'published';

-- Produtos acompanhados: o preço continua sendo gravado depois que a oferta acaba (histórico para a Black Friday).
alter table listings add column if not exists tracked_until timestamptz;
create index if not exists listings_tracked on listings (checked_at) where tracked_until is not null;

alter table price_snapshots drop constraint if exists price_snapshots_source_check;
alter table price_snapshots add constraint price_snapshots_source_check
  check (source in ('robot','recheck','post','feed','watch'));

-- Começo: tudo que está no ar entra na fila agora; todo produto que já teve oferta passa a ser acompanhado por 60 dias.
update deals set next_check_at = now()
 where status = 'published' and listing_id is not null and next_check_at is null;
update listings l set tracked_until = now() + interval '60 days'
 where tracked_until is null and exists (select 1 from deals d where d.listing_id = l.id);
