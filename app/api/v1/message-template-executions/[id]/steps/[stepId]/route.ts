import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { reportTemplateStepSchema } from "@/lib/schemas/templates";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> },
): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const parsed = reportTemplateStepSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_failed", "Estado do passo inválido.", 422, { requestId });
  const { id, stepId } = await params;
  const supabase = await createClient();
  const { data: execution } = await supabase
    .from("message_template_executions")
    .select("id, conversation_id, status, current_position")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .eq("started_by_user_id", authz.user.id)
    .maybeSingle();
  if (!execution || !["running", "failed"].includes(execution.status))
    return fail("conflict", "A execução não pode ser alterada.", 409, { requestId });
  const { data: currentStep } = await supabase
    .from("message_template_execution_steps")
    .select("id, position, status")
    .eq("id", stepId)
    .eq("execution_id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!currentStep) return fail("not_found", "Passo não encontrado.", 404, { requestId });
  if (currentStep.position !== execution.current_position) {
    return fail("conflict", "Execute os passos na ordem do roteiro.", 409, { requestId });
  }
  if (["succeeded", "skipped"].includes(currentStep.status)) {
    return fail("conflict", "Este passo já foi concluído.", 409, { requestId });
  }
  const now = new Date().toISOString();
  const patch = {
    ...parsed.data,
    started_at: parsed.data.status === "running" ? now : undefined,
    finished_at: ["succeeded", "failed", "skipped"].includes(parsed.data.status) ? now : undefined,
  };
  const { data: step } = await supabase
    .from("message_template_execution_steps")
    .update(patch)
    .eq("id", stepId)
    .eq("execution_id", id)
    .eq("organization_id", authz.org.orgId)
    .select("id, position, status")
    .maybeSingle();
  if (!step) return fail("not_found", "Passo não encontrado.", 404, { requestId });
  if (parsed.data.status === "succeeded" || parsed.data.status === "skipped")
    await supabase
      .from("message_template_executions")
      .update({
        status: "running",
        current_position: step.position + 1,
        error_message: null,
        updated_at: now,
      })
      .eq("id", id)
      .eq("organization_id", authz.org.orgId);
  if (parsed.data.status === "failed")
    await supabase
      .from("message_template_executions")
      .update({
        status: "failed",
        current_position: step.position,
        error_message: parsed.data.error_message ?? "Falha no passo.",
        updated_at: now,
      })
      .eq("id", id)
      .eq("organization_id", authz.org.orgId);
  return ok(step, { requestId });
}
