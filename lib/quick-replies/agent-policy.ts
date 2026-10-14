export type QuickReplyAccessMode = "none" | "selected" | "all";

export function reconcileSelectedQuickReplies(
  mode: QuickReplyAccessMode,
  selectedIds: readonly string[],
  availableIds: readonly string[],
): { mode: QuickReplyAccessMode; templateIds: string[]; removedIds: string[] } {
  if (mode !== "selected") {
    return { mode, templateIds: [...selectedIds], removedIds: [] };
  }

  const available = new Set(availableIds);
  const templateIds = [...new Set(selectedIds)].filter((id) => available.has(id));
  const removedIds = [...new Set(selectedIds)].filter((id) => !available.has(id));

  // Uma seleção que ficou vazia porque as respostas foram apagadas fecha o
  // acesso do agente. É o estado seguro e, diferente de manter UUIDs mortos,
  // deixa o restante do formulário voltar a ser salvo. Uma seleção que já
  // nasceu vazia continua inválida e é explicada pela validação do editor.
  const reconciledMode = selectedIds.length > 0 && templateIds.length === 0 ? "none" : mode;
  return { mode: reconciledMode, templateIds, removedIds };
}

export function hasAgentTurnTools(
  toolIds: readonly string[],
  quickReplyMode: QuickReplyAccessMode | null | undefined,
): boolean {
  return toolIds.length > 0 || quickReplyMode === "selected" || quickReplyMode === "all";
}

export function canAgentUseTemplate(
  mode: QuickReplyAccessMode | null | undefined,
  selectedIds: readonly string[] | null | undefined,
  templateId: string,
): boolean {
  if (mode === "all") return true;
  return mode === "selected" && (selectedIds ?? []).includes(templateId);
}

export function matchAuthorizedTemplate<T extends { id: string; title: string; shortcut: string | null }>(
  templates: readonly T[],
  requested: string,
): T | null {
  const key = requested.trim().toLocaleLowerCase();
  const matches = templates.filter(
    (item) =>
      item.id === requested ||
      item.title.trim().toLocaleLowerCase() === key ||
      item.shortcut?.trim().toLocaleLowerCase() === key,
  );
  return matches.length === 1 ? matches[0]! : null;
}

export function totalWaitSeconds(steps: readonly { action_type: string; wait_seconds: number }[]): number {
  return steps.reduce(
    (sum, step) => sum + (step.action_type === "wait" ? Math.max(0, step.wait_seconds) : 0),
    0,
  );
}
