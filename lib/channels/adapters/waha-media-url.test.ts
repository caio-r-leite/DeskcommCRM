import { describe, expect, it } from "vitest";
import { urlDeMidiaAcessivelAoWaha } from "./waha";

describe("URL de mídia entregue ao WAHA", () => {
  it("troca somente a origem pública do Supabase pela rota alcançável no servidor", () => {
    expect(
      urlDeMidiaAcessivelAoWaha(
        "http://127.0.0.1:54321/storage/v1/object/sign/whatsapp-media/x?token=abc",
        "http://127.0.0.1:54321",
        "http://host.docker.internal:54321",
      ),
    ).toBe("http://host.docker.internal:54321/storage/v1/object/sign/whatsapp-media/x?token=abc");
  });

  it("não reescreve mídia que não veio do Supabase desta instalação", () => {
    const externa = "https://cdn.exemplo.com/foto.jpg?assinatura=1";
    expect(
      urlDeMidiaAcessivelAoWaha(externa, "https://supabase.exemplo.com", "http://kong:8000"),
    ).toBe(externa);
  });
});
