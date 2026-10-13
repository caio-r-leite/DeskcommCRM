import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { startTemplateExecutionSchema } from "@/lib/schemas/templates";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const parsed = startTemplateExecutionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Prévia inválida.", 422, { requestId });
  const supabase = await createClient();
  const [{ data: template }, { data: conversation }] = await Promise.all([
    supabase
      .from("message_templates")
      .select("id, title")
      .eq("id", parsed.data.template_id)
      .eq("organization_id", authz.org.orgId)
      .maybeSingle(),
    supabase
      .from("conversations")
      .select("id, contact_id, status")
      .eq("id", parsed.data.conversation_id)
      .eq("organization_id", authz.org.orgId)
      .maybeSingle(),
  ]);
  if (!template) return fail("not_found", "Resposta rápida não encontrada.", 404, { requestId });
  if (!conversation) return fail("not_found", "Conversa não encontrada.", 404, { requestId });
  if (conversation.status === "closed" || conversation.status === "archived")
    return fail("conversation_closed", "A conversa foi encerrada. Reabra antes de enviar.", 409, {
      requestId,
    });
  const selectedIds = parsed.data.steps.map((step) => step.id);
  if (new Set(selectedIds).size !== selectedIds.length)
    return fail("validation_failed", "Há passos repetidos na prévia.", 422, { requestId });
  const { data: sourceSteps, error: stepsError } = await supabase
    .from("message_template_steps")
    .select(
      "id, position, action_type, body, wait_seconds, media_storage_path, media_mime, media_size_bytes, media_filename, action_config",
    )
    .eq("template_id", template.id)
    .eq("organization_id", authz.org.orgId)
    .in("id", selectedIds);
  if (stepsError || !sourceSteps || sourceSteps.length !== selectedIds.length)
    return fail("validation_failed", "Um dos passos não pertence à resposta rápida.", 422, {
      requestId,
    });
  const sourceById = new Map(sourceSteps.map((step) => [step.id, step]));
  const snapshot = parsed.data.steps.map((edited, position) => {
    const source = sourceById.get(edited.id)!;
    return {
      source,
      row: {
        organization_id: authz.org.orgId,
        source_step_id: source.id,
        position,
        action_type: source.action_type,
        payload: {
          body: edited.body ?? source.body,
          wait_seconds: source.wait_seconds,
          media_storage_path: source.media_storage_path,
          media_mime: source.media_mime,
          media_size_bytes: source.media_size_bytes,
          media_filename: source.media_filename,
          action_config: source.action_config,
        },
      },
    };
  });
  const now = new Date().toISOString();
  const { data: execution, error } = await supabase
    .from("message_template_executions")
    .insert({
      organization_id: authz.org.orgId,
      template_id: template.id,
      conversation_id: conversation.id,
      contact_id: conversation.contact_id,
      started_by_user_id: authz.user.id,
      template_title: template.title,
      status: "running",
      total_steps: snapshot.length,
      confirmed_at: now,
      started_at: now,
    })
    .select("id, status, conversation_id, contact_id, template_title, total_steps")
    .single();
  if (error || !execution)
    return fail("internal_error", "Erro ao iniciar roteiro.", 500, { requestId });
  const { data: executionSteps, error: insertError } = await supabase
    .from("message_template_execution_steps")
    .insert(snapshot.map(({ row }) => ({ ...row, execution_id: execution.id })))
    .select("id, position, action_type, payload, status, idempotency_key")
    .order("position");
  if (insertError || !executionSteps)
    return fail("internal_error", "Erro ao congelar roteiro.", 500, { requestId });
  const usage = await supabase
    .from("message_templates")
    .select("usage_count")
    .eq("id", template.id)
    .eq("organization_id", authz.org.orgId)
    .single();
  await supabase
    .from("message_templates")
    .update({ usage_count: (usage.data?.usage_count ?? 0) + 1, last_used_at: now })
    .eq("id", template.id)
    .eq("organization_id", authz.org.orgId);
  void audit({
    action: "template.execution_started",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "message_template_execution",
    resourceId: execution.id,
    requestId,
    metadata: {
      template_id: template.id,
      conversation_id: conversation.id,
      steps: snapshot.length,
    },
  });
  return ok({ ...execution, steps: executionSteps }, { requestId, status: 201 });
}
