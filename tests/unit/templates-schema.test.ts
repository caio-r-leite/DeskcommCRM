import { describe, expect, it } from "vitest";

import { createMediaTemplateSchema, createTemplateSchema } from "@/lib/schemas/templates";

describe("createTemplateSchema", () => {
  it("aceita template válido pessoal", () => {
    const r = createTemplateSchema.safeParse({ title: "Saudação", body: "Oi {{primeiro_nome}}!" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shared).toBe(false);
  });
  it("aceita shared + shortcut", () => {
    const r = createTemplateSchema.safeParse({
      title: "Fechamento",
      body: "Fechado!",
      shortcut: "fech",
      shared: true,
    });
    expect(r.success).toBe(true);
  });
  it("rejeita title vazio e body vazio", () => {
    expect(createTemplateSchema.safeParse({ title: "", body: "x" }).success).toBe(false);
    expect(createTemplateSchema.safeParse({ title: "x", body: "" }).success).toBe(false);
  });
  it("rejeita body gigante (>4096)", () => {
    expect(createTemplateSchema.safeParse({ title: "x", body: "a".repeat(5000) }).success).toBe(
      false,
    );
  });
});

describe("createMediaTemplateSchema", () => {
  it("aceita foto ou vídeo com legenda opcional", () => {
    expect(
      createMediaTemplateSchema.safeParse({ kind: "image", title: "Catálogo", body: "" }).success,
    ).toBe(true);
    expect(
      createMediaTemplateSchema.safeParse({ kind: "video", title: "Demonstração" }).success,
    ).toBe(true);
  });

  it("não aceita áudio ou documento", () => {
    expect(createMediaTemplateSchema.safeParse({ kind: "audio", title: "Áudio" }).success).toBe(
      false,
    );
  });
});
