# Database (Supabase)

Mishwarak stores its data in the **`hudhud_demo`** schema of a Supabase Postgres project. The browser connects with the publishable key, and row-level security (RLS) enforces every access rule. No service-role key is used anywhere in the app.

> [!NOTE]
> The base schema and its original synthetic seed (420 places) were created in the Supabase SQL Editor and are not checked into this repository. This folder holds only the migrations applied on top of that seed.

## Project setup

Turn on two settings in the Supabase dashboard:

1. **Expose the schema.** Go to *Project Settings → Data API → Exposed schemas*, add `hudhud_demo`, and save. Without this, every request fails with `PGRST106 Invalid schema`.
2. **Allow anonymous sign-ins.** Go to *Authentication → Sign In / Providers* and turn on *Allow anonymous sign-ins*. Each browser then gets its own anonymous user, and all private rows are owned by `auth.uid()`. If this is off, the app keeps reviews, visits, and preferences in the browser and labels them as local.

Then set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` (see the [main README](../README.md#configuration)).

## Migrations

| File | Adds |
|---|---|
| [`20261029_dallni_assistant_feedback.sql`](migrations/20261029_dallni_assistant_feedback.sql) | `assistant_feedback` table with owner-only RLS, and the `dallni_stats()` function, which returns aggregate counts only |
| [`20261029_places_expansion.sql`](migrations/20261029_places_expansion.sql) | `location_status` / `location_source` columns, the wider category checks, and 202 new places (see [Seed data](#seed-data)). Idempotent: it inserts only rows whose `seed_key` is missing. |

## Access model

| Object | `anon` | `authenticated` (including anonymous users) |
|---|---|---|
| `places` | Read all rows | Read all rows |
| `reviews` | Read rows where `is_published` and `publish_consent` are both true | Own rows only (`user_id = auth.uid()`) |
| `user_preferences`, `visits`, `feedback`, `outing_plans`, `outing_stops`, `assistant_feedback` | No access | Own rows only |
| `dallni_stats()` | Aggregate counts only | Aggregate counts only |

`dallni_stats()` keeps the prototype's original name (the project was first called Dallni), so existing databases need no migration. It is a `security definer` function with an empty `search_path`. It returns totals only, never individual rows, so the stats sheet can show evaluation numbers without exposing anyone's responses.

## How the app uses the database

| Module | Responsibility |
|---|---|
| [`src/lib/supabase.ts`](../src/lib/supabase.ts) | Shared client configuration, pinned to the `hudhud_demo` schema |
| [`src/lib/server/supabasePlaces.ts`](../src/lib/server/supabasePlaces.ts) | Place queries with exact `category`, `subcategory`, and `neighborhood` filters. Distance (Haversine) and ranking are computed in application code. |
| [`src/lib/store.ts`](../src/lib/store.ts) | Anonymous auth, reviews, visits, feedback, preferences, and saved outings |

If Supabase is configured but unreachable, the app shows an error. It never quietly switches to another data source. The offline demo dataset is used only when Supabase is not configured at all.

## Seed data

The database holds 622 places:

| Source | Places | Location |
|---|---|---|
| Original seed: 21 subcategories × 10 districts × 2 | 420 | `synthetic` |
| Expansion: car washes, clothes laundries, mosques, football fields, padel courts, primary and secondary schools (7 subcategories × 10 districts × 2) | 140 | `synthetic` |
| Expansion: 9 universities, Tuwaiq Academy, 8 malls, 20 Riyadh Metro stations, 24 ministries | 62 | 52 `verified`, 10 `approximate` |

Synthetic places are named `تجريبي - …` and have `is_demo = true`. Their names, coordinates (and, for the original seed, ratings) are generated and do not describe real businesses.

The 62 landmarks are real. A `verified` location is the coordinate of the matching OpenStreetMap feature, and `location_source` holds its id (for example `openstreetmap:way/636659011`). An `approximate` location is a best estimate, such as a ministry with no OpenStreetMap feature, and the app labels it as approximate. Landmarks have no rating, review count, price level, opening hours, image or address: those columns are `NULL`, because nothing verified was available.

These queries check that a project matches the expected seed:

```sql
-- Total places: 622
select count(*) from hudhud_demo.places;

-- 32 category/subcategory pairs
select category, subcategory, count(*)
from hudhud_demo.places
group by 1, 2
order by 1, 2;

-- Synthetic places per district: 56 in each of the 10 districts
select neighborhood, count(*)
from hudhud_demo.places
where location_status = 'synthetic'
group by 1;

-- Location status: 560 synthetic, 52 verified, 10 approximate
select location_status, count(*)
from hudhud_demo.places
group by 1;

-- Every place inside the Riyadh bounding box: expect 0
select count(*)
from hudhud_demo.places
where latitude not between 24.3 and 25.2
   or longitude not between 46.3 and 47.2;

-- No duplicate seed keys: expect no rows
select seed_key
from hudhud_demo.places
group by 1
having count(*) > 1;

-- Ratings within 1–5: expect 0
select count(*)
from hudhud_demo.places
where rating < 1 or rating > 5;
```
