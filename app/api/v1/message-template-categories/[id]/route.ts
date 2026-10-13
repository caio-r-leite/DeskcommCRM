import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, noContent, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.enum(["teal", "green", "red", "yellow", "blue", "purple", "gray"]).optional(),
});
type Ctx = { params: Promise<{ id: string }> };
export async function PATCH(req: NextRequest, { params }: Ctx): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Dados inválidos.", 422, { requestId });
  const { id } = await params;
  const { data, error } = await (
    await createClient()
  )
    .from("message_template_categories")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select("id, name, color")
    .maybeSingle();
  if (error || !data) return fail("not_found", "Categoria não encontrada.", 404, { requestId });
  void audit({
    action: "template.category_updated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "message_template_category",
    resourceId: id,
    requestId,
    metadata: { name: data.name },
  });
  return ok(data, { requestId });
}
export async function DELETE(_req: NextRequest, { params }: Ctx): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const { data, error } = await (
    await createClient()
  )
    .from("message_template_categories")
    .delete()
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .select("id, name")
    .maybeSingle();
  if (error || !data) return fail("not_found", "Categoria não encontrada.", 404, { requestId });
  void audit({
    action: "template.category_deleted",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "message_template_category",
    resourceId: id,
    requestId,
    metadata: { name: data.name },
  });
  return noContent(requestId);
}
