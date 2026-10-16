"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { podeAdministrarEmpresa } from "@/lib/auth/pode-administrar-empresa";
import { supportWriteError } from "@/lib/impersonate/support";
import {
  configuracaoDoArquivamentoSchema,
  type ConfiguracaoDoArquivamento,
} from "@/lib/inbox/configuracao-do-arquivamento";
import { createAdminClient } from "@/lib/supabase/admin";

export type ResultadoConfiguracaoDoArquivamento =
  | { ok: true; data: ConfiguracaoDoArquivamento }
  | { ok: false; error: "validation_failed" | "unauthenticated" | "forbidden" | "write_failed" };

export async function definirConfiguracaoDoArquivamento(
  input: ConfiguracaoDoArquivamento,
): Promise<ResultadoConfiguracaoDoArquivamento> {
  const parsed = configuracaoDoArquivamentoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation_failed" };

  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(user.support)) return { ok: false, error: "forbidden" };
  const org = await resolveActiveOrg(user);
  if (!org || !podeAdministrarEmpresa(user, org)) return { ok: false, error: "forbidden" };

  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  if (erroLeitura) return { ok: false, error: "write_failed" };

  const settings =
    atual?.settings && typeof atual.settings === "object" && !Array.isArray(atual.settings)
      ? (atual.settings as Record<string, unknown>)
      : {};
  const inbox =
    settings.inbox && typeof settings.inbox === "object" && !Array.isArray(settings.inbox)
      ? (settings.inbox as Record<string, unknown>)
      : {};
  const novo = {
    ...settings,
    inbox: { ...inbox, archive_dialog: parsed.data },
  };

  const { error } = await admin
    .from("organizations")
    .update({ settings: novo })
    .eq("id", org.orgId);
  if (error) return { ok: false, error: "write_failed" };

  await audit({
    action: "settings.archive_dialog_updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "organization",
    resourceId: org.orgId,
    metadata: parsed.data,
  });

  revalidatePath("/app", "layout");
  revalidatePath("/app/settings/tenant");
  return { ok: true, data: parsed.data };
}
