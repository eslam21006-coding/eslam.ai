create policy "Server can read admin users"
  on public.admin_users
  for select
  to service_role
  using (true);

create policy "Server can bind admin users"
  on public.admin_users
  for update
  to service_role
  using (true)
  with check (true);
