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
import {
  CaretDown,
  CaretUp,
  Clock,
  Copy,
  ImageIcon,
  Kanban,
  Plus,
  Tag,
  Trash,
  UploadSimple,
  VideoCamera,
  ChatCircle,
} from "@/lib/ui/icons";
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

const ACTIONS: Array<{
  type: MessageTemplateAction;
  label: string;
  help: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { type: "text", label: "Texto", help: "Envia uma mensagem", icon: ChatCircle },
  { type: "image", label: "Foto", help: "Foto com legenda", icon: ImageIcon },
  { type: "video", label: "Vídeo", help: "Vídeo com legenda", icon: VideoCamera },
  { type: "wait", label: "Aguardar", help: "Pausa entre envios", icon: Clock },
  { type: "add_tag", label: "Etiqueta", help: "Organiza a conversa", icon: Tag },
  { type: "move_stage", label: "Mover no CRM", help: "Altera a etapa", icon: Kanban },
  { type: "upsert_crm", label: "Criar no CRM", help: "Cria ou atualiza", icon: Plus },
];

function draftProblem(step: Draft, t: (value: string) => string): string | null {
  if (step.action_type === "text" && !step.body.trim()) return t("Escreva a mensagem.");
  if ((step.action_type === "image" || step.action_type === "video") && !step.id && !step.file)
    return t("Selecione o arquivo que será enviado.");
  if (step.action_type === "add_tag" && !String(step.action_config.tag ?? "").trim())
    return t("Informe o nome da etiqueta.");
  if (step.action_type === "wait" && (step.wait_seconds < 1 || step.wait_seconds > 3600))
    return t("Use uma espera entre 1 e 3600 segundos.");
  if (
    (step.action_type === "move_stage" || step.action_type === "upsert_crm") &&
    (!step.action_config.pipeline_id || !step.action_config.stage_id)
  )
    return t("Selecione o funil e a etapa do CRM.");
  return null;
}

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
  const problems = steps.map((step) => draftProblem(step, t));
  const canSave = !!title.trim() && problems.every((problem) => problem === null);
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
    if (!canSave || !steps.length) return;
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
      <DialogContent className="max-h-[94vh] overflow-y-auto p-0 sm:max-w-4xl">
        <div className="sticky top-0 z-10 border-b bg-background/95 px-6 py-5 backdrop-blur">
          <DialogHeader>
            <DialogTitle>{t(template ? "Editar roteiro" : "Novo roteiro")}</DialogTitle>
            <DialogDescription>
              {t(
                "Combine textos, fotos, vídeos, pausas, etiquetas e ações de CRM na ordem desejada.",
              )}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-6 px-6 py-5">
          <section className="rounded-xl border bg-muted/20 p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold">{t("Identificação e organização")}</h3>
              <p className="text-xs text-muted-foreground">
                {t("Dê um nome fácil de localizar e, se quiser, agrupe por categoria.")}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="script-title">{t("Título")}</Label>
                <Input
                  id="script-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder={t("Ex.: Apresentação inicial")}
                />
              </div>
              <div>
                <Label htmlFor="script-shortcut">{t("Atalho")}</Label>
                <Input
                  id="script-shortcut"
                  value={shortcut}
                  onChange={(e) => setShortcut(e.target.value)}
                  maxLength={40}
                  placeholder={t("Ex.: /apresentacao")}
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
              <div className="mt-4 flex items-center gap-2 rounded-lg border bg-background p-3">
                <Switch checked={shared} onCheckedChange={setShared} disabled={!!template} />
                <div>
                  <Label>{t("Compartilhar com a equipe")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("Todos os atendentes poderão usar esta resposta rápida.")}
                  </p>
                </div>
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{t("Ações do roteiro")}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("Clique em uma ação para adicioná-la ao final. Você pode reordenar depois.")}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {steps.length} {t("ação(ões)")}
              </span>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.type}
                    type="button"
                    className="flex min-h-20 flex-col items-center justify-center rounded-lg border bg-background p-2 text-center transition-colors hover:border-primary hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    onClick={() => setSteps((items) => [...items, blank(action.type)])}
                  >
                    <Icon className="mb-1 size-5 text-primary" />
                    <span className="text-xs font-semibold">{t(action.label)}</span>
                    <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                      {t(action.help)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="space-y-3">
              {steps.map((step, index) => {
                const problem = problems[index];
                return (
                  <div
                    key={step.key}
                    className={`rounded-xl border bg-background p-4 shadow-sm transition-colors ${
                      problem ? "border-amber-300" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {index + 1}
                      </span>
                      <select
                        className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2"
                        value={step.action_type}
                        disabled={
                          !!step.id &&
                          (step.action_type === "image" || step.action_type === "video")
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
                        title={t("Mover para cima")}
                        aria-label={t("Mover para cima")}
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                      >
                        <CaretUp />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title={t("Mover para baixo")}
                        aria-label={t("Mover para baixo")}
                        onClick={() => move(index, 1)}
                        disabled={index === steps.length - 1}
                      >
                        <CaretDown />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title={t("Duplicar ação")}
                        aria-label={t("Duplicar ação")}
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
                        title={t("Remover ação")}
                        aria-label={t("Remover ação")}
                        onClick={() => setSteps((items) => items.filter((x) => x.key !== step.key))}
                        disabled={steps.length === 1}
                      >
                        <Trash />
                      </Button>
                    </div>
                    {["text", "image", "video"].includes(step.action_type) && (
                      <div className="mt-2 space-y-2">
                        {step.action_type !== "text" && !step.id && (
                          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 py-5 text-center transition-colors hover:border-primary hover:bg-primary/5">
                            <UploadSimple className="mb-1 size-6 text-primary" />
                            <span className="text-sm font-medium">
                              {t(step.file ? "Trocar arquivo" : "Selecionar arquivo")}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {step.file?.name ?? t("Foto ou vídeo de até 50 MB")}
                            </span>
                            <Input
                              className="sr-only"
                              type="file"
                              accept={step.action_type === "image" ? "image/*" : "video/*"}
                              onChange={(e) => update(step.key, { file: e.target.files?.[0] })}
                            />
                          </label>
                        )}{" "}
                        {step.id && step.media_filename && (
                          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                            {t("Arquivo salvo")}: {step.media_filename}
                          </p>
                        )}
                        {(step.action_type === "image" || step.action_type === "video") &&
                          (step.file || step.id) && (
                            <MediaDraftPreview
                              file={step.file}
                              type={step.action_type}
                              templateId={template?.id}
                              stepId={step.id}
                              filename={step.file?.name ?? step.media_filename ?? undefined}
                            />
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
                      <div className="mt-2">
                        <Label>{t("Tempo de espera em segundos")}</Label>
                        <Input
                          type="number"
                          min={1}
                          max={3600}
                          value={step.wait_seconds}
                          onChange={(e) =>
                            update(step.key, { wait_seconds: Number(e.target.value) })
                          }
                        />
                      </div>
                    )}{" "}
                    {step.action_type === "add_tag" && (
                      <Input
                        className="mt-2"
                        value={String(step.action_config.tag ?? "")}
                        onChange={(e) =>
                          update(step.key, { action_config: { tag: e.target.value } })
                        }
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
                    {problem && (
                      <p className="mt-2 text-xs font-medium text-amber-700">{problem}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <Button
              className="mt-3 w-full border-dashed"
              variant="outline"
              onClick={() => setSteps((items) => [...items, blank()])}
            >
              <Plus />
              {t("Adicionar outra ação de texto")}
            </Button>
          </section>
        </div>
        <DialogFooter className="sticky bottom-0 z-10 border-t bg-background/95 px-6 py-4 backdrop-blur">
          <div className="mr-auto text-xs text-muted-foreground">
            {!title.trim()
              ? t("Informe um título para salvar.")
              : problems.some(Boolean)
                ? t("Revise as ações destacadas antes de salvar.")
                : t("Tudo pronto para salvar.")}
          </div>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("Cancelar")}
          </Button>
          <Button onClick={save} disabled={saving || !canSave}>
            {saving ? t("Salvando…") : t("Salvar roteiro")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MediaDraftPreview({
  file,
  type,
  templateId,
  stepId,
  filename,
}: {
  file?: File;
  type: "image" | "video";
  templateId?: string;
  stepId?: string;
  filename?: string;
}) {
  const localUrl = React.useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  React.useEffect(() => {
    return () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [localUrl]);
  const src =
    localUrl ??
    (templateId && stepId
      ? `/api/v1/message-templates/scripts/${templateId}/media?step_id=${stepId}`
      : null);
  if (!src) return null;
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/20">
      {type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- prévia autenticada ou object URL local
        <img
          src={src}
          alt={filename ?? "Prévia da foto"}
          className="max-h-64 w-full object-contain"
        />
      ) : (
        <video src={src} controls preload="metadata" className="max-h-64 w-full" />
      )}
    </div>
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
