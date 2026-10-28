-- Hudhud AI Smart Assistant — Supabase schema
-- Run in Supabase SQL editor. Users are identified by an anonymous device id (uuid)
-- generated in the browser; swap for Supabase Auth (auth.uid()) when login is added.

create table if not exists public.preferences (
  user_id uuid primary key,
  data jsonb not null default '{}'::jsonb,   -- { likes, avoid, minRating, notes }
  consent boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key,
  user_id uuid not null,
  stops jsonb not null,                      -- [{ category, placeId, name, locked }]
  started_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id uuid,
  place_id text not null,
  place_name text not null,
  status text not null check (status in ('pending', 'visited', 'skipped', 'reviewed')),
  created_at timestamptz not null default now()
);

-- Our own reviews. These are never pushed to Google.
create table if not exists public.reviews (
  id uuid primary key,
  user_id uuid not null,
  place_id text not null,
  place_name text not null,
  rating int not null check (rating between 1 and 5),
  experience text not null check (experience in ('excellent', 'average', 'bad')),
  reasons text[] not null default '{}',
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists reviews_place_idx on public.reviews (place_id, created_at desc);

-- Row Level Security.
-- MVP/demo policies: the anon key may read reviews and write its own rows.
-- Tighten to auth.uid() = user_id once Supabase Auth is enabled.
alter table public.preferences enable row level security;
alter table public.plans enable row level security;
alter table public.visits enable row level security;
alter table public.reviews enable row level security;

create policy "reviews are public" on public.reviews for select using (true);
create policy "anyone can publish a review" on public.reviews for insert with check (char_length(body) between 1 and 2000);

create policy "prefs read" on public.preferences for select using (true);
create policy "prefs write" on public.preferences for insert with check (true);
create policy "prefs update" on public.preferences for update using (true);

create policy "plans write" on public.plans for insert with check (true);
create policy "plans update" on public.plans for update using (true);
create policy "plans read" on public.plans for select using (true);

create policy "visits write" on public.visits for insert with check (true);
