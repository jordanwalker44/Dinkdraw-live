insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-logos',
  'organization-logos',
  true,
  3145728,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Organization logos are public" on storage.objects;
drop policy if exists "Organization owners can upload logos" on storage.objects;
drop policy if exists "Organization owners can update logos" on storage.objects;
drop policy if exists "Organization owners can delete logos" on storage.objects;

create policy "Organization logos are public"
on storage.objects
for select
using (bucket_id = 'organization-logos');

create policy "Organization owners can upload logos"
on storage.objects
for insert
with check (
  bucket_id = 'organization-logos'
  and exists (
    select 1
    from public.organization_members
    where organization_members.organization_id::text = split_part(name, '/', 1)
      and organization_members.user_id = auth.uid()
      and organization_members.role in ('owner', 'admin')
  )
);

create policy "Organization owners can update logos"
on storage.objects
for update
using (
  bucket_id = 'organization-logos'
  and exists (
    select 1
    from public.organization_members
    where organization_members.organization_id::text = split_part(name, '/', 1)
      and organization_members.user_id = auth.uid()
      and organization_members.role in ('owner', 'admin')
  )
)
with check (
  bucket_id = 'organization-logos'
  and exists (
    select 1
    from public.organization_members
    where organization_members.organization_id::text = split_part(name, '/', 1)
      and organization_members.user_id = auth.uid()
      and organization_members.role in ('owner', 'admin')
  )
);

create policy "Organization owners can delete logos"
on storage.objects
for delete
using (
  bucket_id = 'organization-logos'
  and exists (
    select 1
    from public.organization_members
    where organization_members.organization_id::text = split_part(name, '/', 1)
      and organization_members.user_id = auth.uid()
      and organization_members.role in ('owner', 'admin')
  )
);
