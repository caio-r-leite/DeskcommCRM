import { z } from "zod";

/**
 * Preferência visual da caixa de arquivamento.
 *
 * Mora no JSON compartilhado da organização para não criar tabela nem coluna
 * só para dois controles de interface. Ausência significa o comportamento
 * novo e seguro: mostrar por três segundos antes de arquivar.
 */
export const configuracaoDoArquivamentoSchema = z
  .object({
    enabled: z.boolean().catch(true),
    duration_seconds: z.coerce.number().int().min(1).max(60).catch(3),
  })
  .catch({ enabled: true, duration_seconds: 3 });

export type ConfiguracaoDoArquivamento = z.infer<typeof configuracaoDoArquivamentoSchema>;

export const CONFIGURACAO_PADRAO_DO_ARQUIVAMENTO: ConfiguracaoDoArquivamento = {
  enabled: true,
  duration_seconds: 3,
};

/** Nunca deixa um JSON antigo ou editado à mão derrubar o Inbox. */
export function lerConfiguracaoDoArquivamento(settings: unknown): ConfiguracaoDoArquivamento {
  const raiz =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  const inbox =
    raiz.inbox && typeof raiz.inbox === "object" && !Array.isArray(raiz.inbox)
      ? (raiz.inbox as Record<string, unknown>)
      : {};
  return configuracaoDoArquivamentoSchema.parse(inbox.archive_dialog ?? {});
}
