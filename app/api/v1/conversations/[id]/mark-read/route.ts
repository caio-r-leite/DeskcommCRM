import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/conversations/[id]/mark-read — marca como lida.
 * DELETE /api/v1/conversations/[id]/mark-read — remove a marca de leitura.
 *
 * Disparado pelo inbox após 1,5s com a conversa em foco (EPIC-03 S-03.10).
 * RLS garante que só conversas visíveis ao ator são atualizadas.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

import { markConversationReadHandler } from "../../_handler";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

async function mudarLeitura(ctx: RouteCtx, lida: boolean): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  const supabase = await createClient();

  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  if (!z.string().uuid().safeParse(id).success) {
    return fail("invalid_request", traduzir("Conversa não encontrada.", authz.user.idioma), 400, { requestId });
  }

  try {
    const conv = await markConversationReadHandler(
      supabase,
      {
        organization_id: authz.org.orgId,
        actor: { type: "user", id: authz.user.id },
        requestId,
        idioma: authz.user.idioma,
      },
      id,
      lida,
    );
    return ok(conv, { requestId });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    throw err;
  }
}

export function POST(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  return mudarLeitura(ctx, true);
}

export function DELETE(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  return mudarLeitura(ctx, false);
}
