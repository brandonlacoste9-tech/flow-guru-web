create extension if not exists pg_trgm;

create table if not exists public.user_facts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  fact text not null,
  category text not null default 'general',
  created_at timestamptz default now()
);

create index if not exists user_facts_user_idx on public.user_facts (user_id);
create index if not exists user_facts_fact_trgm_idx
  on public.user_facts using gin (fact gin_trgm_ops);
