-- Applied to the Hudhud AI project on 2026-10-29.
-- Feedback about the دلّني assistant itself (not place reviews). Private, owner-only rows.
create table if not exists hudhud_demo.assistant_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid,
  helpful text not null check (helpful in ('yes', 'partly', 'no')),
  used_place text not null check (used_place in ('yes', 'no', 'not_yet')),
  improvements text[] not null default '{}'
    check (improvements <@ array['accuracy', 'proximity', 'variety', 'understanding', 'editing']::text[]),
  created_at timestamptz not null default now()
);
create index if not exists assistant_feedback_user_idx on hudhud_demo.assistant_feedback (user_id);

alter table hudhud_demo.assistant_feedback enable row level security;
revoke all on hudhud_demo.assistant_feedback from anon;
grant select, insert, delete on hudhud_demo.assistant_feedback to authenticated;

create policy assistant_feedback_insert_own on hudhud_demo.assistant_feedback
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy assistant_feedback_select_own on hudhud_demo.assistant_feedback
  for select to authenticated using (user_id = (select auth.uid()));
create policy assistant_feedback_delete_own on hudhud_demo.assistant_feedback
  for delete to authenticated using (user_id = (select auth.uid()));

-- Evaluation numbers for the demo dashboard: aggregates only, never individual rows.
create or replace function hudhud_demo.dallni_stats()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'plans_started', (select count(*) from hudhud_demo.outing_plans),
    'responses', (select count(*) from hudhud_demo.assistant_feedback),
    'helpful_yes', (select count(*) from hudhud_demo.assistant_feedback where helpful = 'yes'),
    'helpful_partly', (select count(*) from hudhud_demo.assistant_feedback where helpful = 'partly'),
    'helpful_no', (select count(*) from hudhud_demo.assistant_feedback where helpful = 'no'),
    'used_yes', (select count(*) from hudhud_demo.assistant_feedback where used_place = 'yes'),
    'used_no', (select count(*) from hudhud_demo.assistant_feedback where used_place = 'no'),
    'used_not_yet', (select count(*) from hudhud_demo.assistant_feedback where used_place = 'not_yet'),
    'improvements', coalesce((
      select json_object_agg(i, n) from (
        select unnest(improvements) as i, count(*) as n from hudhud_demo.assistant_feedback group by 1
      ) x), '{}'::json),
    'published_reviews', (select count(*) from hudhud_demo.reviews where is_published and publish_consent)
  );
$$;
revoke all on function hudhud_demo.dallni_stats() from public;
grant execute on function hudhud_demo.dallni_stats() to anon, authenticated;
