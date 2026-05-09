-- =====================================================
-- 2AS CENTRAL — Schema de autenticação e controle
-- Rodar no SQL Editor do Supabase: fxjrknvaqioabykebibi
-- =====================================================

-- 1. Tabela de perfis (vinculada ao auth.users)
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  email      text,
  role       text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz default now()
);

-- Cria o perfil automaticamente ao cadastrar usuário
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, nome)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Tabela de acesso por painel
create table if not exists public.user_panels (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  panel      text not null check (panel in ('painel', 'financas', 'admissao', 'brand', 'direcao', 'cancelamentos', 'orcamento')),
  granted_at timestamptz default now(),
  unique (user_id, panel)
);

-- IMPORTANTE: em projetos já existentes, o "create table if not exists"
-- não atualiza constraints antigas. Este bloco força a atualização do CHECK
-- para incluir o painel "direcao" e evitar erro 23514 em inserts/updates.
do $$
begin
  alter table public.user_panels
    drop constraint if exists user_panels_panel_check;

  alter table public.user_panels
    add constraint user_panels_panel_check
    check (panel in ('painel', 'financas', 'admissao', 'brand', 'direcao', 'cancelamentos', 'orcamento'));
end $$;

-- 3. RLS — Row Level Security
alter table public.profiles enable row level security;
alter table public.user_panels enable row level security;

-- Profiles: usuário vê só o próprio; admin vê todos
create policy "Usuário vê próprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admin vê todos os perfis"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- User panels: usuário vê só os próprios
create policy "Usuário vê próprios painéis"
  on public.user_panels for select
  using (auth.uid() = user_id);

create policy "Admin gerencia todos os painéis"
  on public.user_panels for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- =====================================================
-- OPCIONAL: tornar você admin (troque pelo seu email)
-- =====================================================
-- update public.profiles set role = 'admin'
-- where email = 'anderson@2asfinancas.com';
