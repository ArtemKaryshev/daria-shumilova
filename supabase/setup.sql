-- =====================================================================
-- Настройка базы Supabase для сайта-портфолио.
-- Выполните ЦЕЛИКОМ в Supabase: SQL Editor → New query → вставить → Run.
-- Скрипт можно запускать повторно , он ничего не сломает.
-- =====================================================================

-- 1. Таблица с содержимым сайта (одна строка, id = 1)
create table if not exists public.site_content (
  id         integer primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. Список администраторов (только эти пользователи могут менять сайт)
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- 3. Проверка «текущий пользователь , администратор?»
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 4. Права доступа (RLS)
alter table public.site_content enable row level security;
alter table public.admins       enable row level security;

drop policy if exists "site_content: read for everyone" on public.site_content;
drop policy if exists "site_content: insert by admin"   on public.site_content;
drop policy if exists "site_content: update by admin"   on public.site_content;
drop policy if exists "admins: read own row"            on public.admins;

create policy "site_content: read for everyone" on public.site_content
  for select using (true);
create policy "site_content: insert by admin" on public.site_content
  for insert to authenticated with check (public.is_admin());
create policy "site_content: update by admin" on public.site_content
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins: read own row" on public.admins
  for select to authenticated using (user_id = auth.uid());

grant select on public.site_content to anon, authenticated;
grant insert, update on public.site_content to authenticated;
grant select on public.admins to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- Автоматически обновлять дату изменения
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists site_content_touch on public.site_content;
create trigger site_content_touch before update on public.site_content
  for each row execute function public.touch_updated_at();

-- 5. Хранилище для фото и сканов грамот (публичное чтение, запись , только админ)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
on conflict (id) do update set public = true;

drop policy if exists "media: public read"  on storage.objects;
drop policy if exists "media: admin insert" on storage.objects;
drop policy if exists "media: admin update" on storage.objects;
drop policy if exists "media: admin delete" on storage.objects;

create policy "media: public read" on storage.objects
  for select using (bucket_id = 'media');
create policy "media: admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
create policy "media: admin update" on storage.objects
  for update to authenticated using (bucket_id = 'media' and public.is_admin());
create policy "media: admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_admin());

-- =====================================================================
-- 6. ПОСЛЕ того как создадите пользователя (Authentication → Users → Add user),
--    выполните ОТДЕЛЬНО эту строку, подставив свою почту:
--
--    insert into public.admins (user_id)
--    select id from auth.users where email = 'ваша@почта.ru'
--    on conflict do nothing;
-- =====================================================================
