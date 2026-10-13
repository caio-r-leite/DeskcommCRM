import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { saveScriptTemplateSchema } from "@/lib/schemas/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const parsed = saveScriptTemplateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return fail("validation_failed", "Revise os passos do roteiro.", 422, { requestId });
  const { id } = await params;
  const supabase = await createClient();
  const { data: template } = await supabase
    .from("message_templates")
    .select("id, owner_user_id, kind")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!template || template.kind !== "script")
    return fail("not_found", "Roteiro não encontrado.", 404, { requestId });
  const { data: current } = await supabase
    .from("message_template_steps")
    .select("id, position, action_type, media_storage_path")
    .eq("template_id", id)
    .eq("organization_id", authz.org.orgId);
  const keptMediaIds = new Set(
    parsed.data.steps
      .filter((step) => step.action_type === "image" || step.action_type === "video")
      .map((step) => step.id)
      .filter(Boolean),
  );
  const removedPaths = (current ?? [])
    .filter(
      (step) =>
        (step.action_type === "image" || step.action_type === "video") &&
        !keptMediaIds.has(step.id),
    )
    .flatMap((step) => (step.media_storage_path ? [step.media_storage_path] : []));
  for (const step of current ?? [])
    await supabase
      .from("message_template_steps")
      .update({ position: 1000 + step.position })
      .eq("id", step.id)
      .eq("organization_id", authz.org.orgId);
  await supabase
    .from("message_template_steps")
    .delete()
    .eq("template_id", id)
    .eq("organization_id", authz.org.orgId)
    .not("id", "in", `(${Array.from(keptMediaIds).join(",") || randomUUID()})`);
  const mediaSteps = parsed.data.steps
    .map((step, position) => ({ step, position }))
    .filter(({ step }) => step.action_type === "image" || step.action_type === "video");
  for (const { step, position } of mediaSteps)
    await supabase
      .from("message_template_steps")
      .update({ position, body: step.body, updated_at: new Date().toISOString() })
      .eq("id", step.id!)
      .eq("template_id", id)
      .eq("organization_id", authz.org.orgId);
  const normalSteps = parsed.data.steps
    .map((step, position) => ({ step, position }))
    .filter(({ step }) => step.action_type !== "image" && step.action_type !== "video");
  const { error: insertError } = normalSteps.length
    ? await supabase
        .from("message_template_steps")
        .insert(
          normalSteps.map(({ step, position }) => ({
            organization_id: authz.org.orgId,
            template_id: id,
            position,
            action_type: step.action_type,
            body: step.body,
            wait_seconds: step.wait_seconds,
            action_config: step.action_config,
          })),
        )
    : { error: null };
  if (insertError)
    return fail("internal_error", "Erro ao atualizar os passos.", 500, { requestId });
  const { data: updated, error } = await supabase
    .from("message_templates")
    .update({
      title: parsed.data.title,
      shortcut: parsed.data.shortcut ?? null,
      category_id: parsed.data.category_id ?? null,
      body: parsed.data.steps.find((step) => step.action_type === "text")?.body ?? "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select("id")
    .maybeSingle();
  if (error || !updated) return fail("not_found", "Roteiro não encontrado.", 404, { requestId });
  if (removedPaths.length)
    await createAdminClient().storage.from("whatsapp-media").remove(removedPaths);
  void audit({
    action: "template.updated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "message_template",
    resourceId: id,
    requestId,
    metadata: { kind: "script", steps: parsed.data.steps.length },
  });
  return ok(updated, { requestId });
}
