import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.enum(["teal", "green", "red", "yellow", "blue", "purple", "gray"]).default("teal"),
});

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const { data, error } = await (
    await createClient()
  )
    .from("message_template_categories")
    .select("id, name, color")
    .eq("organization_id", authz.org.orgId)
    .order("name");
  if (error) return fail("internal_error", "Erro ao listar categorias.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Dados inválidos.", 422, { requestId });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_template_categories")
    .insert({
      organization_id: authz.org.orgId,
      created_by_user_id: authz.user.id,
      ...parsed.data,
    })
    .select("id, name, color")
    .single();
  if (error || !data) return fail("internal_error", "Erro ao criar categoria.", 500, { requestId });
  void audit({
    action: "template.category_created",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "message_template_category",
    resourceId: data.id,
    requestId,
    metadata: { name: data.name },
  });
  return ok(data, { requestId, status: 201 });
}
