import { z } from "zod";

export const createTemplateSchema = z.object({
  kind: z.literal("text").default("text"),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(4096),
  shortcut: z.string().trim().min(1).max(40).optional(),
  /** true = compartilhado da org (owner null, exige manager+); false = pessoal. */
  shared: z.boolean().default(false),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const createMediaTemplateSchema = z.object({
  kind: z.enum(["image", "video"]),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().max(4096).default(""),
  shortcut: z.string().trim().min(1).max(40).optional(),
  shared: z.boolean().default(false),
});
export type CreateMediaTemplateInput = z.infer<typeof createMediaTemplateSchema>;

export const updateTemplateSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    // Vazio é uma legenda válida para foto/vídeo. A rota impede corpo vazio
    // quando a linha existente é do tipo texto.
    body: z.string().trim().max(4096),
    shortcut: z.string().trim().min(1).max(40).nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "Informe ao menos um campo." });
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
