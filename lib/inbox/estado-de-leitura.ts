export const FILTRO_DE_CONVERSA_NAO_LIDA = "unread_count_for_assignee.gt.0,marcada_como_nao_lida.eq.true";

export function conversaNaoLida(conversa: {
  unread_count_for_assignee: number | null;
  marcada_como_nao_lida?: boolean;
}): boolean {
  return (conversa.unread_count_for_assignee ?? 0) > 0 || conversa.marcada_como_nao_lida === true;
}
