create table if not exists public.user_favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists user_favourites_user_id_space_id_idx
  on public.user_favourites(user_id, space_id);

alter table public.user_favourites enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_favourites'
      and policyname = 'user_favourites_select_own'
  ) then
    create policy user_favourites_select_own
      on public.user_favourites
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_favourites'
      and policyname = 'user_favourites_insert_own'
  ) then
    create policy user_favourites_insert_own
      on public.user_favourites
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_favourites'
      and policyname = 'user_favourites_delete_own'
  ) then
    create policy user_favourites_delete_own
      on public.user_favourites
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;
