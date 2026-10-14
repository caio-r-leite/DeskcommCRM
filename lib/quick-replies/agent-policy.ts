export type QuickReplyAccessMode = "none" | "selected" | "all";

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
