"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { CaretDown, CaretUp, Copy, Plus, Trash } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import type { MessageTemplate, MessageTemplateAction } from "@/hooks/inbox/useMessageTemplates";
import { useMessageTemplateCategories } from "@/hooks/inbox/useMessageTemplates";
import { MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";

type Draft = {
  key: string;
  id?: string;
  action_type: MessageTemplateAction;
  body: string;
  wait_seconds: number;
  action_config: Record<string, unknown>;
  file?: File;
  media_filename?: string | null;
};
const uid = () => crypto.randomUUID();
const blank = (type: MessageTemplateAction = "text"): Draft => ({
  key: uid(),
  action_type: type,
  body: "",
  wait_seconds: type === "wait" ? 2 : 0,
  action_config: {},
});

export function TemplateScriptDialog({
  open,
  onOpenChange,
  canShare,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canShare: boolean;
  template?: MessageTemplate | null;
}) {
  const t = useT();
  const qc = useQueryClient();
  const categoryQuery = useMessageTemplateCategories();
  const [title, setTitle] = React.useState("");
  const [shortcut, setShortcut] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [newCategory, setNewCategory] = React.useState("");
  const [categoryName, setCategoryName] = React.useState("");
  const [shared, setShared] = React.useState(false);
  const [steps, setSteps] = React.useState<Draft[]>([blank()]);
  const [saving, setSaving] = React.useState(false);
  const pipelines = useQuery({
    queryKey: ["pipelines", "quick-reply-editor"],
    enabled: open,
    queryFn: () =>
      apiClient
        .get<{ data: Array<{ id: string; name: string }> }>("/api/v1/pipelines")
        .then((r) => r.data),
    retry: false,
  });
  const categories = categoryQuery.data ?? [];
  React.useEffect(() => {
    if (!open) return;
    setTitle(template?.title ?? "");
    setShortcut(template?.shortcut ?? "");
    setCategoryId(template?.category_id ?? "");
    setShared(template?.owner_user_id === null);
    setNewCategory("");
    setCategoryName("");
    setSteps(
      template?.kind === "script" && template.steps.length
        ? template.steps.map((s) => ({
            key: s.id,
            id: s.id,
            action_type: s.action_type,
            body: s.body,
            wait_seconds: s.wait_seconds,
            action_config: s.action_config,
            media_filename: s.media_filename,
          }))
        : [blank()],
    );
  }, [open, template]);
  function update(key: string, patch: Partial<Draft>) {
    setSteps((items) => items.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }
  function move(index: number, delta: number) {
    setSteps((items) => {
      const next = [...items];
      const target = index + delta;
      if (target < 0 || target >= next.length) return items;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }
  async function save() {
    if (!title.trim() || !steps.length) return;
    setSaving(true);
    let createdTemplateId: string | null = null;
    try {
      let selectedCategory = categoryId || null;
      if (newCategory.trim()) {
        const created = await apiClient.post<{ data: { id: string } }>(
          "/api/v1/message-template-categories",
          { name: newCategory.trim(), color: "teal" },
        );
        selectedCategory = created.data.id;
      }
      const payload = {
        title,
        shortcut: shortcut.trim() || null,
        category_id: selectedCategory,
        shared,
        steps: steps.map(({ id, action_type, body, wait_seconds, action_config }) => ({
          id,
          action_type,
          body,
          wait_seconds,
          action_config,
        })),
      };
      let templateId = template?.id;
      if (templateId)
        await apiClient.patch(`/api/v1/message-templates/scripts/${templateId}`, payload);
      else {
        templateId = (
          await apiClient.post<{ data: { id: string } }>(
            "/api/v1/message-templates/scripts",
            payload,
          )
        ).data.id;
        createdTemplateId = templateId;
      }
      for (let position = 0; position < steps.length; position++) {
        const step = steps[position]!;
        if (!step.file) continue;
        if (step.file.size > MAX_MEDIA_BYTES) throw new Error(t("Arquivo acima de 50MB."));
        const form = new FormData();
        form.set("file", step.file);
        form.set("position", String(position));
        form.set("body", step.body);
        const res = await fetch(`/api/v1/message-templates/scripts/${templateId}/media`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error(t("Falha ao salvar uma mídia do roteiro."));
      }
      await qc.invalidateQueries({ queryKey: ["message-templates"] });
      toast.success(t(template ? "Roteiro atualizado." : "Roteiro criado."));
      onOpenChange(false);
    } catch (error) {
      if (createdTemplateId) {
        await apiClient
          .delete(`/api/v1/message-templates/${createdTemplateId}`)
          .catch(() => undefined);
      }
      showApiError(error);
    } finally {
      setSaving(false);
    }
  }
  async function renameCategory() {
    if (!categoryId || !categoryName.trim()) return;
    try {
      await apiClient.patch(`/api/v1/message-template-categories/${categoryId}`, {
        name: categoryName.trim(),
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["message-template-categories"] }),
        qc.invalidateQueries({ queryKey: ["message-templates"] }),
      ]);
      toast.success(t("Categoria atualizada."));
    } catch (error) {
      showApiError(error);
    }
  }
  async function deleteCategory() {
    if (!categoryId) return;
    try {
      await apiClient.delete(`/api/v1/message-template-categories/${categoryId}`);
      setCategoryId("");
      setCategoryName("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["message-template-categories"] }),
        qc.invalidateQueries({ queryKey: ["message-templates"] }),
      ]);
      toast.success(t("Categoria excluída. As respostas ficaram sem categoria."));
    } catch (error) {
      showApiError(error);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t(template ? "Editar roteiro" : "Novo roteiro")}</DialogTitle>
          <DialogDescription>
            {t(
              "Combine textos, fotos, vídeos, pausas, etiquetas e ações de CRM na ordem desejada.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="script-title">{t("Título")}</Label>
            <Input
              id="script-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
            />
          </div>
          <div>
            <Label htmlFor="script-shortcut">{t("Atalho")}</Label>
            <Input
              id="script-shortcut"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              maxLength={40}
            />
          </div>
          <div>
            <Label>{t("Categoria")}</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-3"
              value={categoryId}
              onChange={(e) => {
                const id = e.target.value;
                setCategoryId(id);
                setCategoryName(categories.find((item) => item.id === id)?.name ?? "");
              }}
            >
              <option value="">{t("Sem categoria")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {canShare && (
            <div>
              <Label htmlFor="new-category">
                {t(categoryId ? "Editar categoria selecionada" : "Nova categoria (opcional)")}
              </Label>
              {categoryId ? (
                <div className="flex gap-1">
                  <Input
                    id="new-category"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={renameCategory}>
                    {t("Renomear")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={deleteCategory}
                    aria-label={t("Excluir categoria")}
                  >
                    <Trash />
                  </Button>
                </div>
              ) : (
                <Input
                  id="new-category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
              )}
            </div>
          )}
        </div>
        {canShare && (
          <div className="flex items-center gap-2">
            <Switch checked={shared} onCheckedChange={setShared} disabled={!!template} />
            <Label>{t("Compartilhar com a equipe")}</Label>
          </div>
        )}
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={step.key} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="w-6 text-sm font-semibold">{index + 1}</span>
                <select
                  className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2"
                  value={step.action_type}
                  disabled={
                    !!step.id && (step.action_type === "image" || step.action_type === "video")
                  }
                  onChange={(e) =>
                    update(step.key, {
                      action_type: e.target.value as MessageTemplateAction,
                      body: "",
                      action_config: {},
                      file: undefined,
                    })
                  }
                >
                  {(
                    [
                      ["text", "Texto"],
                      ["image", "Foto"],
                      ["video", "Vídeo"],
                      ["wait", "Aguardar"],
                      ["add_tag", "Adicionar etiqueta"],
                      ["move_stage", "Alterar etapa do CRM"],
                      ["upsert_crm", "Adicionar/atualizar no CRM"],
                    ] as const
                  ).map(([v, l]) => (
                    <option key={v} value={v}>
                      {t(l)}
                    </option>
                  ))}
                </select>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                >
                  <CaretUp />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => move(index, 1)}
                  disabled={index === steps.length - 1}
                >
                  <CaretDown />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    setSteps((items) =>
                      items.toSpliced(index + 1, 0, {
                        ...step,
                        key: uid(),
                        id: undefined,
                        file: undefined,
                      }),
                    )
                  }
                >
                  <Copy />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSteps((items) => items.filter((x) => x.key !== step.key))}
                  disabled={steps.length === 1}
                >
                  <Trash />
                </Button>
              </div>
              {["text", "image", "video"].includes(step.action_type) && (
                <div className="mt-2 space-y-2">
                  {step.action_type !== "text" && !step.id && (
                    <Input
                      type="file"
                      accept={step.action_type === "image" ? "image/*" : "video/*"}
                      onChange={(e) => update(step.key, { file: e.target.files?.[0] })}
                    />
                  )}{" "}
                  {step.id && step.media_filename && (
                    <p className="text-xs text-muted-foreground">{step.media_filename}</p>
                  )}
                  <Textarea
                    value={step.body}
                    onChange={(e) => update(step.key, { body: e.target.value })}
                    placeholder={
                      step.action_type === "text" ? t("Mensagem") : t("Legenda opcional")
                    }
                  />
                </div>
              )}
              {step.action_type === "wait" && (
                <Input
                  className="mt-2"
                  type="number"
                  min={1}
                  max={3600}
                  value={step.wait_seconds}
                  onChange={(e) => update(step.key, { wait_seconds: Number(e.target.value) })}
                />
              )}{" "}
              {step.action_type === "add_tag" && (
                <Input
                  className="mt-2"
                  value={String(step.action_config.tag ?? "")}
                  onChange={(e) => update(step.key, { action_config: { tag: e.target.value } })}
                  placeholder={t("Nome da etiqueta")}
                />
              )}{" "}
              {(step.action_type === "move_stage" || step.action_type === "upsert_crm") && (
                <CrmFields
                  step={step}
                  pipelines={pipelines.data ?? []}
                  update={(patch) => update(step.key, patch)}
                  t={t}
                />
              )}
            </div>
          ))}
        </div>
        <Button variant="outline" onClick={() => setSteps((items) => [...items, blank()])}>
          <Plus />
          {t("Adicionar ação")}
        </Button>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("Cancelar")}
          </Button>
          <Button
            onClick={save}
            disabled={
              saving ||
              !title.trim() ||
              steps.some((s) => s.action_type === "text" && !s.body.trim())
            }
          >
            {saving ? t("Salvando…") : t("Salvar roteiro")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CrmFields({
  step,
  pipelines,
  update,
  t,
}: {
  step: Draft;
  pipelines: Array<{ id: string; name: string }>;
  update: (patch: Partial<Draft>) => void;
  t: (x: string) => string;
}) {
  const pipelineId = String(step.action_config.pipeline_id ?? "");
  const stageQuery = useQuery({
    queryKey: ["pipeline-stages", pipelineId, "quick-reply-editor"],
    enabled: !!pipelineId,
    queryFn: () =>
      apiClient
        .get<{ data: Array<{ id: string; name: string }> }>(
          `/api/v1/pipelines/${pipelineId}/stages`,
        )
        .then((result) => result.data),
    retry: false,
  });
  const stages = stageQuery.data ?? [];
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <select
        className="h-9 rounded-md border bg-background px-2"
        value={pipelineId}
        onChange={(e) =>
          update({
            action_config: { ...step.action_config, pipeline_id: e.target.value, stage_id: "" },
          })
        }
      >
        <option value="">{t("Selecione o funil")}</option>
        {pipelines.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select
        className="h-9 rounded-md border bg-background px-2"
        value={String(step.action_config.stage_id ?? "")}
        onChange={(e) =>
          update({ action_config: { ...step.action_config, stage_id: e.target.value } })
        }
      >
        <option value="">{t("Selecione a etapa")}</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {step.action_type === "upsert_crm" && (
        <Input
          className="sm:col-span-2"
          value={String(step.action_config.title ?? "")}
          onChange={(e) =>
            update({ action_config: { ...step.action_config, title: e.target.value } })
          }
          placeholder={t("Título do negócio (opcional)")}
        />
      )}
    </div>
  );
}
