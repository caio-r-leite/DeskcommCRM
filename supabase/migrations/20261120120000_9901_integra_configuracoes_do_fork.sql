-- manifest: Mantém respostas rápidas e a entrada automática do fork compatíveis com o agente e o funil oficiais.

-- A trava do fork é independente da trava oficial, que protege os demais campos.
create or replace function public.fn_quick_reply_scope_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' and (
       new.quick_reply_access_mode is distinct from old.quick_reply_access_mode
    or new.quick_reply_template_ids is distinct from old.quick_reply_template_ids
  ) then
    raise exception 'O acesso publicado às respostas rápidas é imutável.';
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_quick_reply_scope_immutable() from public, anon, authenticated;
grant execute on function public.fn_quick_reply_scope_immutable() to service_role;

drop trigger if exists trg_quick_reply_scope_immutable on public.ai_agent_versions;
create trigger trg_quick_reply_scope_immutable
  before update on public.ai_agent_versions
  for each row execute function public.fn_quick_reply_scope_immutable();

-- Em instalação atualizada, conserva dados da versão antiga e aceita as
-- respostas nativas que enviam somente mídia e são criadas em duas etapas.
alter table public.message_templates drop constraint if exists message_templates_kind_media_check;
alter table public.message_templates add constraint message_templates_kind_media_check check (
  (kind = 'text' and media_storage_path is null)
  or (kind in ('image','video') and media_storage_path is not null
      and media_storage_path like organization_id::text || '/templates/%'
      and media_mime like kind || '/%' and media_size_bytes between 1 and 52428800
      and length(btrim(media_filename)) > 0)
  or (kind = 'script' and media_storage_path is null)
);

-- Aproveita a coluna antiga quando ainda não existe uma decisão oficial.
-- Depois desta migração a fonte consultada pelo Inbox é settings.
update public.crm_pipelines p
   set settings = jsonb_set(coalesce(p.settings, '{}'::jsonb), '{entrada_do_inbox}',
     jsonb_build_object('ativa', true, 'stage_id', p.entry_stage_id))
  from public.crm_stages s
 where s.id = p.entry_stage_id and s.organization_id = p.organization_id
   and s.pipeline_id = p.id and not s.is_archived and not s.is_won and not s.is_lost
   and not coalesce(p.settings ? 'entrada_do_inbox', false);

create or replace function public.fn_configurar_entrada_automatica(
  p_org uuid,
  p_pipeline uuid,
  p_stage uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pipeline_name text;
  v_stage_name text;
begin
  -- Uma troca por organização de cada vez. Assim nunca há dois requests
  -- disputando o índice único de funil padrão nem uma configuração pela metade.
  perform pg_advisory_xact_lock(hashtextextended('entrada-automatica:' || p_org::text, 0));

  select p.name
    into v_pipeline_name
    from public.crm_pipelines p
   where p.id = p_pipeline
     and p.organization_id = p_org
     and p.is_archived = false
   for update;

  if v_pipeline_name is null then
    raise sqlstate 'PT404' using message = 'Funil não encontrado nesta organização.';
  end if;

  select s.name
    into v_stage_name
    from public.crm_stages s
   where s.id = p_stage
     and s.organization_id = p_org
     and s.pipeline_id = p_pipeline
     and s.is_archived = false
     and s.is_won = false
     and s.is_lost = false
   for update;

  if v_stage_name is null then
    raise sqlstate 'PT422'
      using message = 'Escolha uma coluna aberta e ativa do funil selecionado.';
  end if;

  -- O índice de padrão é imediato: libera o anterior antes de marcar o novo.
  update public.crm_pipelines
     set is_default = false
   where organization_id = p_org
     and id <> p_pipeline
     and is_default = true;

  update public.crm_pipelines
     set is_default = true,
         entry_stage_id = p_stage,
         settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{entrada_do_inbox}',
           jsonb_build_object('ativa', true, 'stage_id', p_stage))
   where organization_id = p_org
     and id = p_pipeline
     and is_archived = false;

  if not found then
    raise sqlstate 'PT409' using message = 'O funil mudou enquanto a configuração era salva.';
  end if;

  return jsonb_build_object(
    'pipeline_id', p_pipeline,
    'pipeline_name', v_pipeline_name,
    'stage_id', p_stage,
    'stage_name', v_stage_name
  );
end;
$$;

revoke execute on function public.fn_configurar_entrada_automatica(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.fn_configurar_entrada_automatica(uuid, uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
