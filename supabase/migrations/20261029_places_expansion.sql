-- Mishwarak: expand hudhud_demo.places from the 420-place synthetic seed with 202 new places.
--
-- Adds:
--   * location_status / location_source on every place, so the app never presents a
--     synthetic or approximate point as a verified destination. Existing rows → 'synthetic'.
--   * 140 synthetic demo places (laundries, mosques, football/padel fields, schools),
--     2 per subcategory in each of the 10 seeded districts, named "تجريبي - ...".
--   * 62 real landmarks (universities, Tuwaiq Academy, malls, Riyadh Metro stations, ministries).
--     'verified' coordinates come from the named OpenStreetMap feature (location_source holds the
--     OSM id); 'approximate' ones are marked as such.
--   * New rows carry no rating, review count, price level, hours, image or verified address (all NULL).
--
-- Idempotent: safe to re-run. Rows are keyed by seed_key and inserted only when missing; existing
-- rows, plans, visits, reviews, preferences and feedback are never updated or deleted.

alter table hudhud_demo.places
  add column if not exists location_status text,
  add column if not exists location_source text;

update hudhud_demo.places set location_status = 'synthetic' where location_status is null;
update hudhud_demo.places set location_source = 'synthetic' where location_source is null and location_status = 'synthetic';

alter table hudhud_demo.places alter column location_status set default 'synthetic';
alter table hudhud_demo.places alter column location_status set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'hudhud_demo.places'::regclass and conname = 'places_location_status_check') then
    alter table hudhud_demo.places add constraint places_location_status_check
      check (location_status in ('verified', 'approximate', 'synthetic'));
  end if;
end $$;

-- Category/subcategory checks, if the base schema has them, are widened to the new taxonomy.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'hudhud_demo.places'::regclass and contype = 'c'
      and conname not in ('places_location_status_check', 'places_category_check', 'places_subcategory_check')
      and pg_get_constraintdef(oid) ~ '\m(sub)?category\M'
  loop
    execute format('alter table hudhud_demo.places drop constraint %I', c.conname);
  end loop;
  alter table hudhud_demo.places drop constraint if exists places_category_check;
  alter table hudhud_demo.places drop constraint if exists places_subcategory_check;
  alter table hudhud_demo.places add constraint places_category_check check (category in ('cafe','restaurant','gym','dessert','park','mall','entertainment','laundry','mosque','sports','education','transport','government'));
  alter table hudhud_demo.places add constraint places_subcategory_check check (subcategory in ('italian','fast_food','burger','pizza','saudi','shawarma','indian','asian','seafood','grill','specialty_coffee','quiet','study','drive_thru','fitness','women','bakery','ice_cream','public_park','shopping','games','car_wash','clothes_laundry','mosque','football','padel','primary_school','secondary_school','university','academy','metro_station','ministry'));
end $$;

-- seed_key identifies seeded rows; make it unique if it isn't already.
do $$
begin
  if not exists (
    select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = 'hudhud_demo.places'::regclass and i.indisunique and i.indnatts = 1 and a.attname = 'seed_key'
  ) then
    create unique index places_seed_key_key on hudhud_demo.places (seed_key);
  end if;
end $$;

insert into hudhud_demo.places
  (seed_key, name_ar, category, subcategory, neighborhood, address_ar, latitude, longitude, tags, is_demo, source, location_status, location_source)
