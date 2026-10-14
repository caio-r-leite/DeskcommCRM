import { z } from "zod";

import { executeAgentQuickReply } from "@/lib/quick-replies/agent-executor";
import { matchAuthorizedTemplate } from "@/lib/quick-replies/agent-policy";
import type { McpToolDefinition } from "../types";

const shape = {
  resposta: z.string().trim().min(1).max(120).describe("Título exato, atalho ou id da resposta autorizada."),
};

export const crmExecuteQuickReply: McpToolDefinition<typeof shape> = {
  name: "crm_execute_quick_reply",
  description:
    "Executa uma resposta rápida autorizada na conversa atual. Escolha somente uma das respostas listadas na descrição desta ferramenta. O roteiro cadastrado é imutável para a chamada: você não escreve o conteúdo nem altera a ordem.",
  inputSchema: shape,
  category: "write",
  requiresRole: "ai_operator",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    if (!ctx.agentVersionId || !ctx.sourceJobId || !ctx.conversaDoTurno || !ctx.contatoDoTurno)
      return { permitido: false, motivo: "fora_de_um_turno_de_atendimento" };

    const { data: version } = await ctx.supabase
      .from("ai_agent_versions")
      .select("quick_reply_access_mode, quick_reply_template_ids")
      .eq("id", ctx.agentVersionId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!version || version.quick_reply_access_mode === "none")
      return { permitido: false, motivo: "acesso_desativado" };

    let query = ctx.supabase
      .from("message_templates")
      .select("id, title, shortcut")
      .eq("organization_id", ctx.organizationId)
      .is("owner_user_id", null);
    if (version.quick_reply_access_mode === "selected")
      query = query.in("id", version.quick_reply_template_ids ?? []);
    const { data } = await query;
    const match = matchAuthorizedTemplate(data ?? [], input.resposta);
    if (!match) return { permitido: false, motivo: "resposta_nao_autorizada_ou_ambigua" };

    return executeAgentQuickReply(
      {
        supabase: ctx.supabase,
        organizationId: ctx.organizationId,
        agentId: ctx.actor.type === "ai_agent" ? (ctx.actor.agent_id ?? ctx.actor.id) : ctx.actor.id,
        agentVersionId: ctx.agentVersionId,
        sourceJobId: ctx.sourceJobId,
        conversationId: ctx.conversaDoTurno,
        contactId: ctx.contatoDoTurno,
        requestId: ctx.requestId,
      },
      match.id,
    );
  },
};
