-- Supabase Schema for Flow Guru

-- Profiles for user metadata
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- User Memory (jsonb) - Central storage for routine, preferences, etc.
create table public.user_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade unique,
  memory jsonb default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Conversations - Store chat history
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  role text check (role in ('user', 'assistant')),
  content text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Provider Connections (OAuth tokens etc.)
create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  provider text not null, -- 'google-calendar', 'spotify'
  access_token text,
  refresh_token text,
  expires_at timestamp with time zone,
  status text default 'connected',
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  unique(user_id, provider)
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.user_memory enable row level security;
alter table public.conversations enable row level security;
alter table public.provider_connections enable row level security;

-- Policies
create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);

create policy "Users can view their own memory" on public.user_memory for select using (auth.uid() = user_id);
create policy "Users can update their own memory" on public.user_memory for update using (auth.uid() = user_id);
create policy "Users can insert their own memory" on public.user_memory for insert with check (auth.uid() = user_id);

create policy "Users can view their own conversations" on public.conversations for select using (auth.uid() = user_id);
create policy "Users can insert their own conversations" on public.conversations for insert with check (auth.uid() = user_id);

create policy "Users can view their own provider connections" on public.provider_connections for select using (auth.uid() = user_id);
create policy "Users can update their own provider connections" on public.provider_connections for update using (auth.uid() = user_id);
create policy "Users can insert their own provider connections" on public.provider_connections for insert with check (auth.uid() = user_id);
