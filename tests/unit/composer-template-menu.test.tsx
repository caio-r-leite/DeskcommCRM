import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { resolveSlash, TemplateMenu } from "@/components/inbox/composer/TemplateMenu";

describe("resolveSlash", () => {
  it("abre com / no início e captura o query", () => {
    expect(resolveSlash("/fech")).toEqual({ open: true, query: "fech" });
    expect(resolveSlash("/")).toEqual({ open: true, query: "" });
  });
  it("não abre se tem espaço ou não começa com /", () => {
    expect(resolveSlash("/fech agora").open).toBe(false);
    expect(resolveSlash("oi")).toEqual({ open: false, query: "" });
  });
});

describe("TemplateMenu", () => {
  const templates = [
    { id: "1", kind: "text", title: "Saudação", body: "Oi {{primeiro_nome}}", shortcut: "oi" },
    { id: "2", kind: "text", title: "Fechamento", body: "Fechado!", shortcut: "fech" },
    {
      id: "3",
      kind: "image",
      title: "Catálogo",
      body: "",
      shortcut: "catalogo",
      media_filename: "catalogo.jpg",
    },
  ];
  it("filtra por título/shortcut e devolve o escolhido", () => {
    const onPick = vi.fn();
    render(
      <TemplateMenu
        open
        query="fech"
        templates={templates as never}
        onPick={onPick}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Fechamento"));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "2" }));
  });

  it("mostra o nome do arquivo quando a mídia não tem legenda", () => {
    render(
      <TemplateMenu
        open
        query="catalogo"
        templates={templates as never}
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("catalogo.jpg")).toBeInTheDocument();
  });
});
