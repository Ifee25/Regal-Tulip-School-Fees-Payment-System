insert into public.classes(name, display_order) values
  ('Creche', 1),
  ('Play Group', 2),
  ('Nursery 1', 3),
  ('Nursery 2', 4),
  ('Nursery 3', 5),
  ('Primary 1', 6),
  ('Primary 2', 7),
  ('Primary 3', 8),
  ('Primary 4', 9),
  ('Primary 5', 10),
  ('Primary 6', 11)
on conflict (name) do update
set display_order = excluded.display_order;

notify pgrst, 'reload schema';
