import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { createLeadHandler, moveLeadHandler } from "@/app/api/v1/leads/_handler";
import { currentExecutionAgentOperation, currentExecutionBoundary } from "@/lib/atendimento/fronteira-server";
import { interpolateTemplate } from "@/lib/inbox/template-vars";
import type { Actor, HandlerCtx } from "@/lib/api/handlers/types";
import { canAgentUseTemplate, totalWaitSeconds, type QuickReplyAccessMode } from "./agent-policy";

export const MAX_AI_QUICK_REPLY_WAIT_SECONDS = 30;

type Step = {
  id: string;
  position: number;
  action_type: string;
  body: string;
  wait_seconds: number;
  media_storage_path: string | null;
  media_mime: string | null;
  media_size_bytes: number | null;
  media_filename: string | null;
  action_config: Record<string, unknown> | null;
};

export interface AgentQuickReplyContext {
  supabase: SupabaseClient;
  organizationId: string;
  agentId: string;
  agentVersionId: string;
  sourceJobId: string;
  conversationId: string;
  contactId: string;
  requestId: string;
}

/**
 * Executor determinístico de roteiros autorizados. A IA escolhe somente o
 * template; nenhum texto, arquivo, tag ou destino de CRM vem dos argumentos do
 * modelo. A execução usa o snapshot e pode ser retomada pelo mesmo job sem
 * repetir passos já concluídos.
 */