select v.seed_key, v.name_ar, v.category, v.subcategory, v.neighborhood, v.address_ar, v.latitude, v.longitude, v.tags, v.is_demo, v.source, v.location_status, v.location_source
from (values
  ('العليا|laundry|car_wash|1', 'تجريبي - مغسلة سيارات العليا 1', 'laundry', 'car_wash', 'العليا', 'موقع تجريبي في حي العليا - الرياض', 24.69617, 46.68606, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العليا|laundry|car_wash|2', 'تجريبي - مغسلة سيارات العليا 2', 'laundry', 'car_wash', 'العليا', 'موقع تجريبي في حي العليا - الرياض', 24.69091, 46.6734, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('السليمانية|laundry|car_wash|1', 'تجريبي - مغسلة سيارات السليمانية 1', 'laundry', 'car_wash', 'السليمانية', 'موقع تجريبي في حي السليمانية - الرياض', 24.6988, 46.70934, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('السليمانية|laundry|car_wash|2', 'تجريبي - مغسلة سيارات السليمانية 2', 'laundry', 'car_wash', 'السليمانية', 'موقع تجريبي في حي السليمانية - الرياض', 24.70924, 46.70098, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الملقا|laundry|car_wash|1', 'تجريبي - مغسلة سيارات الملقا 1', 'laundry', 'car_wash', 'الملقا', 'موقع تجريبي في حي الملقا - الرياض', 24.80725, 46.60617, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الملقا|laundry|car_wash|2', 'تجريبي - مغسلة سيارات الملقا 2', 'laundry', 'car_wash', 'الملقا', 'موقع تجريبي في حي الملقا - الرياض', 24.80541, 46.60139, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الصحافة|laundry|car_wash|1', 'تجريبي - مغسلة سيارات الصحافة 1', 'laundry', 'car_wash', 'الصحافة', 'موقع تجريبي في حي الصحافة - الرياض', 24.81531, 46.6454, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الصحافة|laundry|car_wash|2', 'تجريبي - مغسلة سيارات الصحافة 2', 'laundry', 'car_wash', 'الصحافة', 'موقع تجريبي في حي الصحافة - الرياض', 24.8124, 46.64384, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('حطين|laundry|car_wash|1', 'تجريبي - مغسلة سيارات حطين 1', 'laundry', 'car_wash', 'حطين', 'موقع تجريبي في حي حطين - الرياض', 24.76901, 46.59933, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('حطين|laundry|car_wash|2', 'تجريبي - مغسلة سيارات حطين 2', 'laundry', 'car_wash', 'حطين', 'موقع تجريبي في حي حطين - الرياض', 24.78164, 46.61797, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الياسمين|laundry|car_wash|1', 'تجريبي - مغسلة سيارات الياسمين 1', 'laundry', 'car_wash', 'الياسمين', 'موقع تجريبي في حي الياسمين - الرياض', 24.8365, 46.64252, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الياسمين|laundry|car_wash|2', 'تجريبي - مغسلة سيارات الياسمين 2', 'laundry', 'car_wash', 'الياسمين', 'موقع تجريبي في حي الياسمين - الرياض', 24.83331, 46.639, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('النرجس|laundry|car_wash|1', 'تجريبي - مغسلة سيارات النرجس 1', 'laundry', 'car_wash', 'النرجس', 'موقع تجريبي في حي النرجس - الرياض', 24.85179, 46.67284, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('النرجس|laundry|car_wash|2', 'تجريبي - مغسلة سيارات النرجس 2', 'laundry', 'car_wash', 'النرجس', 'موقع تجريبي في حي النرجس - الرياض', 24.85554, 46.68241, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الربيع|laundry|car_wash|1', 'تجريبي - مغسلة سيارات الربيع 1', 'laundry', 'car_wash', 'الربيع', 'موقع تجريبي في حي الربيع - الرياض', 24.8024, 46.66875, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الربيع|laundry|car_wash|2', 'تجريبي - مغسلة سيارات الربيع 2', 'laundry', 'car_wash', 'الربيع', 'موقع تجريبي في حي الربيع - الرياض', 24.8071, 46.66434, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('قرطبة|laundry|car_wash|1', 'تجريبي - مغسلة سيارات قرطبة 1', 'laundry', 'car_wash', 'قرطبة', 'موقع تجريبي في حي قرطبة - الرياض', 24.82376, 46.74947, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('قرطبة|laundry|car_wash|2', 'تجريبي - مغسلة سيارات قرطبة 2', 'laundry', 'car_wash', 'قرطبة', 'موقع تجريبي في حي قرطبة - الرياض', 24.80649, 46.74874, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العارض|laundry|car_wash|1', 'تجريبي - مغسلة سيارات العارض 1', 'laundry', 'car_wash', 'العارض', 'موقع تجريبي في حي العارض - الرياض', 24.88335, 46.64371, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العارض|laundry|car_wash|2', 'تجريبي - مغسلة سيارات العارض 2', 'laundry', 'car_wash', 'العارض', 'موقع تجريبي في حي العارض - الرياض', 24.89296, 46.63032, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العليا|laundry|clothes_laundry|1', 'تجريبي - مغسلة ملابس العليا 1', 'laundry', 'clothes_laundry', 'العليا', 'موقع تجريبي في حي العليا - الرياض', 24.68875, 46.67461, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العليا|laundry|clothes_laundry|2', 'تجريبي - مغسلة ملابس العليا 2', 'laundry', 'clothes_laundry', 'العليا', 'موقع تجريبي في حي العليا - الرياض', 24.68406, 46.69522, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('السليمانية|laundry|clothes_laundry|1', 'تجريبي - مغسلة ملابس السليمانية 1', 'laundry', 'clothes_laundry', 'السليمانية', 'موقع تجريبي في حي السليمانية - الرياض', 24.70341, 46.70719, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('السليمانية|laundry|clothes_laundry|2', 'تجريبي - مغسلة ملابس السليمانية 2', 'laundry', 'clothes_laundry', 'السليمانية', 'موقع تجريبي في حي السليمانية - الرياض', 24.69715, 46.70531, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الملقا|laundry|clothes_laundry|1', 'تجريبي - مغسلة ملابس الملقا 1', 'laundry', 'clothes_laundry', 'الملقا', 'موقع تجريبي في حي الملقا - الرياض', 24.80762, 46.59736, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الملقا|laundry|clothes_laundry|2', 'تجريبي - مغسلة ملابس الملقا 2', 'laundry', 'clothes_laundry', 'الملقا', 'موقع تجريبي في حي الملقا - الرياض', 24.80512, 46.60067, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الصحافة|laundry|clothes_laundry|1', 'تجريبي - مغسلة ملابس الصحافة 1', 'laundry', 'clothes_laundry', 'الصحافة', 'موقع تجريبي في حي الصحافة - الرياض', 24.7953, 46.64336, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الصحافة|laundry|clothes_laundry|2', 'تجريبي - مغسلة ملابس الصحافة 2', 'laundry', 'clothes_laundry', 'الصحافة', 'موقع تجريبي في حي الصحافة - الرياض', 24.80037, 46.64057, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('حطين|laundry|clothes_laundry|1', 'تجريبي - مغسلة ملابس حطين 1', 'laundry', 'clothes_laundry', 'حطين', 'موقع تجريبي في حي حطين - الرياض', 24.77319, 46.60233, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('حطين|laundry|clothes_laundry|2', 'تجريبي - مغسلة ملابس حطين 2', 'laundry', 'clothes_laundry', 'حطين', 'موقع تجريبي في حي حطين - الرياض', 24.77465, 46.61384, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الياسمين|laundry|clothes_laundry|1', 'تجريبي - مغسلة ملابس الياسمين 1', 'laundry', 'clothes_laundry', 'الياسمين', 'موقع تجريبي في حي الياسمين - الرياض', 24.83206, 46.63882, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الياسمين|laundry|clothes_laundry|2', 'تجريبي - مغسلة ملابس الياسمين 2', 'laundry', 'clothes_laundry', 'الياسمين', 'موقع تجريبي في حي الياسمين - الرياض', 24.83506, 46.63543, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('النرجس|laundry|clothes_laundry|1', 'تجريبي - مغسلة ملابس النرجس 1', 'laundry', 'clothes_laundry', 'النرجس', 'موقع تجريبي في حي النرجس - الرياض', 24.8501, 46.68716, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('النرجس|laundry|clothes_laundry|2', 'تجريبي - مغسلة ملابس النرجس 2', 'laundry', 'clothes_laundry', 'النرجس', 'موقع تجريبي في حي النرجس - الرياض', 24.85966, 46.6823, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الربيع|laundry|clothes_laundry|1', 'تجريبي - مغسلة ملابس الربيع 1', 'laundry', 'clothes_laundry', 'الربيع', 'موقع تجريبي في حي الربيع - الرياض', 24.80006, 46.65872, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الربيع|laundry|clothes_laundry|2', 'تجريبي - مغسلة ملابس الربيع 2', 'laundry', 'clothes_laundry', 'الربيع', 'موقع تجريبي في حي الربيع - الرياض', 24.79698, 46.65653, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('قرطبة|laundry|clothes_laundry|1', 'تجريبي - مغسلة ملابس قرطبة 1', 'laundry', 'clothes_laundry', 'قرطبة', 'موقع تجريبي في حي قرطبة - الرياض', 24.82045, 46.74573, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('قرطبة|laundry|clothes_laundry|2', 'تجريبي - مغسلة ملابس قرطبة 2', 'laundry', 'clothes_laundry', 'قرطبة', 'موقع تجريبي في حي قرطبة - الرياض', 24.81243, 46.75352, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العارض|laundry|clothes_laundry|1', 'تجريبي - مغسلة ملابس العارض 1', 'laundry', 'clothes_laundry', 'العارض', 'موقع تجريبي في حي العارض - الرياض', 24.88373, 46.6391, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العارض|laundry|clothes_laundry|2', 'تجريبي - مغسلة ملابس العارض 2', 'laundry', 'clothes_laundry', 'العارض', 'موقع تجريبي في حي العارض - الرياض', 24.88561, 46.62793, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العليا|mosque|mosque|1', 'تجريبي - مسجد العليا 1', 'mosque', 'mosque', 'العليا', 'موقع تجريبي في حي العليا - الرياض', 24.67737, 46.68681, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العليا|mosque|mosque|2', 'تجريبي - مسجد العليا 2', 'mosque', 'mosque', 'العليا', 'موقع تجريبي في حي العليا - الرياض', 24.69325, 46.68204, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('السليمانية|mosque|mosque|1', 'تجريبي - مسجد السليمانية 1', 'mosque', 'mosque', 'السليمانية', 'موقع تجريبي في حي السليمانية - الرياض', 24.70615, 46.72139, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('السليمانية|mosque|mosque|2', 'تجريبي - مسجد السليمانية 2', 'mosque', 'mosque', 'السليمانية', 'موقع تجريبي في حي السليمانية - الرياض', 24.70947, 46.70737, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الملقا|mosque|mosque|1', 'تجريبي - مسجد الملقا 1', 'mosque', 'mosque', 'الملقا', 'موقع تجريبي في حي الملقا - الرياض', 24.8064, 46.61533, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الملقا|mosque|mosque|2', 'تجريبي - مسجد الملقا 2', 'mosque', 'mosque', 'الملقا', 'موقع تجريبي في حي الملقا - الرياض', 24.79454, 46.59894, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الصحافة|mosque|mosque|1', 'تجريبي - مسجد الصحافة 1', 'mosque', 'mosque', 'الصحافة', 'موقع تجريبي في حي الصحافة - الرياض', 24.80481, 46.64955, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الصحافة|mosque|mosque|2', 'تجريبي - مسجد الصحافة 2', 'mosque', 'mosque', 'الصحافة', 'موقع تجريبي في حي الصحافة - الرياض', 24.80028, 46.64784, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('حطين|mosque|mosque|1', 'تجريبي - مسجد حطين 1', 'mosque', 'mosque', 'حطين', 'موقع تجريبي في حي حطين - الرياض', 24.77948, 46.61676, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('حطين|mosque|mosque|2', 'تجريبي - مسجد حطين 2', 'mosque', 'mosque', 'حطين', 'موقع تجريبي في حي حطين - الرياض', 24.77324, 46.60265, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الياسمين|mosque|mosque|1', 'تجريبي - مسجد الياسمين 1', 'mosque', 'mosque', 'الياسمين', 'موقع تجريبي في حي الياسمين - الرياض', 24.82249, 46.6414, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الياسمين|mosque|mosque|2', 'تجريبي - مسجد الياسمين 2', 'mosque', 'mosque', 'الياسمين', 'موقع تجريبي في حي الياسمين - الرياض', 24.8417, 46.6419, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('النرجس|mosque|mosque|1', 'تجريبي - مسجد النرجس 1', 'mosque', 'mosque', 'النرجس', 'موقع تجريبي في حي النرجس - الرياض', 24.85761, 46.67731, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('النرجس|mosque|mosque|2', 'تجريبي - مسجد النرجس 2', 'mosque', 'mosque', 'النرجس', 'موقع تجريبي في حي النرجس - الرياض', 24.85995, 46.6862, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الربيع|mosque|mosque|1', 'تجريبي - مسجد الربيع 1', 'mosque', 'mosque', 'الربيع', 'موقع تجريبي في حي الربيع - الرياض', 24.79016, 46.66405, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الربيع|mosque|mosque|2', 'تجريبي - مسجد الربيع 2', 'mosque', 'mosque', 'الربيع', 'موقع تجريبي في حي الربيع - الرياض', 24.79167, 46.67394, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('قرطبة|mosque|mosque|1', 'تجريبي - مسجد قرطبة 1', 'mosque', 'mosque', 'قرطبة', 'موقع تجريبي في حي قرطبة - الرياض', 24.80781, 46.73629, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('قرطبة|mosque|mosque|2', 'تجريبي - مسجد قرطبة 2', 'mosque', 'mosque', 'قرطبة', 'موقع تجريبي في حي قرطبة - الرياض', 24.81706, 46.75021, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العارض|mosque|mosque|1', 'تجريبي - مسجد العارض 1', 'mosque', 'mosque', 'العارض', 'موقع تجريبي في حي العارض - الرياض', 24.88643, 46.64078, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العارض|mosque|mosque|2', 'تجريبي - مسجد العارض 2', 'mosque', 'mosque', 'العارض', 'موقع تجريبي في حي العارض - الرياض', 24.88062, 46.64257, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العليا|sports|football|1', 'تجريبي - ملعب كرة قدم العليا 1', 'sports', 'football', 'العليا', 'موقع تجريبي في حي العليا - الرياض', 24.68387, 46.68981, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العليا|sports|football|2', 'تجريبي - ملعب كرة قدم العليا 2', 'sports', 'football', 'العليا', 'موقع تجريبي في حي العليا - الرياض', 24.68074, 46.67674, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('السليمانية|sports|football|1', 'تجريبي - ملعب كرة قدم السليمانية 1', 'sports', 'football', 'السليمانية', 'موقع تجريبي في حي السليمانية - الرياض', 24.7073, 46.71836, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('السليمانية|sports|football|2', 'تجريبي - ملعب كرة قدم السليمانية 2', 'sports', 'football', 'السليمانية', 'موقع تجريبي في حي السليمانية - الرياض', 24.70525, 46.70771, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الملقا|sports|football|1', 'تجريبي - ملعب كرة قدم الملقا 1', 'sports', 'football', 'الملقا', 'موقع تجريبي في حي الملقا - الرياض', 24.79314, 46.60123, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الملقا|sports|football|2', 'تجريبي - ملعب كرة قدم الملقا 2', 'sports', 'football', 'الملقا', 'موقع تجريبي في حي الملقا - الرياض', 24.80537, 46.59783, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الصحافة|sports|football|1', 'تجريبي - ملعب كرة قدم الصحافة 1', 'sports', 'football', 'الصحافة', 'موقع تجريبي في حي الصحافة - الرياض', 24.81003, 46.65045, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الصحافة|sports|football|2', 'تجريبي - ملعب كرة قدم الصحافة 2', 'sports', 'football', 'الصحافة', 'موقع تجريبي في حي الصحافة - الرياض', 24.81189, 46.63757, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('حطين|sports|football|1', 'تجريبي - ملعب كرة قدم حطين 1', 'sports', 'football', 'حطين', 'موقع تجريبي في حي حطين - الرياض', 24.78291, 46.61122, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('حطين|sports|football|2', 'تجريبي - ملعب كرة قدم حطين 2', 'sports', 'football', 'حطين', 'موقع تجريبي في حي حطين - الرياض', 24.77153, 46.60554, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الياسمين|sports|football|1', 'تجريبي - ملعب كرة قدم الياسمين 1', 'sports', 'football', 'الياسمين', 'موقع تجريبي في حي الياسمين - الرياض', 24.82789, 46.64823, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الياسمين|sports|football|2', 'تجريبي - ملعب كرة قدم الياسمين 2', 'sports', 'football', 'الياسمين', 'موقع تجريبي في حي الياسمين - الرياض', 24.83833, 46.64256, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('النرجس|sports|football|1', 'تجريبي - ملعب كرة قدم النرجس 1', 'sports', 'football', 'النرجس', 'موقع تجريبي في حي النرجس - الرياض', 24.8586, 46.6836, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('النرجس|sports|football|2', 'تجريبي - ملعب كرة قدم النرجس 2', 'sports', 'football', 'النرجس', 'موقع تجريبي في حي النرجس - الرياض', 24.84479, 46.67593, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الربيع|sports|football|1', 'تجريبي - ملعب كرة قدم الربيع 1', 'sports', 'football', 'الربيع', 'موقع تجريبي في حي الربيع - الرياض', 24.78789, 46.67283, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الربيع|sports|football|2', 'تجريبي - ملعب كرة قدم الربيع 2', 'sports', 'football', 'الربيع', 'موقع تجريبي في حي الربيع - الرياض', 24.80433, 46.67122, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('قرطبة|sports|football|1', 'تجريبي - ملعب كرة قدم قرطبة 1', 'sports', 'football', 'قرطبة', 'موقع تجريبي في حي قرطبة - الرياض', 24.82178, 46.74454, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('قرطبة|sports|football|2', 'تجريبي - ملعب كرة قدم قرطبة 2', 'sports', 'football', 'قرطبة', 'موقع تجريبي في حي قرطبة - الرياض', 24.80998, 46.74, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العارض|sports|football|1', 'تجريبي - ملعب كرة قدم العارض 1', 'sports', 'football', 'العارض', 'موقع تجريبي في حي العارض - الرياض', 24.89117, 46.62704, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العارض|sports|football|2', 'تجريبي - ملعب كرة قدم العارض 2', 'sports', 'football', 'العارض', 'موقع تجريبي في حي العارض - الرياض', 24.89331, 46.63532, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العليا|sports|padel|1', 'تجريبي - ملعب بادل العليا 1', 'sports', 'padel', 'العليا', 'موقع تجريبي في حي العليا - الرياض', 24.6879, 46.68925, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العليا|sports|padel|2', 'تجريبي - ملعب بادل العليا 2', 'sports', 'padel', 'العليا', 'موقع تجريبي في حي العليا - الرياض', 24.68445, 46.67341, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('السليمانية|sports|padel|1', 'تجريبي - ملعب بادل السليمانية 1', 'sports', 'padel', 'السليمانية', 'موقع تجريبي في حي السليمانية - الرياض', 24.69936, 46.71463, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('السليمانية|sports|padel|2', 'تجريبي - ملعب بادل السليمانية 2', 'sports', 'padel', 'السليمانية', 'موقع تجريبي في حي السليمانية - الرياض', 24.70548, 46.71581, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الملقا|sports|padel|1', 'تجريبي - ملعب بادل الملقا 1', 'sports', 'padel', 'الملقا', 'موقع تجريبي في حي الملقا - الرياض', 24.79385, 46.60423, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الملقا|sports|padel|2', 'تجريبي - ملعب بادل الملقا 2', 'sports', 'padel', 'الملقا', 'موقع تجريبي في حي الملقا - الرياض', 24.8089, 46.59971, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الصحافة|sports|padel|1', 'تجريبي - ملعب بادل الصحافة 1', 'sports', 'padel', 'الصحافة', 'موقع تجريبي في حي الصحافة - الرياض', 24.80862, 46.64507, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الصحافة|sports|padel|2', 'تجريبي - ملعب بادل الصحافة 2', 'sports', 'padel', 'الصحافة', 'موقع تجريبي في حي الصحافة - الرياض', 24.80973, 46.65409, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('حطين|sports|padel|1', 'تجريبي - ملعب بادل حطين 1', 'sports', 'padel', 'حطين', 'موقع تجريبي في حي حطين - الرياض', 24.77221, 46.61326, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('حطين|sports|padel|2', 'تجريبي - ملعب بادل حطين 2', 'sports', 'padel', 'حطين', 'موقع تجريبي في حي حطين - الرياض', 24.76667, 46.61617, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الياسمين|sports|padel|1', 'تجريبي - ملعب بادل الياسمين 1', 'sports', 'padel', 'الياسمين', 'موقع تجريبي في حي الياسمين - الرياض', 24.83477, 46.65461, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الياسمين|sports|padel|2', 'تجريبي - ملعب بادل الياسمين 2', 'sports', 'padel', 'الياسمين', 'موقع تجريبي في حي الياسمين - الرياض', 24.83827, 46.64477, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('النرجس|sports|padel|1', 'تجريبي - ملعب بادل النرجس 1', 'sports', 'padel', 'النرجس', 'موقع تجريبي في حي النرجس - الرياض', 24.846, 46.67139, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('النرجس|sports|padel|2', 'تجريبي - ملعب بادل النرجس 2', 'sports', 'padel', 'النرجس', 'موقع تجريبي في حي النرجس - الرياض', 24.85421, 46.68229, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الربيع|sports|padel|1', 'تجريبي - ملعب بادل الربيع 1', 'sports', 'padel', 'الربيع', 'موقع تجريبي في حي الربيع - الرياض', 24.79976, 46.67797, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الربيع|sports|padel|2', 'تجريبي - ملعب بادل الربيع 2', 'sports', 'padel', 'الربيع', 'موقع تجريبي في حي الربيع - الرياض', 24.7933, 46.66128, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('قرطبة|sports|padel|1', 'تجريبي - ملعب بادل قرطبة 1', 'sports', 'padel', 'قرطبة', 'موقع تجريبي في حي قرطبة - الرياض', 24.81125, 46.73117, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('قرطبة|sports|padel|2', 'تجريبي - ملعب بادل قرطبة 2', 'sports', 'padel', 'قرطبة', 'موقع تجريبي في حي قرطبة - الرياض', 24.81054, 46.74998, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العارض|sports|padel|1', 'تجريبي - ملعب بادل العارض 1', 'sports', 'padel', 'العارض', 'موقع تجريبي في حي العارض - الرياض', 24.88269, 46.64595, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العارض|sports|padel|2', 'تجريبي - ملعب بادل العارض 2', 'sports', 'padel', 'العارض', 'موقع تجريبي في حي العارض - الرياض', 24.88557, 46.64023, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العليا|education|primary_school|1', 'تجريبي - مدرسة ابتدائية العليا 1', 'education', 'primary_school', 'العليا', 'موقع تجريبي في حي العليا - الرياض', 24.6928, 46.68435, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العليا|education|primary_school|2', 'تجريبي - مدرسة ابتدائية العليا 2', 'education', 'primary_school', 'العليا', 'موقع تجريبي في حي العليا - الرياض', 24.69195, 46.68987, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('السليمانية|education|primary_school|1', 'تجريبي - مدرسة ابتدائية السليمانية 1', 'education', 'primary_school', 'السليمانية', 'موقع تجريبي في حي السليمانية - الرياض', 24.69677, 46.70666, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('السليمانية|education|primary_school|2', 'تجريبي - مدرسة ابتدائية السليمانية 2', 'education', 'primary_school', 'السليمانية', 'موقع تجريبي في حي السليمانية - الرياض', 24.70909, 46.71236, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الملقا|education|primary_school|1', 'تجريبي - مدرسة ابتدائية الملقا 1', 'education', 'primary_school', 'الملقا', 'موقع تجريبي في حي الملقا - الرياض', 24.80643, 46.59706, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الملقا|education|primary_school|2', 'تجريبي - مدرسة ابتدائية الملقا 2', 'education', 'primary_school', 'الملقا', 'موقع تجريبي في حي الملقا - الرياض', 24.79672, 46.61289, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الصحافة|education|primary_school|1', 'تجريبي - مدرسة ابتدائية الصحافة 1', 'education', 'primary_school', 'الصحافة', 'موقع تجريبي في حي الصحافة - الرياض', 24.79522, 46.64573, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الصحافة|education|primary_school|2', 'تجريبي - مدرسة ابتدائية الصحافة 2', 'education', 'primary_school', 'الصحافة', 'موقع تجريبي في حي الصحافة - الرياض', 24.80471, 46.63654, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('حطين|education|primary_school|1', 'تجريبي - مدرسة ابتدائية حطين 1', 'education', 'primary_school', 'حطين', 'موقع تجريبي في حي حطين - الرياض', 24.7817, 46.61383, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('حطين|education|primary_school|2', 'تجريبي - مدرسة ابتدائية حطين 2', 'education', 'primary_school', 'حطين', 'موقع تجريبي في حي حطين - الرياض', 24.7723, 46.60534, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الياسمين|education|primary_school|1', 'تجريبي - مدرسة ابتدائية الياسمين 1', 'education', 'primary_school', 'الياسمين', 'موقع تجريبي في حي الياسمين - الرياض', 24.83433, 46.64127, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الياسمين|education|primary_school|2', 'تجريبي - مدرسة ابتدائية الياسمين 2', 'education', 'primary_school', 'الياسمين', 'موقع تجريبي في حي الياسمين - الرياض', 24.82279, 46.65178, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('النرجس|education|primary_school|1', 'تجريبي - مدرسة ابتدائية النرجس 1', 'education', 'primary_school', 'النرجس', 'موقع تجريبي في حي النرجس - الرياض', 24.85721, 46.6725, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('النرجس|education|primary_school|2', 'تجريبي - مدرسة ابتدائية النرجس 2', 'education', 'primary_school', 'النرجس', 'موقع تجريبي في حي النرجس - الرياض', 24.85778, 46.6761, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الربيع|education|primary_school|1', 'تجريبي - مدرسة ابتدائية الربيع 1', 'education', 'primary_school', 'الربيع', 'موقع تجريبي في حي الربيع - الرياض', 24.79232, 46.65701, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الربيع|education|primary_school|2', 'تجريبي - مدرسة ابتدائية الربيع 2', 'education', 'primary_school', 'الربيع', 'موقع تجريبي في حي الربيع - الرياض', 24.79154, 46.65658, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('قرطبة|education|primary_school|1', 'تجريبي - مدرسة ابتدائية قرطبة 1', 'education', 'primary_school', 'قرطبة', 'موقع تجريبي في حي قرطبة - الرياض', 24.81331, 46.73785, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('قرطبة|education|primary_school|2', 'تجريبي - مدرسة ابتدائية قرطبة 2', 'education', 'primary_school', 'قرطبة', 'موقع تجريبي في حي قرطبة - الرياض', 24.82371, 46.74081, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العارض|education|primary_school|1', 'تجريبي - مدرسة ابتدائية العارض 1', 'education', 'primary_school', 'العارض', 'موقع تجريبي في حي العارض - الرياض', 24.8979, 46.64231, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العارض|education|primary_school|2', 'تجريبي - مدرسة ابتدائية العارض 2', 'education', 'primary_school', 'العارض', 'موقع تجريبي في حي العارض - الرياض', 24.88577, 46.63445, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العليا|education|secondary_school|1', 'تجريبي - مدرسة ثانوية العليا 1', 'education', 'secondary_school', 'العليا', 'موقع تجريبي في حي العليا - الرياض', 24.68732, 46.68068, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العليا|education|secondary_school|2', 'تجريبي - مدرسة ثانوية العليا 2', 'education', 'secondary_school', 'العليا', 'موقع تجريبي في حي العليا - الرياض', 24.67673, 46.68772, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('السليمانية|education|secondary_school|1', 'تجريبي - مدرسة ثانوية السليمانية 1', 'education', 'secondary_school', 'السليمانية', 'موقع تجريبي في حي السليمانية - الرياض', 24.71041, 46.70563, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('السليمانية|education|secondary_school|2', 'تجريبي - مدرسة ثانوية السليمانية 2', 'education', 'secondary_school', 'السليمانية', 'موقع تجريبي في حي السليمانية - الرياض', 24.70913, 46.70641, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الملقا|education|secondary_school|1', 'تجريبي - مدرسة ثانوية الملقا 1', 'education', 'secondary_school', 'الملقا', 'موقع تجريبي في حي الملقا - الرياض', 24.80316, 46.59485, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الملقا|education|secondary_school|2', 'تجريبي - مدرسة ثانوية الملقا 2', 'education', 'secondary_school', 'الملقا', 'موقع تجريبي في حي الملقا - الرياض', 24.8128, 46.60796, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الصحافة|education|secondary_school|1', 'تجريبي - مدرسة ثانوية الصحافة 1', 'education', 'secondary_school', 'الصحافة', 'موقع تجريبي في حي الصحافة - الرياض', 24.80543, 46.63386, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الصحافة|education|secondary_school|2', 'تجريبي - مدرسة ثانوية الصحافة 2', 'education', 'secondary_school', 'الصحافة', 'موقع تجريبي في حي الصحافة - الرياض', 24.81047, 46.63732, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('حطين|education|secondary_school|1', 'تجريبي - مدرسة ثانوية حطين 1', 'education', 'secondary_school', 'حطين', 'موقع تجريبي في حي حطين - الرياض', 24.77177, 46.59806, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('حطين|education|secondary_school|2', 'تجريبي - مدرسة ثانوية حطين 2', 'education', 'secondary_school', 'حطين', 'موقع تجريبي في حي حطين - الرياض', 24.78367, 46.60414, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الياسمين|education|secondary_school|1', 'تجريبي - مدرسة ثانوية الياسمين 1', 'education', 'secondary_school', 'الياسمين', 'موقع تجريبي في حي الياسمين - الرياض', 24.82295, 46.64646, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الياسمين|education|secondary_school|2', 'تجريبي - مدرسة ثانوية الياسمين 2', 'education', 'secondary_school', 'الياسمين', 'موقع تجريبي في حي الياسمين - الرياض', 24.82786, 46.64925, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('النرجس|education|secondary_school|1', 'تجريبي - مدرسة ثانوية النرجس 1', 'education', 'secondary_school', 'النرجس', 'موقع تجريبي في حي النرجس - الرياض', 24.84857, 46.68873, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('النرجس|education|secondary_school|2', 'تجريبي - مدرسة ثانوية النرجس 2', 'education', 'secondary_school', 'النرجس', 'موقع تجريبي في حي النرجس - الرياض', 24.85683, 46.6864, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الربيع|education|secondary_school|1', 'تجريبي - مدرسة ثانوية الربيع 1', 'education', 'secondary_school', 'الربيع', 'موقع تجريبي في حي الربيع - الرياض', 24.78559, 46.67095, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('الربيع|education|secondary_school|2', 'تجريبي - مدرسة ثانوية الربيع 2', 'education', 'secondary_school', 'الربيع', 'موقع تجريبي في حي الربيع - الرياض', 24.7999, 46.67452, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('قرطبة|education|secondary_school|1', 'تجريبي - مدرسة ثانوية قرطبة 1', 'education', 'secondary_school', 'قرطبة', 'موقع تجريبي في حي قرطبة - الرياض', 24.80987, 46.74004, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('قرطبة|education|secondary_school|2', 'تجريبي - مدرسة ثانوية قرطبة 2', 'education', 'secondary_school', 'قرطبة', 'موقع تجريبي في حي قرطبة - الرياض', 24.81844, 46.73716, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العارض|education|secondary_school|1', 'تجريبي - مدرسة ثانوية العارض 1', 'education', 'secondary_school', 'العارض', 'موقع تجريبي في حي العارض - الرياض', 24.89394, 46.63526, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('العارض|education|secondary_school|2', 'تجريبي - مدرسة ثانوية العارض 2', 'education', 'secondary_school', 'العارض', 'موقع تجريبي في حي العارض - الرياض', 24.88416, 46.64, array['تجريبي']::text[], true, 'synthetic', 'synthetic', 'synthetic'),
  ('landmark|education|university|جامعة الملك سعود', 'جامعة الملك سعود', 'education', 'university', 'النخيل', null, 24.72441, 46.62339, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:relation/13296000'),
  ('landmark|education|university|جامعة الإمام محمد بن سعود الإسلامية', 'جامعة الإمام محمد بن سعود الإسلامية', 'education', 'university', 'جامعة الإمام محمد بن سعود الإسلامية', null, 24.81259, 46.70234, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:relation/13254379'),
  ('landmark|education|university|جامعة الأميرة نورة بنت عبدالرحمن', 'جامعة الأميرة نورة بنت عبدالرحمن', 'education', 'university', 'جامعة الأميرة نورة', null, 24.85174, 46.71834, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/161612193'),
  ('landmark|education|university|جامعة الأمير سلطان', 'جامعة الأمير سلطان', 'education', 'university', 'صلاح الدين', null, 24.73609, 46.70111, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/328277032'),
  ('landmark|education|university|جامعة الفيصل', 'جامعة الفيصل', 'education', 'university', 'الناصرية', null, 24.6644, 46.67642, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/636683185'),
  ('landmark|education|university|جامعة اليمامة', 'جامعة اليمامة', 'education', 'university', 'القيروان', null, 24.86279, 46.59207, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/221634202'),
  ('landmark|education|university|جامعة دار العلوم', 'جامعة دار العلوم', 'education', 'university', 'الفلاح', null, 24.13131, 38.00649, '{}'::text[], false, 'approximate', 'approximate', 'district:الفلاح'),
  ('landmark|education|university|الجامعة العربية المفتوحة', 'الجامعة العربية المفتوحة', 'education', 'university', 'حطين', null, 24.76844, 46.59043, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/636658971'),
  ('landmark|education|university|جامعة الملك سعود بن عبدالعزيز للعلوم الصحية', 'جامعة الملك سعود بن عبدالعزيز للعلوم الصحية', 'education', 'university', 'الرماية', null, 24.75708, 46.85719, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/3381174559'),
  ('landmark|education|academy|أكاديمية طويق', 'أكاديمية طويق', 'education', 'academy', 'جامعة الأميرة نورة', null, 24.8465, 46.7245, '{}'::text[], false, 'approximate', 'approximate', 'campus:جامعة الأميرة نورة بنت عبدالرحمن'),
  ('landmark|mall|shopping|الرياض بارك', 'الرياض بارك', 'mall', 'shopping', 'النخيل', null, 24.7567, 46.62986, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/636659011'),
  ('landmark|mall|shopping|غرناطة مول', 'غرناطة مول', 'mall', 'shopping', 'غرناطة', null, 24.78181, 46.73123, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/161100723'),
  ('landmark|mall|shopping|النخيل مول', 'النخيل مول', 'mall', 'shopping', 'مغرزات', null, 24.76679, 46.71582, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/381458692'),
  ('landmark|mall|shopping|الرياض جاليري', 'الرياض جاليري', 'mall', 'shopping', 'الملك فهد', null, 24.74319, 46.65834, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/53223367'),
  ('landmark|mall|shopping|بانوراما مول', 'بانوراما مول', 'mall', 'shopping', 'أم الحمام', null, 24.69238, 46.66937, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/53194043'),
  ('landmark|mall|shopping|حياة مول', 'حياة مول', 'mall', 'shopping', 'الملك فهد', null, 24.74312, 46.67943, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/328277019'),
  ('landmark|mall|shopping|صحارى مول', 'صحارى مول', 'mall', 'shopping', 'الملك فهد', null, 24.73875, 46.68273, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/220845002'),
  ('landmark|mall|shopping|القصر مول', 'القصر مول', 'mall', 'shopping', 'السويدي', null, 24.60026, 46.69769, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/170170512'),
  ('landmark|transport|metro_station|محطة مترو مركز الملك عبدالله المالي', 'محطة مترو مركز الملك عبدالله المالي', 'transport', 'metro_station', 'العقيق', null, 24.76762, 46.64306, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12389972535'),
  ('landmark|transport|metro_station|محطة مترو شركة الاتصالات السعودية', 'محطة مترو شركة الاتصالات السعودية', 'transport', 'metro_station', 'الورود', null, 24.7272, 46.66826, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12393282811'),
  ('landmark|transport|metro_station|محطة مترو قصر الحكم', 'محطة مترو قصر الحكم', 'transport', 'metro_station', 'جبرة', null, 24.62878, 46.71618, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12395509810'),
  ('landmark|transport|metro_station|محطة مترو المتحف الوطني', 'محطة مترو المتحف الوطني', 'transport', 'metro_station', 'المرقب', null, 24.64536, 46.71312, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12389972676'),
  ('landmark|transport|metro_station|محطة مترو البطحاء', 'محطة مترو البطحاء', 'transport', 'metro_station', 'أم سليم', null, 24.6383, 46.71485, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12389972675'),
  ('landmark|transport|metro_station|محطة مترو وزارة التعليم', 'محطة مترو وزارة التعليم', 'transport', 'metro_station', 'صلاح الدين', null, 24.74058, 46.69571, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12353818506'),
  ('landmark|transport|metro_station|محطة مترو مكتبة الملك فهد', 'محطة مترو مكتبة الملك فهد', 'transport', 'metro_station', 'السلامة', null, 24.6902, 46.68697, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12393282813'),
  ('landmark|transport|metro_station|محطة مترو التخصصي', 'محطة مترو التخصصي', 'transport', 'metro_station', 'المحمدية', null, 24.72372, 46.65437, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12396325414'),
  ('landmark|transport|metro_station|محطة مترو جامعة الملك سعود', 'محطة مترو جامعة الملك سعود', 'transport', 'metro_station', 'أم الحمام', null, 24.71023, 46.62834, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12398529070'),
  ('landmark|transport|metro_station|محطة مترو جامعة الأميرة نورة 1', 'محطة مترو جامعة الأميرة نورة 1', 'transport', 'metro_station', 'جامعة الأميرة نورة', null, 24.84161, 46.7174, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12339129098'),
  ('landmark|transport|metro_station|محطة مترو المطار الصالة 5', 'محطة مترو المطار الصالة 5', 'transport', 'metro_station', 'مطار الملك خالد الدولي', null, 24.94051, 46.71047, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12339155043'),
  ('landmark|transport|metro_station|محطة مترو المطار الصالات 1-2', 'محطة مترو المطار الصالات 1-2', 'transport', 'metro_station', 'مطار الملك خالد الدولي', null, 24.96106, 46.69899, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12339155045'),
  ('landmark|transport|metro_station|محطة مترو المروج', 'محطة مترو المروج', 'transport', 'metro_station', 'المروج', null, 24.75426, 46.6545, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12338812518'),
  ('landmark|transport|metro_station|محطة مترو الربيع', 'محطة مترو الربيع', 'transport', 'metro_station', 'الربيع', null, 24.78634, 46.66026, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12389972534'),
  ('landmark|transport|metro_station|محطة مترو سابك', 'محطة مترو سابك', 'transport', 'metro_station', 'جامعة الإمام محمد بن سعود الإسلامية', null, 24.80712, 46.70935, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12389972557'),
  ('landmark|transport|metro_station|محطة مترو المحطة الغربية', 'محطة مترو المحطة الغربية', 'transport', 'metro_station', 'السويدي الغربي', null, 24.58181, 46.61458, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12475968014'),
  ('landmark|transport|metro_station|محطة مترو الملز', 'محطة مترو الملز', 'transport', 'metro_station', 'الملز', null, 24.66041, 46.74455, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12475590068'),
  ('landmark|transport|metro_station|محطة مترو استاد الملك فهد', 'محطة مترو استاد الملك فهد', 'transport', 'metro_station', 'المعيزيلة', null, 24.79308, 46.83643, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12430736336'),
  ('landmark|transport|metro_station|محطة مترو مجمع المحاكم', 'محطة مترو مجمع المحاكم', 'transport', 'metro_station', 'الدحو', null, 24.62675, 46.71228, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12395509809'),
  ('landmark|transport|metro_station|محطة مترو مركز الرياض للمعارض', 'محطة مترو مركز الرياض للمعارض', 'transport', 'metro_station', 'مغرزات', null, 24.75455, 46.72711, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/12430195368'),
  ('landmark|government|ministry|وزارة التعليم', 'وزارة التعليم', 'government', 'ministry', 'صلاح الدين', null, 24.74061, 46.6958, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:relation/18359090'),
  ('landmark|government|ministry|وزارة الصحة', 'وزارة الصحة', 'government', 'ministry', 'المربع', null, 24.65708, 46.71304, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/4393127690'),
  ('landmark|government|ministry|وزارة الداخلية', 'وزارة الداخلية', 'government', 'ministry', 'السلامة', null, 24.6742, 46.69503, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:relation/18359091'),
  ('landmark|government|ministry|وزارة الخارجية', 'وزارة الخارجية', 'government', 'ministry', 'الفاخرية', null, 24.64923, 46.69237, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/302308518'),
  ('landmark|government|ministry|وزارة المالية', 'وزارة المالية', 'government', 'ministry', 'الملز', null, 24.65179, 46.71628, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:relation/18359082'),
  ('landmark|government|ministry|وزارة الرياضة', 'وزارة الرياضة', 'government', 'ministry', 'الملز', null, 24.65978, 46.72657, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/1302813277'),
  ('landmark|government|ministry|وزارة الدفاع', 'وزارة الدفاع', 'government', 'ministry', 'الوزارات', null, 24.66723, 46.71818, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:relation/18359084'),
  ('landmark|government|ministry|وزارة العدل', 'وزارة العدل', 'government', 'ministry', 'الملز', null, 24.65944, 46.7252, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/1302850059'),
  ('landmark|government|ministry|وزارة الطاقة', 'وزارة الطاقة', 'government', 'ministry', 'النخيل', null, 24.74215, 46.63625, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/900882196'),
  ('landmark|government|ministry|وزارة الحج والعمرة', 'وزارة الحج والعمرة', 'government', 'ministry', 'النموذجية', null, 24.67375, 46.70309, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/905721595'),
  ('landmark|government|ministry|وزارة الصناعة والثروة المعدنية', 'وزارة الصناعة والثروة المعدنية', 'government', 'ministry', 'الملز', null, 24.6522, 46.74933, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/1172743987'),
  ('landmark|government|ministry|وزارة النقل والخدمات اللوجستية', 'وزارة النقل والخدمات اللوجستية', 'government', 'ministry', 'المروج', null, 24.75809, 46.65185, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/1305728386'),
  ('landmark|government|ministry|وزارة البلديات والإسكان', 'وزارة البلديات والإسكان', 'government', 'ministry', 'جامعة الملك سعود', null, 24.71338, 46.63134, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/13277426536'),
  ('landmark|government|ministry|وزارة الشؤون الإسلامية والدعوة والإرشاد', 'وزارة الشؤون الإسلامية والدعوة والإرشاد', 'government', 'ministry', 'العليا', null, 24.69311, 46.6823, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/1380326965'),
  ('landmark|government|ministry|وزارة الاقتصاد والتخطيط', 'وزارة الاقتصاد والتخطيط', 'government', 'ministry', 'غرناطة', null, 24.78653, 46.72787, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:node/5577877023'),
  ('landmark|government|ministry|وزارة الثقافة', 'وزارة الثقافة', 'government', 'ministry', 'طريفة', null, 24.73489, 46.58426, '{}'::text[], false, 'openstreetmap', 'verified', 'openstreetmap:way/1353634342'),
  ('landmark|government|ministry|وزارة البيئة والمياه والزراعة', 'وزارة البيئة والمياه والزراعة', 'government', 'ministry', 'الملز', null, 24.65983, 46.71772, '{}'::text[], false, 'approximate', 'approximate', 'openstreetmap:near:node/12389831233'),
  ('landmark|government|ministry|وزارة الموارد البشرية والتنمية الاجتماعية', 'وزارة الموارد البشرية والتنمية الاجتماعية', 'government', 'ministry', 'المرسلات', null, 24.746, 46.68191, '{}'::text[], false, 'approximate', 'approximate', 'openstreetmap:near:way/636404847'),
  ('landmark|government|ministry|وزارة التجارة', 'وزارة التجارة', 'government', 'ministry', 'الملز', null, 24.65218, 46.7488, '{}'::text[], false, 'approximate', 'approximate', 'openstreetmap:near:way/280533680'),
  ('landmark|government|ministry|وزارة السياحة', 'وزارة السياحة', 'government', 'ministry', 'السفارات', null, 24.68376, 46.62364, '{}'::text[], false, 'approximate', 'approximate', 'openstreetmap:near:relation/4626246'),
  ('landmark|government|ministry|وزارة الاتصالات وتقنية المعلومات', 'وزارة الاتصالات وتقنية المعلومات', 'government', 'ministry', 'المرسلات', null, 24.74, 46.687, '{}'::text[], false, 'approximate', 'approximate', 'estimate'),
  ('landmark|government|ministry|وزارة الإعلام', 'وزارة الإعلام', 'government', 'ministry', 'المربع', null, 24.656, 46.703, '{}'::text[], false, 'approximate', 'approximate', 'estimate'),
  ('landmark|government|ministry|وزارة الاستثمار', 'وزارة الاستثمار', 'government', 'ministry', 'العقيق', null, 24.763, 46.642, '{}'::text[], false, 'approximate', 'approximate', 'estimate'),
  ('landmark|government|ministry|وزارة الحرس الوطني', 'وزارة الحرس الوطني', 'government', 'ministry', 'الرماية', null, 24.748, 46.856, '{}'::text[], false, 'approximate', 'approximate', 'estimate')
) as v (seed_key, name_ar, category, subcategory, neighborhood, address_ar, latitude, longitude, tags, is_demo, source, location_status, location_source)
where not exists (select 1 from hudhud_demo.places p where p.seed_key = v.seed_key)
  and not exists (select 1 from hudhud_demo.places p where p.name_ar = v.name_ar and p.category = v.category);
