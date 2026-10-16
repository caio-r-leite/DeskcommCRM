import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

import { ArchiveConversationDialog } from "./ArchiveConversationDialog";

const config = { enabled: true, duration_seconds: 3 } as const;

describe("ArchiveConversationDialog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.get.mockReset();
    api.post.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it("executa uma única vez a ação padrão ao fim do prazo", async () => {
    const onArchive = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    render(
      <ArchiveConversationDialog
        open
        config={config}
        quantidade={1}
        contactId={null}
        onArchive={onArchive}
        onCancel={onCancel}
      />,
    );

    await act(async () => vi.advanceTimersByTimeAsync(2_999));
    expect(onArchive).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it("qualquer interação interna pausa a contagem e cancelar não arquiva", async () => {
    const onArchive = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    render(
      <ArchiveConversationDialog
        open
        config={config}
        quantidade={1}
        contactId={null}
        onArchive={onArchive}
        onCancel={onCancel}
      />,
    );

    fireEvent.pointerDown(screen.getByText("Manter o card como está"));
    expect(screen.getByText("A contagem foi pausada enquanto você escolhe.")).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(onArchive).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar arquivamento" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onArchive).not.toHaveBeenCalled();
  });

  it("clicar fora executa somente a ação padrão", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const onArchive = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    render(
      <ArchiveConversationDialog
        open
        config={config}
        quantidade={1}
        contactId={null}
        onArchive={onArchive}
        onCancel={onCancel}
      />,
    );

    const cortina = document.querySelector(".ds-cortina");
    expect(cortina).toBeTruthy();
    await user.click(cortina!);
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("excluir card só acontece depois da escolha e do clique explícitos", async () => {
    vi.useRealTimers();
    api.get.mockResolvedValue({
      data: {
        leads: [
          {
            id: "lead-1",
            title: "Mini torno",
            pipeline_id: "pipeline-1",
            stage_id: "stage-1",
            funil_nome: "Vendas",
            etapa_nome: "Novo",
            etapas_do_funil: [
              { id: "stage-1", name: "Novo", is_won: false, is_lost: false },
              { id: "stage-2", name: "Apresentado", is_won: false, is_lost: false },
            ],
          },
        ],
      },
    });
    api.post.mockResolvedValue({ data: { updated_count: 1 } });
    const onArchive = vi.fn().mockResolvedValue(undefined);
    render(
      <ArchiveConversationDialog
        open
        config={config}
        quantidade={1}
        contactId="contact-1"
        onArchive={onArchive}
        onCancel={() => undefined}
      />,
    );

    fireEvent.click(await screen.findByRole("radio", { name: /Excluir o card do CRM/ }));
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Excluir card e arquivar" }));
    await act(async () => Promise.resolve());
    expect(api.post).toHaveBeenCalledWith("/api/v1/leads/bulk", {
      action: "delete",
      lead_ids: ["lead-1"],
      params: {},
    });
    expect(onArchive).toHaveBeenCalledTimes(1);
  });
});
