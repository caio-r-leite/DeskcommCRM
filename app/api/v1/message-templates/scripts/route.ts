import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { roleAtLeast } from "@/lib/auth/types";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { saveScriptTemplateSchema } from "@/lib/schemas/templates";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const parsed = saveScriptTemplateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_failed", "Revise os passos do roteiro.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors,
    });
  if (parsed.data.shared && !roleAtLeast(authz.org.role, "manager"))
    return fail("forbidden", "Só manager+ cria roteiro compartilhado.", 403, { requestId });
  const supabase = await createClient();
  const { data: template, error } = await supabase
    .from("message_templates")
    .insert({
      organization_id: authz.org.orgId,
      owner_user_id: parsed.data.shared ? null : authz.user.id,
      created_by_user_id: authz.user.id,
      kind: "script",
      title: parsed.data.title,
      body: parsed.data.steps.find((step) => step.action_type === "text")?.body ?? "",
      shortcut: parsed.data.shortcut ?? null,
      category_id: parsed.data.category_id ?? null,
    })
    .select("id")
    .single();
  if (error || !template)
    return fail("internal_error", "Erro ao criar roteiro.", 500, { requestId });
  const stepsSemArquivo = parsed.data.steps
    .map((step, position) => ({ step, position }))
    .filter(({ step }) => step.action_type !== "image" && step.action_type !== "video");
  const { error: stepsError } = stepsSemArquivo.length
    ? await supabase.from("message_template_steps").insert(
        stepsSemArquivo.map(({ step, position }) => ({
          organization_id: authz.org.orgId,
          template_id: template.id,
          position,
          action_type: step.action_type,
          body: step.body,
          wait_seconds: step.wait_seconds,
          action_config: step.action_config,
        })),
      )
    : { error: null };
  if (stepsError) {
    await supabase
      .from("message_templates")
      .delete()
      .eq("id", template.id)
      .eq("organization_id", authz.org.orgId);
    return fail("internal_error", "Erro ao salvar passos do roteiro.", 500, { requestId });
  }
  void audit({
    action: "template.created",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "message_template",
    resourceId: template.id,
    requestId,
    metadata: { kind: "script", steps: parsed.data.steps.length },
  });
  return ok({ id: template.id }, { requestId, status: 201 });
}
