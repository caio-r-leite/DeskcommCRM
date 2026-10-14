"use client";

import { useQuery } from "@tanstack/react-query";
import { Zap } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";

type Mode = "none" | "selected" | "all";
type Template = {
  id: string;
  title: string;
  owner_user_id: string | null;
  shortcut: string | null;
  steps: Array<{ id: string }>;
};

export function AcessoRespostasRapidas({
  mode,
  templateIds,
  onModeChange,
  onTemplateIdsChange,
  disabled,
  error,
}: {
  mode: Mode;
  templateIds: string[];
  onModeChange: (mode: Mode) => void;
  onTemplateIdsChange: (ids: string[]) => void;
  disabled?: boolean;
  error?: string;
}) {
  const t = useT();
  const query = useQuery({
    queryKey: ["message-templates", "agent-access"],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Template[] }>("/api/v1/message-templates");
      // Resposta pessoal nunca entra: o agente representa a empresa, não um atendente.
      return res.data.filter((item) => item.owner_user_id === null);
    },
    staleTime: 60_000,
  });
  const templates = query.data ?? [];

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-2">
        <span className="rounded-md bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-300">
          <Zap className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h3 className="text-sm font-medium">{t("Respostas rápidas autorizadas")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("A IA apenas escolhe um roteiro. Textos, mídias, etiquetas e movimentos no CRM são executados exatamente como foram cadastrados.")}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="quick_reply_access_mode">{t("Acesso deste agente")}</Label>
        <Select value={mode} onValueChange={(value) => onModeChange(value as Mode)} disabled={disabled}>
          <SelectTrigger id="quick_reply_access_mode"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("Desativado")}</SelectItem>
            <SelectItem value="selected">{t("Somente respostas selecionadas")}</SelectItem>
            <SelectItem value="all">{t("Todas as respostas compartilhadas")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === "selected" ? (
        <div className="space-y-2 rounded-md border p-3">
          {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
          {query.isLoading ? <p className="text-xs text-muted-foreground">{t("Carregando respostas…")}</p> : null}
          {!query.isLoading && templates.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("Crie uma resposta rápida compartilhada para liberar ao agente.")}</p>
          ) : null}
          {templates.map((template) => {
            const checked = templateIds.includes(template.id);
            return (
              <label key={template.id} className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/50">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-primary"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onTemplateIdsChange(checked ? templateIds.filter((id) => id !== template.id) : [...templateIds, template.id])}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{template.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {template.steps.length} {template.steps.length === 1 ? t("etapa") : t("etapas")}
                    {template.shortcut ? ` · /${template.shortcut}` : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ) : null}

      {mode === "all" ? (
        <p className="rounded-md bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          {t("Novas respostas compartilhadas também ficarão disponíveis para este agente. Use “Somente selecionadas” quando quiser uma lista fixa.")}
        </p>
      ) : null}
    </Card>
  );
}
