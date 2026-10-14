-- O snapshot pertence à MESMA organização da execução que o contém.
-- Na policy original, `e.organization_id = organization_id` era resolvido
-- inteiramente dentro do alias `e`, tornando a comparação tautológica.
drop policy if exists message_template_execution_steps_member
  on public.message_template_execution_steps;

create policy message_template_execution_steps_member
on public.message_template_execution_steps
for all
using (
  exists (
    select 1
    from public.message_template_executions e
    where e.id = message_template_execution_steps.execution_id
      and e.organization_id = message_template_execution_steps.organization_id
      and e.organization_id in (select public.fn_user_org_ids())
  )
)
with check (
  exists (
    select 1
    from public.message_template_executions e
    where e.id = message_template_execution_steps.execution_id
      and e.organization_id = message_template_execution_steps.organization_id
      and e.started_by_user_id = auth.uid()
      and public.fn_role_at_least(e.organization_id, 'agent')
  )
);
