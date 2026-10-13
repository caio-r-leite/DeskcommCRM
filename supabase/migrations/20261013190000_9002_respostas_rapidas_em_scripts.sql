-- manifest: Respostas rápidas passam a aceitar categorias, roteiros ordenados e execuções retomáveis, mantendo compatibilidade com cada texto, foto ou vídeo já cadastrado.

create table if not exists public.message_template_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  color text not null default 'teal' check (color in ('teal','green','red','yellow','blue','purple','gray')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.message_templates
  add column if not exists category_id uuid references public.message_template_categories(id) on delete set null,
  add column if not exists usage_count bigint not null default 0,
  add column if not exists last_used_at timestamptz;

alter table public.message_templates drop constraint if exists message_templates_kind_media_check;
alter table public.message_templates add constraint message_templates_kind_media_check check (
  (kind = 'text' and length(btrim(body)) > 0 and media_storage_path is null)
  or (kind in ('image','video') and media_storage_path is not null
      and media_storage_path like organization_id::text || '/templates/%'
      and media_mime like kind || '/%' and media_size_bytes between 1 and 52428800
      and length(btrim(media_filename)) > 0)
  or (kind = 'script' and media_storage_path is null)
);

create table if not exists public.message_template_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.message_templates(id) on delete cascade,
  position integer not null check (position >= 0),
  action_type text not null check (action_type in ('text','image','video','wait','add_tag','move_stage','upsert_crm')),
  body text not null default '' check (length(body) <= 4096),
  wait_seconds integer not null default 0 check (wait_seconds between 0 and 3600),
  media_storage_path text,
  media_mime text,
  media_size_bytes bigint,
  media_filename text,
  action_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, position),
  check (
    (action_type in ('image','video') and media_storage_path is not null
      and media_storage_path like organization_id::text || '/templates/%'
      and media_mime like action_type || '/%' and media_size_bytes between 1 and 52428800
      and length(btrim(media_filename)) > 0)
    or (action_type not in ('image','video') and media_storage_path is null)
  )
);

create table if not exists public.message_template_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid references public.message_templates(id) on delete set null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  started_by_user_id uuid not null references auth.users(id) on delete restrict,
  template_title text not null,
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','cancelled')),
  current_position integer not null default 0,
  total_steps integer not null check (total_steps > 0),
  error_message text,
  confirmed_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_template_execution_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  execution_id uuid not null references public.message_template_executions(id) on delete cascade,
  source_step_id uuid references public.message_template_steps(id) on delete set null,
  position integer not null check (position >= 0),
  action_type text not null check (action_type in ('text','image','video','wait','add_tag','move_stage','upsert_crm')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','skipped')),
  idempotency_key uuid not null default gen_random_uuid(),
  result jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  unique (execution_id, position),
  unique (idempotency_key)
);

create index if not exists idx_message_template_categories_org on public.message_template_categories(organization_id, name);
create index if not exists idx_message_template_steps_template on public.message_template_steps(template_id, position);
create index if not exists idx_message_template_executions_conversation on public.message_template_executions(organization_id, conversation_id, created_at desc);
create index if not exists idx_message_template_execution_steps_execution on public.message_template_execution_steps(execution_id, position);

insert into public.message_template_steps
  (organization_id, template_id, position, action_type, body, media_storage_path, media_mime, media_size_bytes, media_filename)
select organization_id, id, 0, kind, body, media_storage_path, media_mime, media_size_bytes, media_filename
from public.message_templates
where kind in ('text','image','video')
on conflict (template_id, position) do nothing;

alter table public.message_template_categories enable row level security;
alter table public.message_template_steps enable row level security;
alter table public.message_template_executions enable row level security;
alter table public.message_template_execution_steps enable row level security;

drop policy if exists message_template_categories_select on public.message_template_categories;
create policy message_template_categories_select on public.message_template_categories for select using
  (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());
drop policy if exists message_template_categories_write on public.message_template_categories;
create policy message_template_categories_write on public.message_template_categories for all using
  (public.fn_role_at_least(organization_id, 'manager')) with check
  (public.fn_role_at_least(organization_id, 'manager'));

drop policy if exists message_template_steps_select on public.message_template_steps;
create policy message_template_steps_select on public.message_template_steps for select using (
  exists (select 1 from public.message_templates t where t.id = template_id)
);
drop policy if exists message_template_steps_write on public.message_template_steps;
create policy message_template_steps_write on public.message_template_steps for all using (
  exists (select 1 from public.message_templates t where t.id = template_id
    and ((t.owner_user_id = auth.uid() and public.fn_role_at_least(t.organization_id, 'agent'))
      or (t.owner_user_id is null and public.fn_role_at_least(t.organization_id, 'manager'))))
) with check (
  exists (select 1 from public.message_templates t where t.id = template_id
    and t.organization_id = organization_id
    and ((t.owner_user_id = auth.uid() and public.fn_role_at_least(t.organization_id, 'agent'))
      or (t.owner_user_id is null and public.fn_role_at_least(t.organization_id, 'manager'))))
);

drop policy if exists message_template_executions_member on public.message_template_executions;
create policy message_template_executions_member on public.message_template_executions for all using
  (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent'))
  with check (organization_id in (select public.fn_user_org_ids())
    and started_by_user_id = auth.uid() and public.fn_role_at_least(organization_id, 'agent'));

drop policy if exists message_template_execution_steps_member on public.message_template_execution_steps;
create policy message_template_execution_steps_member on public.message_template_execution_steps for all using (
  exists (select 1 from public.message_template_executions e where e.id = execution_id
    and e.organization_id in (select public.fn_user_org_ids()))
) with check (
  exists (select 1 from public.message_template_executions e where e.id = execution_id
    and e.organization_id = organization_id and e.started_by_user_id = auth.uid())
);

comment on table public.message_template_execution_steps is
  'Snapshot imutável dos passos confirmados; a idempotency_key permite retomar sem repetir um envio concluído.';
