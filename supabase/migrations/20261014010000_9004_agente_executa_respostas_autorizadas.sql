-- manifest: Permite que cada versão publicada do agente execute somente respostas rápidas compartilhadas explicitamente autorizadas, com ator e retomada idempotente registrados na execução.

alter table public.ai_agent_versions
  add column if not exists quick_reply_access_mode text not null default 'none',
  add column if not exists quick_reply_template_ids uuid[] not null default '{}'::uuid[];

alter table public.ai_agent_versions
  drop constraint if exists ai_agent_versions_quick_reply_access_mode_check;
alter table public.ai_agent_versions
  add constraint ai_agent_versions_quick_reply_access_mode_check
  check (quick_reply_access_mode in ('none', 'selected', 'all'));

comment on column public.ai_agent_versions.quick_reply_access_mode is
  'Acesso do agente a respostas rápidas compartilhadas: none, selected ou all.';
comment on column public.ai_agent_versions.quick_reply_template_ids is
  'Allowlist versionada de message_templates usada quando quick_reply_access_mode=selected.';

alter table public.message_template_executions
  alter column started_by_user_id drop not null,
  add column if not exists started_by_agent_version_id uuid
    references public.ai_agent_versions(id) on delete restrict,
  add column if not exists source_job_id uuid
    references public.job_queue(id) on delete set null;

alter table public.message_template_executions
  drop constraint if exists message_template_executions_one_actor_check;
alter table public.message_template_executions
  add constraint message_template_executions_one_actor_check
  check (num_nonnulls(started_by_user_id, started_by_agent_version_id) = 1);

create unique index if not exists uq_message_template_execution_agent_job
  on public.message_template_executions(organization_id, source_job_id, template_id)
  where source_job_id is not null and started_by_agent_version_id is not null;

create or replace function fn_ai_agent_version_content_immutable() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  if old.status <> 'draft' and (
       new.system_prompt          is distinct from old.system_prompt
    or new.provider               is distinct from old.provider
    or new.model                  is distinct from old.model
    or new.credential_id          is distinct from old.credential_id
    or new.tool_ids               is distinct from old.tool_ids
    or new.trigger_config         is distinct from old.trigger_config
    or new.channel_session_id     is distinct from old.channel_session_id
    or new.max_steps              is distinct from old.max_steps
    or new.token_budget           is distinct from old.token_budget
    or new.cost_budget_cents      is distinct from old.cost_budget_cents
    or new.history_message_window is distinct from old.history_message_window
    or new.history_token_window   is distinct from old.history_token_window
    or new.handoff_keywords       is distinct from old.handoff_keywords
    or new.handoff_tool_enabled   is distinct from old.handoff_tool_enabled
    or new.handoff_legal_enabled  is distinct from old.handoff_legal_enabled
    or new.followup               is distinct from old.followup
    or new.multimodal_input       is distinct from old.multimodal_input
    or new.video_frames_enabled   is distinct from old.video_frames_enabled
    or new.split_messages         is distinct from old.split_messages
    or new.split_max_chars        is distinct from old.split_max_chars
    or new.cases_enabled          is distinct from old.cases_enabled
    or new.operator_enabled       is distinct from old.operator_enabled
    or new.operator_model         is distinct from old.operator_model
    or new.operator_tool_ids      is distinct from old.operator_tool_ids
    or new.pipeline_ids           is distinct from old.pipeline_ids
    or new.knowledge_source_ids   is distinct from old.knowledge_source_ids
    or new.proposal_ai_draft_enabled is distinct from old.proposal_ai_draft_enabled
    or new.inbound_debounce_ms    is distinct from old.inbound_debounce_ms
    or new.quick_reply_access_mode is distinct from old.quick_reply_access_mode
    or new.quick_reply_template_ids is distinct from old.quick_reply_template_ids
    or new.version_number         is distinct from old.version_number
    or new.agent_id               is distinct from old.agent_id
    or new.organization_id        is distinct from old.organization_id
  ) then
    raise exception 'ai_agent_versions % é imutável (status=%): mudança de conteúdo = versão draft nova; rollback = revert (clona + publica)',
      old.id, old.status;
  end if;
  return new;
end;
$fn$;

notify pgrst, 'reload schema';
