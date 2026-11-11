-- Intervalo mínimo entre mensagens de um canal, em minutos. Vazio: o site espaça sozinho (60 ÷ limite por hora).
alter table channels add column if not exists min_interval_min integer check (min_interval_min is null or min_interval_min between 1 and 1440);
