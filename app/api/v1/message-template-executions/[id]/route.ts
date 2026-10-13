import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  status: z.enum(["succeeded", "failed", "cancelled"]),
  error_message: z.string().max(1000).nullable().optional(),
});
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("message_template_executions")
    .select(
      "id, status, conversation_id, contact_id, template_title, total_steps, current_position, error_message",
    )
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!data) return fail("not_found", "Execução não encontrada.", 404, { requestId });
  const { data: steps } = await supabase
    .from("message_template_execution_steps")
    .select("id, position, action_type, payload, status, idempotency_key, result, error_message")
    .eq("execution_id", id)
    .eq("organization_id", authz.org.orgId)
    .order("position");
  return ok({ ...data, steps: steps ?? [] }, { requestId });
}
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Estado inválido.", 422, { requestId });
  const { id } = await params;
  const now = new Date().toISOString();
  const supabase = await createClient();
  const { data } = await supabase
    .from("message_template_executions")
    .update({ ...parsed.data, finished_at: now, updated_at: now })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .eq("started_by_user_id", authz.user.id)
    .select("id, status")
    .maybeSingle();
  if (!data) return fail("not_found", "Execução não encontrada.", 404, { requestId });
  void audit({
    action: "template.execution_finished",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "message_template_execution",
    resourceId: id,
    requestId,
    metadata: { status: parsed.data.status },
  });
  return ok(data, { requestId });
}
