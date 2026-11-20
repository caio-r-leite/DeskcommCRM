import { z } from "zod";

import { MAXIMO_DE_MIDIAS } from "@/lib/templates/midias";

/**
 * Uma mídia carregada pelo OPERADOR na resposta rápida (#2526) — uma imagem, ou
 * o áudio de um recurso (#2833): os dois são entradas da MESMA coluna.
 *
 * Só a descrição: os bytes moram no bucket privado `whatsapp-media` e o
 * caminho é gerado pela rota de upload. Por isso `storage_path` é texto aqui e
 * conferido na rota (`midiaPertenceAoTemplate`) — aceitar o caminho como ele
 * vem seria aceitar um arquivo que ninguém verificou como sendo deste
 * template, e a remoção apagaria o arquivo apontado.
 */
export const midiaDoTemplateSchema = z.object({
  storage_path: z.string().min(1).max(300),
  media_mime: z.string().min(1).max(100),
  media_size_bytes: z.number().int().min(0),
});

/** Só precondição: conserva o JSON completo recebido da linha, sem autorizar caminhos. */
export const snapshotDeMidiasSchema = z
  .array(midiaDoTemplateSchema.passthrough())
  .max(MAXIMO_DE_MIDIAS);

export const camposDoUploadDeTemplateSchema = z.object({
  substituir_audio: z.string().min(1).max(300).optional(),
  midias_esperadas: snapshotDeMidiasSchema.optional(),
});

/**
 * Criação (#2833). `body` pode ser VAZIO porque um recurso de áudio é uma
 * linha sem texto: o conteúdo dele é o arquivo, que entra por
 * `POST /message-templates/:id/midias` logo depois (o id ainda não existe
 * neste POST — o mesmo motivo pelo qual `midias` só existe no PATCH).
 *
 * O que a criação NÃO aceita continua não aceitando: `midias` no corpo — mídia
 * nova é só a que a rota de upload conferiu. Recurso de TEXTO sem mensagem
 * é recusado na TELA pela régua do conteúdo, onde a pessoa pode corrigir;
 * a rota não tem como distinguir "texto vazio" de "áudio
 * a caminho" sem uma coluna `tipo`, que este PR justamente não tem.
 */
