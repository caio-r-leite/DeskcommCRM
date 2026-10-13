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
