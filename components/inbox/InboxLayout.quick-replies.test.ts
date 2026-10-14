import { describe, expect, it } from "vitest";

import { alternarPainelDeRespostas } from "@/lib/inbox/estado-painel-respostas";

describe("botão do dock de respostas rápidas", () => {
  it("abre recolhido, fecha quando já está recolhido e minimiza quando está aberto", () => {
    expect(alternarPainelDeRespostas("fechado")).toBe("recolhido");
    expect(alternarPainelDeRespostas("recolhido")).toBe("fechado");
    expect(alternarPainelDeRespostas("aberto")).toBe("recolhido");
  });
});
