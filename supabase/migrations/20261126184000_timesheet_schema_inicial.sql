-- NeoRadar | TIMESHEET - schema inicial (projeto Supabase neoradar-timesheet, sa-east-1).
-- Principio de acesso: master ve tudo, sempre. Biometria e geolocalizacao restritas ao master.
create schema if not exists ts;

create table if not exists ts.perfis (
  email       text primary key,
  nome        text,
  papel       text not null default 'empregado' check (papel in ('master','rh_dp','supervisor','empregado')),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create or replace function ts.eh_master()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from ts.perfis p
    where p.ativo and p.papel = 'master' and p.email = (select auth.email())
  )
$$;

create table if not exists ts.empresas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(trim(nome)) >= 2),
  cnpj        text,
  ambiente    text not null default 'misto' check (ambiente in ('onshore','offshore','misto')),
  ativa       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create table if not exists ts.estabelecimentos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references ts.empresas(id) on delete cascade,
  nome          text not null,
  tipo          text not null default 'unidade' check (tipo in ('embarcacao','plataforma','base','unidade')),
  identificacao text,
  ativo         boolean not null default true
);

create table if not exists ts.colaboradores (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references ts.empresas(id) on delete cascade,
  matricula     text not null,
  nome          text not null,
  cargo         text,
  ambiente      text not null default 'onshore' check (ambiente in ('onshore','offshore')),
  embarca       boolean not null default false,
  lotacao       text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  unique (empresa_id, matricula)
);

create table if not exists ts.dispositivos (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references ts.empresas(id) on delete cascade,
  estabelecimento_id uuid references ts.estabelecimentos(id) on delete set null,
  tipo               text not null check (tipo in ('totem','relogio','app')),
  identificacao      text not null,
  ativo              boolean not null default true
);

create table if not exists ts.biometria_facial (
  colaborador_id   uuid primary key references ts.colaboradores(id) on delete cascade,
  consentimento_em timestamptz,
  template_ref     text,
  fornecedor       text,
  ativo            boolean not null default true,
  atualizado_em    timestamptz not null default now()
);

create table if not exists ts.marcacoes (
  id              uuid primary key default gen_random_uuid(),
  colaborador_id  uuid not null references ts.colaboradores(id) on delete cascade,
  hora_registrada timestamptz not null,
  fuso            text not null default '-03:00',
  origem          text not null check (origem in ('totem','app','relogio','ajuste_manual','canal_alternativo')),
  dispositivo_id  uuid references ts.dispositivos(id) on delete set null,
  verificacao     text,
  geo_lat         double precision,
  geo_lon         double precision,
  geo_precisao_m  double precision,
  offline         boolean not null default false,
  recebida_em     timestamptz not null default now(),
  origem_hash     text
);

create table if not exists ts.ajustes (
  id              uuid primary key default gen_random_uuid(),
  colaborador_id  uuid not null references ts.colaboradores(id) on delete cascade,
  dia             date not null,
  marcacao_ref    uuid references ts.marcacoes(id) on delete set null,
  tipo            text not null,
  valor           jsonb,
  motivo          text not null,
  solicitante     text,
  aprovador       text,
  status          text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  criado_em       timestamptz not null default now()
);

create table if not exists ts.regras_jornada (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references ts.empresas(id) on delete cascade,
  nome            text not null,
  fonte           text,
  vigencia_inicio date,
  vigencia_fim    date,
  versao          integer not null default 1,
  aprovado_por    text,
  estado          text not null default 'rascunho' check (estado in ('rascunho','aprovada','revisao')),
  parametros      jsonb not null default '{}'::jsonb
);

create table if not exists ts.jornadas (
  id              uuid primary key default gen_random_uuid(),
  colaborador_id  uuid not null references ts.colaboradores(id) on delete cascade,
  dia             date not null,
  regime          text not null default 'horas_extras' check (regime in ('horas_extras','banco_de_horas')),
  prevista        jsonb not null default '{}'::jsonb,
  realizada       jsonb not null default '{}'::jsonb,
  memoria_calculo jsonb not null default '{}'::jsonb,
  regra_id        uuid references ts.regras_jornada(id) on delete set null,
  status          text not null default 'pendente' check (status in ('pendente','incompleta','verificada')),
  justificativa   text,
  confirmado_por  text,
  confirmado_em   timestamptz,
  unique (colaborador_id, dia)
);

alter table ts.perfis            enable row level security;
alter table ts.empresas          enable row level security;
alter table ts.estabelecimentos  enable row level security;
alter table ts.colaboradores     enable row level security;
alter table ts.dispositivos      enable row level security;
alter table ts.biometria_facial  enable row level security;
alter table ts.marcacoes         enable row level security;
alter table ts.ajustes           enable row level security;
alter table ts.regras_jornada    enable row level security;
alter table ts.jornadas          enable row level security;

do $$
declare t text;
begin
  foreach t in array array['perfis','empresas','estabelecimentos','colaboradores','dispositivos','biometria_facial','marcacoes','ajustes','regras_jornada','jornadas']
  loop
    execute format('create policy master_all on ts.%I for all to authenticated using (ts.eh_master()) with check (ts.eh_master());', t);
  end loop;
end $$;

insert into ts.perfis (email, nome, papel) values
  ('sergio@neoradarsystems.com', 'Sergio Duarte', 'master'),
  ('smichelduarte@gmail.com', 'Sergio Duarte', 'master')
on conflict (email) do update set papel = 'master', ativo = true;
