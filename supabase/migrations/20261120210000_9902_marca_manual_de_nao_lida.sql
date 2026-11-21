-- manifest: A marca manual de não lida não incrementa o contador de mensagens recebidas.

alter table public.conversations
  add column if not exists marcada_como_nao_lida boolean not null default false;

create or replace function public.fn_limpar_marca_manual_de_nao_lida() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.marcada_como_nao_lida and (
    new.unread_count_for_assignee is distinct from old.unread_count_for_assignee
    or new.last_outbound_at is distinct from old.last_outbound_at
    or new.assigned_to_user_id is distinct from old.assigned_to_user_id
  ) then
    new.marcada_como_nao_lida := false;
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_limpar_marca_manual_de_nao_lida() from public, anon, authenticated;

drop trigger if exists trg_limpar_marca_manual_de_nao_lida on public.conversations;
create trigger trg_limpar_marca_manual_de_nao_lida
before update of unread_count_for_assignee, last_outbound_at, assigned_to_user_id
on public.conversations
for each row execute function public.fn_limpar_marca_manual_de_nao_lida();

notify pgrst, 'reload schema';
