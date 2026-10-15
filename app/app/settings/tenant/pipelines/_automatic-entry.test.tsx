import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/api/client", () => ({
  apiClient: { post: vi.fn() },
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { EntradaAutomatica } from "./_automatic-entry";

window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.setPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const pipelines = [
  { id: "p1", name: "Qualificação", is_default: true, entry_stage_id: "s2" },
  { id: "p2", name: "Ferramentas", is_default: false, entry_stage_id: null },
];
const etapas = {
  p1: [
    { id: "s1", name: "Novo", is_archived: false, is_won: false, is_lost: false },
    { id: "s2", name: "Em conversa", is_archived: false, is_won: false, is_lost: false },
  ],
  p2: [
    { id: "s3", name: "Entrada", is_archived: false, is_won: false, is_lost: false },
    { id: "s4", name: "Fechado", is_archived: false, is_won: true, is_lost: false },
  ],
};

describe("destino do card automático", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue({ data: {} });
  });

  it("mostra exatamente o funil padrão e a coluna configurada", () => {
    render(<EntradaAutomatica pipelines={pipelines} etapas={etapas} />);
    expect(screen.getByLabelText("Fluxo de entrada")).toHaveTextContent("Qualificação");
    expect(screen.getByLabelText("Coluna inicial")).toHaveTextContent("Em conversa");
    expect(screen.getByRole("button", { name: "Salvar destino" })).toBeDisabled();
  });

  it("mostra o fallback e permite reparar uma coluna gravada que ficou inválida", () => {
    render(
      <EntradaAutomatica
        pipelines={[{ ...pipelines[0]!, entry_stage_id: "coluna-arquivada" }]}
        etapas={{ p1: etapas.p1 }}
      />,
    );
    expect(screen.getByLabelText("Coluna inicial")).toHaveTextContent("Novo");
    expect(screen.getByRole("button", { name: "Salvar destino" })).toBeEnabled();
  });

  it("ao trocar o funil oferece só colunas abertas e salva o par escolhido", async () => {
    const user = userEvent.setup();
    render(<EntradaAutomatica pipelines={pipelines} etapas={etapas} />);

    await user.click(screen.getByLabelText("Fluxo de entrada"));
    await user.click(await screen.findByRole("option", { name: "Ferramentas" }));

    expect(screen.getByLabelText("Coluna inicial")).toHaveTextContent("Entrada");
    await user.click(screen.getByLabelText("Coluna inicial"));
    expect(screen.getByRole("option", { name: "Entrada" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Fechado" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Salvar destino" }));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith("/api/v1/pipelines/automatic-entry", {
        pipeline_id: "p2",
        stage_id: "s3",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Entrada automática salva.");
    expect(refresh).toHaveBeenCalledOnce();
  });
});