export async function executeAgentQuickReply(
  ctx: AgentQuickReplyContext,
  templateId: string,
): Promise<Record<string, unknown>> {
  const { supabase } = ctx;
  const { data: version } = await supabase
    .from("ai_agent_versions")
    .select("id, status, quick_reply_access_mode, quick_reply_template_ids")
    .eq("id", ctx.agentVersionId)
    .eq("agent_id", ctx.agentId)
    .eq("organization_id", ctx.organizationId)
    .eq("status", "published")
    .maybeSingle();
  if (!version || version.quick_reply_access_mode === "none") return denied("acesso_desativado");
  if (!canAgentUseTemplate(version.quick_reply_access_mode as QuickReplyAccessMode, version.quick_reply_template_ids, templateId))
    return denied("resposta_nao_autorizada");

  const [{ data: template }, { data: conversation }, { data: contact }] = await Promise.all([
    supabase
      .from("message_templates")
      .select("id, title, owner_user_id")
      .eq("id", templateId)
      .eq("organization_id", ctx.organizationId)
      .is("owner_user_id", null)
      .maybeSingle(),
    supabase
      .from("conversations")
      .select("id, contact_id, status, tags")
      .eq("id", ctx.conversationId)
      .eq("contact_id", ctx.contactId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle(),
    supabase
      .from("contacts")
      .select("id, name, display_name")
      .eq("id", ctx.contactId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle(),
  ]);
  if (!template) return denied("resposta_nao_encontrada_ou_pessoal");
  if (!conversation || ["closed", "archived"].includes(conversation.status))
    return denied("conversa_indisponivel");

  const { data: sourceSteps, error: stepsError } = await supabase
    .from("message_template_steps")
    .select("id, position, action_type, body, wait_seconds, media_storage_path, media_mime, media_size_bytes, media_filename, action_config")
    .eq("template_id", template.id)
    .eq("organization_id", ctx.organizationId)
    .order("position");
  if (stepsError || !sourceSteps?.length) throw new Error("quick_reply_steps_unavailable");
  const steps = sourceSteps as unknown as Step[];
  const waitTotal = totalWaitSeconds(steps);
  if (waitTotal > MAX_AI_QUICK_REPLY_WAIT_SECONDS) return denied("espera_total_acima_de_30_segundos");

  let execution = await existingExecution(ctx, template.id);
  if (!execution) {
    const now = new Date().toISOString();
    const created = await supabase
      .from("message_template_executions")
      .insert({
        organization_id: ctx.organizationId,
        template_id: template.id,
        conversation_id: ctx.conversationId,
        contact_id: ctx.contactId,
        started_by_user_id: null,
        started_by_agent_version_id: ctx.agentVersionId,
        source_job_id: ctx.sourceJobId,
        template_title: template.title,
        status: "running",
        total_steps: steps.length,
        confirmed_at: now,
        started_at: now,
      })
      .select("id, status")
      .single();
    if (created.error || !created.data) {
      execution = await existingExecution(ctx, template.id);
      if (!execution) throw new Error("quick_reply_execution_create_failed");
    } else {
      execution = created.data;
      const snapshot = steps.map((step) => ({
        organization_id: ctx.organizationId,
        execution_id: execution!.id,
        source_step_id: step.id,
        position: step.position,
        action_type: step.action_type,
        payload: {
          body: interpolateTemplate(step.body, {
            name: contact?.name ?? null,
            displayName: contact?.display_name ?? null,
          }),
          wait_seconds: step.wait_seconds,
          media_storage_path: step.media_storage_path,
          media_mime: step.media_mime,
          media_size_bytes: step.media_size_bytes,
          media_filename: step.media_filename,
          action_config: step.action_config ?? {},
        },
      }));
      const inserted = await supabase.from("message_template_execution_steps").insert(snapshot);
      if (inserted.error) throw new Error("quick_reply_snapshot_create_failed");
    }
  }

  if (execution.status === "succeeded") {
    return { permitido: true, execution_id: execution.id, status: "succeeded", retomada: true };
  }

  const { data: executionSteps } = await supabase
    .from("message_template_execution_steps")
    .select("id, position, action_type, payload, status, idempotency_key")
    .eq("execution_id", execution.id)
    .eq("organization_id", ctx.organizationId)
    .order("position");
  if (!executionSteps?.length) throw new Error("quick_reply_snapshot_unavailable");

  for (const step of executionSteps) {
    if (["succeeded", "skipped"].includes(step.status)) continue;
    const startedAt = new Date().toISOString();
    await supabase.from("message_template_execution_steps").update({ status: "running", started_at: startedAt, error_message: null }).eq("id", step.id);
    try {
      const result = await executeStep(ctx, step as never);
      const finishedAt = new Date().toISOString();
      await supabase.from("message_template_execution_steps").update({ status: "succeeded", result, finished_at: finishedAt }).eq("id", step.id);
      await supabase.from("message_template_executions").update({ current_position: step.position + 1, updated_at: finishedAt }).eq("id", execution.id);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : "quick_reply_step_failed";
      const finishedAt = new Date().toISOString();
      await supabase.from("message_template_execution_steps").update({ status: "failed", error_message: message, finished_at: finishedAt }).eq("id", step.id);
      await supabase.from("message_template_executions").update({ status: "failed", current_position: step.position, error_message: message, updated_at: finishedAt }).eq("id", execution.id);
      return { permitido: true, execution_id: execution.id, status: "failed", passo: step.position, erro: message };
    }
  }

  const finishedAt = new Date().toISOString();
  await supabase.from("message_template_executions").update({ status: "succeeded", current_position: executionSteps.length, finished_at: finishedAt, error_message: null, updated_at: finishedAt }).eq("id", execution.id);
  const { data: usage } = await supabase
    .from("message_templates")
    .select("usage_count")
    .eq("id", template.id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  await supabase
    .from("message_templates")
    .update({ usage_count: (usage?.usage_count ?? 0) + 1, last_used_at: finishedAt })
    .eq("id", template.id)
    .eq("organization_id", ctx.organizationId);
  return { permitido: true, execution_id: execution.id, status: "succeeded", etapas: executionSteps.length };
}

function denied(reason: string) {
  return { permitido: false, motivo: reason };
}

async function existingExecution(ctx: AgentQuickReplyContext, templateId: string) {
  const { data } = await ctx.supabase
    .from("message_template_executions")
    .select("id, status")
    .eq("organization_id", ctx.organizationId)
    .eq("source_job_id", ctx.sourceJobId)
    .eq("template_id", templateId)
    .eq("started_by_agent_version_id", ctx.agentVersionId)
    .maybeSingle();
  return data;
}

async function executeStep(
  ctx: AgentQuickReplyContext,
  step: { id: string; position: number; action_type: string; payload: Record<string, unknown>; idempotency_key: string },
): Promise<Record<string, unknown>> {
  const payload = step.payload;
  const actor: Actor = { type: "ai_agent", id: ctx.agentId, agent_id: ctx.agentId, role: "manager" };
  const handlerCtx: HandlerCtx = {
    organization_id: ctx.organizationId,
    actor,
    requestId: step.idempotency_key,
    serviceBoundary: currentExecutionBoundary(),
    agentOperation: currentExecutionAgentOperation() ?? undefined,
  };

  if (["text", "image", "video"].includes(step.action_type)) {
    const { data: alreadySent } = await ctx.supabase
      .from("messages")
      .select("id, status")
      .eq("id", step.idempotency_key)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (alreadySent) return { message_id: alreadySent.id, status: alreadySent.status, retomada: true };

    let media: { path: string; mime: string; size: number } | null = null;
    if (step.action_type !== "text") media = await copyTemplateMedia(ctx, step);
    const body = String(payload.body ?? "").trim();
    const message = await sendMessageHandler(
      ctx.supabase,
      { ...handlerCtx, internalMessageId: step.idempotency_key },
      {
        conversation_id: ctx.conversationId,
        type: step.action_type as "text" | "image" | "video",
        ...(body ? { body } : {}),
        ...(media ? { media_storage_path: media.path, media_mime: media.mime, media_size_bytes: media.size } : {}),
      },
    );
    if (message.status === "failed") throw new Error(message.error_message ?? "message_delivery_failed");
    return { message_id: message.id, status: message.status };
  }

  if (step.action_type === "wait") {
    const seconds = Math.max(0, Math.min(Number(payload.wait_seconds ?? 0), MAX_AI_QUICK_REPLY_WAIT_SECONDS));
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    return { waited_seconds: seconds };
  }

  if (step.action_type === "add_tag") {
    const tag = String((payload.action_config as Record<string, unknown> | undefined)?.tag ?? "").trim();
    if (!tag) throw new Error("tag_missing");
    const { data: conversation } = await ctx.supabase.from("conversations").select("tags").eq("id", ctx.conversationId).eq("organization_id", ctx.organizationId).single();
    const tags = (conversation?.tags ?? []) as string[];
    if (!tags.includes(tag)) {
      const { error } = await ctx.supabase.from("conversations").update({ tags: [...tags, tag] }).eq("id", ctx.conversationId).eq("organization_id", ctx.organizationId);
      if (error) throw error;
    }
    return { tag };
  }

  const config = (payload.action_config ?? {}) as Record<string, unknown>;
  const { data: leads } = await ctx.supabase
    .from("crm_leads")
    .select("id, pipeline_id, status")
    .eq("organization_id", ctx.organizationId)
    .eq("contact_id", ctx.contactId)
    .eq("status", "open");
  const lead = (leads ?? []).find((item) => !config.pipeline_id || item.pipeline_id === config.pipeline_id);
  if (step.action_type === "move_stage") {
    if (!lead) throw new Error("open_lead_not_found");
    await moveLeadHandler(ctx.supabase, handlerCtx, lead.id, { to_stage_id: String(config.stage_id ?? "") });
    return { lead_id: lead.id, stage_id: config.stage_id };
  }
  if (step.action_type === "upsert_crm") {
    if (lead) return { lead_id: lead.id, unchanged: true };
    const created = await createLeadHandler(ctx.supabase, handlerCtx, {
      pipeline_id: String(config.pipeline_id ?? ""),
      stage_id: String(config.stage_id ?? ""),
      contact_id: ctx.contactId,
      title: String(config.title ?? "Novo negócio"),
      source: "quick_reply_ai",
      tags: [],
    });
    return { lead_id: created.id };
  }
  throw new Error("unsupported_quick_reply_action");
}

async function copyTemplateMedia(
  ctx: AgentQuickReplyContext,
  step: { id: string; idempotency_key: string; payload: Record<string, unknown> },
) {
  const source = String(step.payload.media_storage_path ?? "");
  const mime = String(step.payload.media_mime ?? "");
  if (!source || !mime || !source.startsWith(`${ctx.organizationId}/templates/`))
    throw new Error("template_media_invalid");
  const extension = String(step.payload.media_filename ?? "arquivo").split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "bin";
  const path = `${ctx.organizationId}/${ctx.conversationId}/out-${step.idempotency_key}.${extension}`;
  const bucket = ctx.supabase.storage.from("whatsapp-media");
  const existing = await bucket.download(path);
  if (!existing.data) {
    const sourceFile = await bucket.download(source);
    if (!sourceFile.data) throw new Error("template_media_download_failed");
    const bytes = Buffer.from(await sourceFile.data.arrayBuffer());
    const uploaded = await bucket.upload(path, bytes, { contentType: mime, upsert: false });
    if (uploaded.error && !uploaded.error.message.toLowerCase().includes("exists")) throw uploaded.error;
  }
  return { path, mime, size: Number(step.payload.media_size_bytes ?? 0) || 1 };
}
