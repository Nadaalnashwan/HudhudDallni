# Supabase — `hudhud_demo`

The app reads and writes the **`hudhud_demo`** schema of the *Hudhud AI* project. The schema and its
420-place synthetic seed were created in the Supabase SQL Editor (not stored in this repo).

## Required project settings (dashboard)

1. **Project Settings → Data API → Exposed schemas** → add `hudhud_demo` → Save.
   Without it every request fails with `PGRST106 Invalid schema`.
2. **Authentication → Sign In / Providers → Allow anonymous sign-ins** → on.
   Each browser gets an anonymous Supabase user, so reviews, visits, feedback and preferences are
   owned by `auth.uid()`. Without it the app keeps those in the browser and labels them as local.

The seed defines the base grants and RLS. One migration was added on top:
[`migrations/20261029_dallni_assistant_feedback.sql`](migrations/20261029_dallni_assistant_feedback.sql)
(the `assistant_feedback` table with owner-only RLS, and the aggregate-only `dallni_stats()` function).

## Access model (verified)

| Table | anon | authenticated (incl. anonymous users) |
|---|---|---|
| `places` | SELECT (all rows) | SELECT |
| `reviews` | SELECT only where `is_published AND publish_consent` | own rows only (`user_id = auth.uid()`) |
| `user_preferences`, `visits`, `feedback`, `outing_plans`, `outing_stops`, `assistant_feedback` | no access | own rows only |
| `dallni_stats()` (function) | aggregate counts only | aggregate counts only |

The browser only ever holds the **publishable** key. No service-role key is used anywhere.

## How the app uses it

- `src/lib/supabase.ts` — one client config, `db.schema = "hudhud_demo"`.
- `src/lib/server/supabasePlaces.ts` — place queries with exact `category` / `subcategory` /
  `neighborhood` filters. Distance (Haversine) and ranking are computed in app code.
- `src/lib/store.ts` — anonymous auth + reviews, visits, feedback, preferences, saved outings.
- If the database is configured but unreachable, the app shows an error; it never silently
  switches to other data. The local demo dataset is used only when Supabase is not configured.

## Validation queries

```sql
select count(*) from hudhud_demo.places;                                   -- 420
select category, subcategory, count(*) from hudhud_demo.places group by 1,2 order by 1,2;  -- 21 × 20
select neighborhood, count(*) from hudhud_demo.places group by 1;          -- 10 × 42
select count(*) from hudhud_demo.places
 where latitude not between 24.3 and 25.2 or longitude not between 46.3 and 47.2;  -- 0
select seed_key from hudhud_demo.places group by 1 having count(*) > 1;    -- no rows
select count(*) from hudhud_demo.places where rating < 1 or rating > 5;    -- 0
```