export const createTemplateSchema = z.object({
  kind: z.literal("text").default("text"),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().max(4096).default(""),
  shortcut: z.string().trim().min(1).max(40).optional(),
  /** true = compartilhado da org (owner null, exige manager+); false = pessoal. */
  shared: z.boolean().default(false),
  /**
   * "Mostrar na barra do Inbox" (#3282). Ausente = LIGADO: a resposta nasce
   * aparecendo na barra, como o produto sempre fez. A tela manda `false` só
   * quando o operador desmarca.
   */
  mostrar_na_barra: z.boolean().optional(),
  /**
   * O GRUPO da resposta rápida (#3245) — `null`/ausente é "sem grupo", a lista
   * plana de sempre. O id é conferido na ROTA contra os grupos da organização
   * ativa (a FK composta do banco é a segunda barreira, não a primeira
   * mensagem): um id de outra organização sai como 422 com a frase que
   * interessa, e não como erro de constraint.
   */
  grupo_id: z.string().trim().min(1).max(64).nullable().optional(),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const createMediaTemplateSchema = createTemplateSchema.extend({
  kind: z.enum(["image", "video"]),
});
export type CreateMediaTemplateInput = z.infer<typeof createMediaTemplateSchema>;

/**
 * `midias` entra só na EDIÇÃO: a mídia nova é gravada pela rota de upload,
 * que gera o caminho e confere os bytes sabendo o id do template — um POST de
 * criação não tem esse id ainda. O PATCH daqui é quem REMOVE (lista completa
 * das que permanecem), e a rota apaga do bucket o que saiu da lista.
 */
export const updateTemplateSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().max(4096),
    shortcut: z.string().trim().min(1).max(40).nullable(),
    midias: z.array(midiaDoTemplateSchema).max(MAXIMO_DE_MIDIAS).optional(),
    midias_esperadas: snapshotDeMidiasSchema.optional(),
    /** "Mostrar na barra do Inbox" (#3282) — o liga/desliga da tela. */
    mostrar_na_barra: z.boolean().optional(),
    /**
     * O GRUPO da resposta rápida (#3245). `null` DESVINCULA (volta à lista
     * plana); ausente não mexe no vínculo — é o que permite um PATCH de corpo
     * não tirar a resposta do grupo por omissão.
     */
    grupo_id: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .partial()
  .refine((d) => Object.keys(d).some((campo) => campo !== "midias_esperadas"), {
    message: "Informe ao menos um campo.",
  });
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const templateActionTypeSchema = z.enum([
  "text",
  "image",
  "video",
  "wait",
  "add_tag",
  "move_stage",
  "upsert_crm",
]);

export const templateStepSchema = z
  .object({
    id: z.string().uuid().optional(),
    action_type: templateActionTypeSchema,
    body: z.string().max(4096).default(""),
    wait_seconds: z.number().int().min(0).max(3600).default(0),
    action_config: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((step, ctx) => {
    if (step.action_type === "text" && !step.body.trim()) {
      ctx.addIssue({ code: "custom", path: ["body"], message: "A mensagem não pode ficar vazia." });
    }
    if (step.action_type === "wait" && step.wait_seconds < 1) {
      ctx.addIssue({ code: "custom", path: ["wait_seconds"], message: "Informe a espera." });
    }
    if (step.action_type === "add_tag" && typeof step.action_config.tag !== "string") {
      ctx.addIssue({
        code: "custom",
        path: ["action_config", "tag"],
        message: "Informe a etiqueta.",
      });
    }
    if (step.action_type === "move_stage" && typeof step.action_config.stage_id !== "string") {
      ctx.addIssue({
        code: "custom",
        path: ["action_config", "stage_id"],
        message: "Informe a etapa.",
      });
    }
    if (
      step.action_type === "upsert_crm" &&
      (typeof step.action_config.pipeline_id !== "string" ||
        typeof step.action_config.stage_id !== "string")
    ) {
      ctx.addIssue({ code: "custom", path: ["action_config"], message: "Informe funil e etapa." });
    }
  });

export const saveScriptTemplateSchema = z.object({
  title: z.string().trim().min(1).max(80),
  shortcut: z.string().trim().min(1).max(40).nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  shared: z.boolean().default(false),
  steps: z.array(templateStepSchema).min(1).max(50),
});

export const startTemplateExecutionSchema = z.object({
  template_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  /** Só texto/legenda pode ser alterado no preview; tipo, mídia e operação vêm do servidor. */
  steps: z.array(z.object({ id: z.string().uuid(), body: z.string().max(4096).optional() })).min(1),
});

export const reportTemplateStepSchema = z.object({
  status: z.enum(["running", "succeeded", "failed", "skipped"]),
  result: z.record(z.string(), z.unknown()).optional(),
  error_message: z.string().max(1000).nullable().optional(),
});

/**
 * A REORDENAÇÃO (#3244) — onde a resposta rápida foi solta.
 *
 * `depois_de` é o id do vizinho da ESQUERDA; `null` é a primeira posição. A tela
 * manda o VIZINHO, nunca um número: quem arrasta sabe em que resposta soltou, e
 * a posição (`ordem`) que isso vira é conta do servidor (`lib/templates/ordem.ts`)
 * — o mesmo desenho da reordenação de etapa do funil.
 *
 * Não é `z.string().uuid()`: o id de uma resposta rápida é uuid, mas quem
 * VALIDA a posse é a lista visível da organização (a régua das mídias). Um
 * formato recusado aqui sairia como 422 "Dados inválidos" sem dizer que a
 * resposta é de outra organização, e é essa a mensagem que interessa.
 */
export const moverTemplateSchema = z.object({
  depois_de: z.string().trim().min(1).max(64).nullable(),
});
export type MoverTemplateInput = z.infer<typeof moverTemplateSchema>;

/**
 * O GRUPO de respostas rápidas (#3245) — nome, e só.
 *
 * O limite de 60 é o mesmo `check` do banco: recusar aqui é a mensagem que a
 * pessoa consegue consertar; o CHECK é a segunda barreira, para o corpo que não
 * passa por esta rota.
 */
export const createGrupoSchema = z.object({
  name: z.string().trim().min(1).max(60),
});
export type CreateGrupoInput = z.infer<typeof createGrupoSchema>;

/** Renomear (#3245): só o nome. A ordem tem rota própria, como a das respostas. */
export const updateGrupoSchema = createGrupoSchema;
export type UpdateGrupoInput = z.infer<typeof updateGrupoSchema>;

/**
 * A REORDENAÇÃO do grupo (#3245) — o mesmo contrato da resposta rápida: a tela
 * manda o VIZINHO da esquerda (`depois_de`), `null` é a primeira posição, e a
 * conta da posição é do servidor (`lib/templates/ordem.ts`).
 */
export const moverGrupoSchema = z.object({
  depois_de: z.string().trim().min(1).max(64).nullable(),
});
export type MoverGrupoInput = z.infer<typeof moverGrupoSchema>;
