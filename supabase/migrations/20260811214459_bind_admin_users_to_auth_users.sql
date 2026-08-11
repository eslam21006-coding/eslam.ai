alter table public.admin_users
  add column user_id uuid unique references auth.users(id) on delete cascade;
