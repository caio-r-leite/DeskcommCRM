"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { respostaRapidaCorresponde } from "@/lib/inbox/busca-de-resposta-rapida";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Eye,
  MagnifyingGlass,
  PaperPlaneTilt,
  CheckCircle,
  Warning,
  CircleNotch,
  ChatCircle,
  ImageIcon,
  VideoCamera,
  Clock,
  Tag,
  Kanban,
} from "@/lib/ui/icons";
import {
  useMessageTemplateCategories,
  useMessageTemplates,
  type MessageTemplate,
  type MessageTemplateStep,
} from "@/hooks/inbox/useMessageTemplates";
import { useT } from "@/hooks/i18n/useT";
import { interpolateTemplate, type TemplateContact } from "@/lib/inbox/template-vars";
import { ApiError } from "@/lib/api/types";

interface Props {
  conversationId: string;
  contactId: string;
  contactName?: string | null;
  contactDisplayName?: string | null;
  status: string;
  tags: string[];
  onClose: () => void;
}

type SnapshotStep = MessageTemplateStep & { enabled: boolean; body: string };
type ExecutionStep = {
  id: string;
  position: number;
  action_type: MessageTemplateStep["action_type"];
  payload: Record<string, unknown>;
  status: string;
  idempotency_key: string;
  error_message?: string | null;
};

/** A API de mensagem aceita legenda ausente; string vazia falha na validação. */
export function optionalMediaCaption(value: unknown): string | undefined {
  return String(value ?? "").trim() || undefined;
}

function stepLabel(
  step: Pick<
    MessageTemplateStep,
    "action_type" | "media_filename" | "wait_seconds" | "action_config"
  >,
  t: (text: string) => string,
): string {
  if (step.action_type === "text") return t("Mensagem de texto");
  if (step.action_type === "image") return step.media_filename || t("Foto");
  if (step.action_type === "video") return step.media_filename || t("Vídeo");
  if (step.action_type === "wait") return `${t("Aguardar")} ${step.wait_seconds}s`;
  if (step.action_type === "add_tag")
    return `${t("Adicionar etiqueta")}: ${String(step.action_config.tag ?? "")}`;
  if (step.action_type === "move_stage") return t("Alterar etapa do CRM");
  return t("Adicionar ou atualizar no CRM");
}

function StepIcon({ type }: { type: MessageTemplateStep["action_type"] }) {
  const Icon =
    type === "image"
      ? ImageIcon
      : type === "video"
        ? VideoCamera
        : type === "wait"
          ? Clock
          : type === "add_tag"
            ? Tag
            : type === "move_stage" || type === "upsert_crm"
              ? Kanban
              : ChatCircle;
  return <Icon className="size-4 shrink-0" aria-hidden />;
}

