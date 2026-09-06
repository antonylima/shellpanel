-- ========================================================
-- ShellPanel - Esquema de Banco de Dados Supabase (PostgreSQL)
-- Execute este script no SQL Editor do seu projeto Supabase:
-- https://supabase.com/dashboard -> Escolha seu projeto -> SQL Editor
-- ========================================================

-- 1. Criação da tabela de comandos
create table if not exists public.commands (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  command text not null,
  category text default 'Geral',
  color text default 'emerald',
  description text default '',
  environment text default 'windows',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Habilitação de Row Level Security (RLS) para isolamento por usuário
alter table public.commands enable row level security;

-- 3. Políticas de RLS: o usuário só pode ler e modificar seus próprios comandos
drop policy if exists "Usuários podem visualizar seus próprios comandos" on public.commands;
create policy "Usuários podem visualizar seus próprios comandos"
on public.commands
for select
using (auth.uid() = user_id);

drop policy if exists "Usuários podem criar seus próprios comandos" on public.commands;
create policy "Usuários podem criar seus próprios comandos"
on public.commands
for insert
with check (auth.uid() = user_id);

drop policy if exists "Usuários podem atualizar seus próprios comandos" on public.commands;
create policy "Usuários podem atualizar seus próprios comandos"
on public.commands
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Usuários podem excluir seus próprios comandos" on public.commands;
create policy "Usuários podem excluir seus próprios comandos"
on public.commands
for delete
using (auth.uid() = user_id);

-- 4. Índice para buscas rápidas por usuário e ambiente
create index if not exists idx_commands_user_env on public.commands (user_id, environment);
