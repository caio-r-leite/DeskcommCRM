import { describe, expect, it } from "vitest";

import {
  canAgentUseTemplate,
  hasAgentTurnTools,
  matchAuthorizedTemplate,
  totalWaitSeconds,
} from "./agent-policy";

describe("política de respostas rápidas do agente", () => {
  it("monta a ponte mesmo quando resposta rápida é a única ferramenta", () => {
    expect(hasAgentTurnTools([], "none")).toBe(false);
    expect(hasAgentTurnTools([], "selected")).toBe(true);
    expect(hasAgentTurnTools([], "all")).toBe(true);
    expect(hasAgentTurnTools(["crm_get_lead"], "none")).toBe(true);
  });

  it("nasce fechada e a allowlist não autoriza outro roteiro", () => {
    expect(canAgentUseTemplate("none", ["a"], "a")).toBe(false);
    expect(canAgentUseTemplate("selected", ["a"], "b")).toBe(false);
    expect(canAgentUseTemplate("selected", ["a"], "a")).toBe(true);
    expect(canAgentUseTemplate("all", [], "novo")).toBe(true);
  });

  it("resolve apenas título ou atalho exato e recusa ambiguidade", () => {
    const templates = [
      { id: "1", title: "Apresentação Ourives", shortcut: "ourives" },
      { id: "2", title: "Apresentação Iniciante", shortcut: "iniciante" },
    ];
    expect(matchAuthorizedTemplate(templates, "OURIVES")?.id).toBe("1");
    expect(matchAuthorizedTemplate(templates, "Apresentação Iniciante")?.id).toBe("2");
    expect(matchAuthorizedTemplate(templates, "apresentação")?.id).toBeUndefined();
    expect(matchAuthorizedTemplate([...templates, { id: "3", title: "Outro", shortcut: "ourives" }], "ourives")).toBeNull();
  });

  it("soma somente esperas para o limite do turno", () => {
    expect(totalWaitSeconds([
      { action_type: "text", wait_seconds: 99 },
      { action_type: "wait", wait_seconds: 2 },
      { action_type: "wait", wait_seconds: 3 },
    ])).toBe(5);
  });
});
