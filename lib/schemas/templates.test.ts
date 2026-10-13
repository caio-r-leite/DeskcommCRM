import { describe, expect, it } from "vitest";
import { saveScriptTemplateSchema, startTemplateExecutionSchema } from "./templates";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("roteiros de resposta rápida", () => {
  it("aceita uma sequência heterogênea ordenada", () => {
    const result = saveScriptTemplateSchema.safeParse({
      title: "Apresentação",
      steps: [
        { action_type: "text", body: "Olá {{primeiro_nome}}" },
        { action_type: "wait", wait_seconds: 2 },
        { action_type: "add_tag", action_config: { tag: "Apresentado" } },
        { action_type: "move_stage", action_config: { stage_id: UUID } },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("recusa texto vazio e ação CRM incompleta", () => {
    expect(
      saveScriptTemplateSchema.safeParse({ title: "X", steps: [{ action_type: "text", body: "" }] })
        .success,
    ).toBe(false);
    expect(
      saveScriptTemplateSchema.safeParse({
        title: "X",
        steps: [{ action_type: "upsert_crm", action_config: { stage_id: UUID } }],
      }).success,
    ).toBe(false);
  });

  it("a confirmação só aceita ids e edições de texto", () => {
    const parsed = startTemplateExecutionSchema.parse({
      template_id: UUID,
      conversation_id: UUID,
      steps: [{ id: UUID, body: "edição temporária", action_type: "move_stage" }],
    });
    expect(parsed.steps[0]).toEqual({ id: UUID, body: "edição temporária" });
  });
});
