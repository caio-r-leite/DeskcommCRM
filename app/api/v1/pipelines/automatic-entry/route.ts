import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ pipeline_id: z.string().uuid(), stage_id: z.string().uuid() })
  .strict();

/**
 * Configura, numa transação, o destino do card que nasce de uma conversa.
 *
 * A organização vem da sessão. O body só traz ids e a função SQL volta a
 * validar que ambos pertencem à mesma organização e que a etapa é aberta.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", {
    requestId,
    resource: "crm_pipeline_automatic_entry",
  });
  if (!authz.ok) return authz.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail("invalid_request", "Corpo não é JSON válido.", 400, { requestId });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return fail("unprocessable_entity", "Escolha um funil e uma coluna inicial.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_configurar_entrada_automatica", {
    p_org: authz.org.orgId,
    p_pipeline: parsed.data.pipeline_id,
    p_stage: parsed.data.stage_id,
  });

  if (error) {
    const status =
      error.code === "PT404"
        ? 404
        : error.code === "PT409"
          ? 409
          : error.code === "PT422"
            ? 422
            : 500;
    return fail(
      status === 404
        ? "not_found"
        : status === 409
          ? "state_conflict"
          : status === 422
            ? "unprocessable_entity"
            : "internal_error",
      status === 500 ? "Não consegui salvar a entrada automática." : error.message,
      status,
      { requestId },
    );
  }

  await audit({
    action: "pipeline.automatic_entry_configured",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "crm_pipeline",
    resourceId: parsed.data.pipeline_id,
    requestId,
    metadata: {
      pipeline_id: parsed.data.pipeline_id,
      stage_id: parsed.data.stage_id,
    },
  });

  return ok(data, { requestId });
}