export function QuickRepliesPanel({
  conversationId,
  contactId,
  contactName,
  contactDisplayName,
  status,
  tags,
  onClose,
}: Props) {
  const t = useT();
  const qc = useQueryClient();
  const templates = useMessageTemplates();
  const categoryQuery = useMessageTemplateCategories();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<
    "all" | "text" | "media" | "script" | "uncategorized" | "most_used"
  >("all");
  const [category, setCategory] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<MessageTemplate | null>(null);
  const [preview, setPreview] = React.useState<SnapshotStep[]>([]);
  const [runningTemplateId, setRunningTemplateId] = React.useState<string | null>(null);
  const running = runningTemplateId !== null;
  const [execution, setExecution] = React.useState<{ id: string; steps: ExecutionStep[] } | null>(
    null,
  );
  const conversationRef = React.useRef(conversationId);
  const statusRef = React.useRef(status);
  const activeRef = React.useRef(true);
  React.useEffect(() => {
    conversationRef.current = conversationId;
  }, [conversationId]);
  React.useEffect(() => {
    statusRef.current = status;
  }, [status]);
  React.useEffect(
    () => () => {
      activeRef.current = false;
    },
    [],
  );

  const categories = categoryQuery.data ?? [];
  const visible = React.useMemo(() => {
    let result = (templates.data ?? []).filter((tpl) => respostaRapidaCorresponde(tpl, query));
    if (category) result = result.filter((tpl) => tpl.category_id === category);
    if (filter === "text")
      result = result.filter((tpl) => tpl.steps.every((step) => step.action_type === "text"));
    if (filter === "media")
      result = result.filter((tpl) =>
        tpl.steps.some((step) => step.action_type === "image" || step.action_type === "video"),
      );
    if (filter === "script") result = result.filter((tpl) => tpl.steps.length > 1);
    if (filter === "uncategorized") result = result.filter((tpl) => !tpl.category_id);
    if (filter === "most_used") result = [...result].sort((a, b) => b.usage_count - a.usage_count);
    return result;
  }, [templates.data, query, filter, category]);

  function previewFor(template: MessageTemplate): SnapshotStep[] {
    const contato: TemplateContact = {
      name: contactName ?? null,
      displayName: contactDisplayName ?? null,
    };
    return template.steps.map((step) => ({
      ...step,
      enabled: true,
      body: interpolateTemplate(step.body, contato),
    }));
  }

  function openPreview(template: MessageTemplate) {
    setSelected(template);
    setPreview(previewFor(template));
    setExecution(null);
  }

  async function report(executionId: string, stepId: string, body: Record<string, unknown>) {
    await apiClient.patch(
      `/api/v1/message-template-executions/${executionId}/steps/${stepId}`,
      body,
    );
  }

  async function executeStep(executionId: string, step: ExecutionStep): Promise<void> {
    if (!activeRef.current || conversationRef.current !== conversationId)
      throw new Error(t("A conversa mudou. O roteiro foi interrompido."));
    if (statusRef.current === "closed" || statusRef.current === "archived")
      throw new Error(t("A conversa foi encerrada."));
    await report(executionId, step.id, { status: "running" });
    const payload = step.payload;
    if (step.action_type === "text") {
      const sent = await apiClient.post<{
        data: { status: string; error_message?: string | null };
      }>(
        "/api/v1/messages",
        { conversation_id: conversationId, type: "text", body: String(payload.body ?? "") },
        { idempotencyKey: step.idempotency_key },
      );
      if (sent.data.status === "failed") {
        throw new Error(sent.data.error_message || t("A mensagem não foi entregue ao canal."));
      }
    } else if (step.action_type === "image" || step.action_type === "video") {
      const download = await fetch(
        `/api/v1/message-template-executions/${executionId}/steps/${step.id}/media`,
      );
      if (!download.ok) throw new Error(t("Não foi possível carregar a mídia."));
      const blob = await download.blob();
      const form = new FormData();
      form.set("file", blob, String(payload.media_filename ?? "arquivo"));
      const upload = await fetch(`/api/v1/conversations/${conversationId}/media`, {
        method: "POST",
        body: form,
      });
      const uploaded = (await upload.json()) as {
        data?: { storage_path: string; media_mime: string; media_size_bytes: number; kind: string };
      };
      if (!upload.ok || !uploaded.data) throw new Error(t("Não foi possível preparar a mídia."));
      const sent = await apiClient.post<{
        data: { status: string; error_message?: string | null };
      }>(
        "/api/v1/messages",
        {
          conversation_id: conversationId,
          body: optionalMediaCaption(payload.body),
          type: uploaded.data.kind,
          media_storage_path: uploaded.data.storage_path,
          media_mime: uploaded.data.media_mime,
          media_size_bytes: uploaded.data.media_size_bytes,
        },
        { idempotencyKey: step.idempotency_key },
      );
      if (sent.data.status === "failed") {
        throw new Error(sent.data.error_message || t("A mídia não foi entregue ao canal."));
      }
    } else if (step.action_type === "wait") {
      await new Promise((resolve) =>
        window.setTimeout(resolve, Math.min(Number(payload.wait_seconds ?? 0), 3600) * 1000),
      );
      if (!activeRef.current || conversationRef.current !== conversationId) {
        throw new Error(t("A conversa mudou. O roteiro foi interrompido."));
      }
    } else if (step.action_type === "add_tag") {
      const tag = String(
        (payload.action_config as Record<string, unknown> | undefined)?.tag ?? "",
      ).trim();
      const latest = await apiClient.get<{ data: { tags: string[] } }>(
        `/api/v1/conversations/${conversationId}`,
      );
      const currentTags = latest.data.tags ?? tags;
      if (tag && !currentTags.includes(tag))
        await apiClient.patch(`/api/v1/conversations/${conversationId}`, {
          tags: [...currentTags, tag],
        });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["conversations"] }),
        qc.invalidateQueries({ queryKey: ["conversation", conversationId] }),
        qc.invalidateQueries({ queryKey: ["conversation-tag-vocabulary"] }),
      ]);
    } else {
      const summary = await apiClient.get<{
        data: { leads: Array<{ id: string; pipeline_id: string; status: string }> };
      }>(`/api/v1/contacts/${contactId}/crm-summary`);
      const config = (payload.action_config ?? {}) as Record<string, unknown>;
      const lead = summary.data.leads.find(
        (item) =>
          item.status === "open" &&
          (!config.pipeline_id || item.pipeline_id === config.pipeline_id),
      );
      if (step.action_type === "move_stage") {
        if (!lead) throw new Error(t("Não há negócio aberto para mover."));
        await apiClient.post("/api/v1/leads/bulk", {
          action: "move",
          lead_ids: [lead.id],
          params: { stage_id: config.stage_id },
        });
      } else if (!lead) {
        await apiClient.post(
          "/api/v1/leads",
          {
            pipeline_id: config.pipeline_id,
            stage_id: config.stage_id,
            contact_id: contactId,
            title: String(config.title || contactName || t("Novo negócio")),
            source: "quick_reply",
          },
          { idempotencyKey: step.idempotency_key },
        );
      }
    }
    await report(executionId, step.id, { status: "succeeded" });
  }

  async function run(
    template: MessageTemplate | null = selected,
    prepared: SnapshotStep[] = preview,
    closePreviewOnSuccess = true,
  ) {
    if (!template || running) return;
    if (status === "closed" || status === "archived") {
      toast.error(t("Reabra a conversa antes de enviar."));
      return;
    }
    const enabled = prepared.filter((step) => step.enabled);
    if (!enabled.length) {
      toast.error(t("Mantenha ao menos um passo."));
      return;
    }
    setRunningTemplateId(template.id);
    const previewExecution = selected?.id === template.id ? execution : null;
    let activeExecution: { id: string; steps: ExecutionStep[] } | null = previewExecution
      ? { ...previewExecution, steps: previewExecution.steps.map((step) => ({ ...step })) }
      : null;
    try {
      if (!activeExecution) {
        const created = await apiClient.post<{ data: { id: string; steps: ExecutionStep[] } }>(
          "/api/v1/message-template-executions",
          {
            template_id: template.id,
            conversation_id: conversationId,
            steps: enabled.map((step) => ({ id: step.id, body: step.body })),
          },
        );
        activeExecution = created.data;
        if (selected?.id === template.id) setExecution(activeExecution);
      } else {
        const fresh = await apiClient.get<{ data: { id: string; steps: ExecutionStep[] } }>(
          `/api/v1/message-template-executions/${activeExecution.id}`,
        );
        activeExecution = fresh.data;
        if (selected?.id === template.id) setExecution(activeExecution);
      }
      for (const step of activeExecution.steps.filter(
        (item) => item.status !== "succeeded" && item.status !== "skipped",
      )) {
        try {
          await executeStep(activeExecution.id, step);
          activeExecution = {
            ...activeExecution,
            steps: activeExecution.steps.map((item) =>
              item.id === step.id ? { ...item, status: "succeeded", error_message: null } : item,
            ),
          };
          if (selected?.id === template.id) setExecution(activeExecution);
        } catch (error) {
          const message =
            error instanceof ApiError
              ? error.message
              : error instanceof Error
                ? error.message
                : t("Falha no passo.");
          await report(activeExecution.id, step.id, {
            status: "failed",
            error_message: message,
          }).catch(() => undefined);
          activeExecution = {
            ...activeExecution,
            steps: activeExecution.steps.map((item) =>
              item.id === step.id ? { ...item, status: "failed", error_message: message } : item,
            ),
          };
          if (selected?.id === template.id) setExecution(activeExecution);
          throw error;
        }
      }
      await apiClient.patch(`/api/v1/message-template-executions/${activeExecution.id}`, {
        status: "succeeded",
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["message-templates"] }),
        qc.invalidateQueries({ queryKey: ["messages", conversationId] }),
        qc.invalidateQueries({ queryKey: ["conversations"] }),
        qc.invalidateQueries({ queryKey: ["conversation", conversationId] }),
      ]);
      toast.success(t("Roteiro concluído."));
      if (closePreviewOnSuccess) setSelected(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("O roteiro foi interrompido.");
      toast.error(message);
      if (activeExecution)
        await apiClient
          .patch(`/api/v1/message-template-executions/${activeExecution.id}`, {
            status: "failed",
            error_message: message,
          })
          .catch(() => undefined);
    } finally {
      setRunningTemplateId(null);
    }
  }

  function sendNow(template: MessageTemplate) {
    if (running) return;
    setExecution(null);
    void run(template, previewFor(template), false);
  }

  return (
    <>
      <aside
        className="flex h-full min-h-0 w-[26rem] max-w-[100vw] flex-col border-l bg-background"
        data-testid="quick-replies-panel"
      >
        <div className="flex items-center gap-2 border-b px-3 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t("Respostas rápidas")}</h2>
            <p className="text-xs text-muted-foreground">{t("Revise antes de enviar")}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("Fechar")}
          </Button>
        </div>
        <div className="space-y-2 border-b p-3">
          <div className="relative">
            <MagnifyingGlass className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Pesquisar resposta rápida")}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["all", "Tudo"],
                ["text", "Texto"],
                ["media", "Mídia"],
                ["script", "Scripts"],
                ["uncategorized", "Sem categoria"],
                ["most_used", "Mais usadas"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => setFilter(value)}
              >
                {t(label)}
              </Button>
            ))}
          </div>
          {categories.length > 0 && (
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={category ?? ""}
              onChange={(e) => setCategory(e.target.value || null)}
            >
              <option value="">{t("Todas as categorias")}</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {visible.map((template) => {
            const sending = runningTemplateId === template.id;
            return (
              <div
                key={template.id}
                data-testid={`quick-reply-card-${template.id}`}
                data-sending={sending ? "true" : "false"}
                role="button"
                tabIndex={running ? -1 : 0}
                aria-disabled={running}
                aria-label={`${t("Enviar agora")}: ${template.title}`}
                onClick={() => sendNow(template)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    sendNow(template);
                  }
                }}
                className={`mb-2 cursor-pointer rounded-lg border p-2.5 transition-all duration-200 hover:border-primary/60 hover:bg-primary/5 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                  sending ? "scale-[0.99] border-primary bg-primary/10 opacity-75" : ""
                } ${running && !sending ? "pointer-events-none opacity-50" : ""}`}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-sm font-medium">{template.title}</span>
                      {template.category && (
                        <Badge variant="outline">{template.category.name}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {template.steps.length} {t("envio(s)/ação(ões)")} · {template.usage_count}{" "}
                      {t("uso(s)")}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    title={t("Revisar e enviar")}
                    aria-label={t("Revisar e enviar")}
                    disabled={running}
                    onClick={(event) => {
                      event.stopPropagation();
                      openPreview(template);
                    }}
                  >
                    <Eye />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title={t("Enviar agora")}
                    aria-label={`${t("Enviar agora")}: ${template.title}`}
                    disabled={running}
                    onClick={(event) => {
                      event.stopPropagation();
                      sendNow(template);
                    }}
                  >
                    {sending ? <CircleNotch className="animate-spin" /> : <PaperPlaneTilt />}
                  </Button>
                </div>
                {sending && (
                  <div className="mt-2 flex items-center gap-2 text-xs font-medium text-primary">
                    <CircleNotch className="size-3.5 animate-spin" />
                    {t("Enviando e executando ações…")}
                  </div>
                )}
              </div>
            );
          })}
          {!visible.length && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              {t("Nenhuma resposta encontrada.")}
            </p>
          )}
        </div>
      </aside>
      <Dialog open={!!selected} onOpenChange={(open) => !open && !running && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>
              {t(
                "Esta cópia vale somente para a conversa atual. A resposta cadastrada não será alterada.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {preview.map((step, index) => {
              const progress = execution?.steps[index];
              return (
                <div key={step.id} className="rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={step.enabled}
                      disabled={running || !!execution}
                      onChange={(e) =>
                        setPreview((items) =>
                          items.map((item) =>
                            item.id === step.id ? { ...item, enabled: e.target.checked } : item,
                          ),
                        )
                      }
                    />
                    <StepIcon type={step.action_type} />
                    <span className="min-w-0 flex-1 text-sm font-medium">
                      {index + 1}. {stepLabel(step, t)}
                    </span>
                    {progress?.status === "succeeded" ? (
                      <CheckCircle className="size-4 text-success" />
                    ) : progress?.status === "failed" ? (
                      <Warning className="size-4 text-destructive" />
                    ) : running && progress?.status === "running" ? (
                      <CircleNotch className="size-4 animate-spin" />
                    ) : null}
                  </div>
                  {step.enabled && ["text", "image", "video"].includes(step.action_type) && (
                    <div className="mt-2 space-y-2">
                      {(step.action_type === "image" || step.action_type === "video") && (
                        <div className="overflow-hidden rounded-md border bg-muted/30">
                          {step.action_type === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element -- mídia autenticada e dinâmica
                            <img
                              src={`/api/v1/message-templates/scripts/${step.template_id}/media?step_id=${step.id}`}
                              alt={step.media_filename || t("Prévia da foto")}
                              className="max-h-56 w-full object-contain"
                            />
                          ) : (
                            <video
                              src={`/api/v1/message-templates/scripts/${step.template_id}/media?step_id=${step.id}`}
                              controls
                              preload="metadata"
                              className="max-h-56 w-full"
                            />
                          )}
                        </div>
                      )}
                      <Textarea
                        value={step.body}
                        disabled={running || !!execution}
                        placeholder={
                          step.action_type === "text" ? t("Mensagem") : t("Legenda opcional")
                        }
                        onChange={(e) =>
                          setPreview((items) =>
                            items.map((item) =>
                              item.id === step.id ? { ...item, body: e.target.value } : item,
                            ),
                          )
                        }
                      />
                    </div>
                  )}{" "}
                  {progress?.error_message && (
                    <p className="mt-1 text-xs text-destructive">{progress.error_message}</p>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={running} onClick={() => setSelected(null)}>
              {t("Cancelar")}
            </Button>
            <Button
              disabled={running || !preview.some((step) => step.enabled)}
              onClick={() => void run()}
            >
              {running ? (
                <>
                  <CircleNotch className="animate-spin" />
                  {t("Executando…")}
                </>
              ) : execution ? (
                <>{t("Tentar novamente")}</>
              ) : (
                <>
                  <PaperPlaneTilt />
                  {t("Confirmar e executar")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
