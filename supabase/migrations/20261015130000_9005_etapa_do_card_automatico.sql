-- manifest: Permite escolher, de forma atômica e por organização, o funil e a coluna onde nasce o card automático de uma conversa.

alter table public.crm_pipelines
  add column if not exists entry_stage_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'crm_pipelines_entry_stage_id_fkey'
       and conrelid = 'public.crm_pipelines'::regclass
  ) then
    alter table public.crm_pipelines
      add constraint crm_pipelines_entry_stage_id_fkey
      foreign key (entry_stage_id)
      references public.crm_stages(id)
      on delete set null;
  end if;
end;
$$;

comment on column public.crm_pipelines.entry_stage_id is
  'Etapa aberta escolhida para o card que nasce automaticamente neste funil. NULL preserva o fallback para a primeira etapa aberta.';

create or replace function public.fn_validar_etapa_de_entrada_do_funil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.entry_stage_id is not null and not exists (
    select 1
      from public.crm_stages s
     where s.id = new.entry_stage_id
       and s.organization_id = new.organization_id
       and s.pipeline_id = new.id
       and s.is_archived = false
       and s.is_won = false
       and s.is_lost = false
  ) then
    raise sqlstate 'PT422'
      using message = 'A coluna inicial precisa ser uma etapa aberta deste mesmo funil.';
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_validar_etapa_de_entrada_do_funil()
  from public, anon, authenticated;
grant execute on function public.fn_validar_etapa_de_entrada_do_funil()
  to service_role;

drop trigger if exists trg_validar_etapa_de_entrada_do_funil on public.crm_pipelines;
create trigger trg_validar_etapa_de_entrada_do_funil
before insert or update of entry_stage_id, organization_id on public.crm_pipelines
for each row execute function public.fn_validar_etapa_de_entrada_do_funil();

create or replace function public.fn_configurar_entrada_automatica(
  p_org uuid,
  p_pipeline uuid,
  p_stage uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
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
         entry_stage_id = p_stage
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
