import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: h }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplateCategories: () => ({
    data: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Comercial",
        color: "teal",
      },
    ],
  }),
  useMessageTemplates: () => ({
    data: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "script",
        title: "Apresentação",
        body: "Mensagem cadastrada",
        shortcut: "apresentar",
        owner_user_id: null,
        media_filename: null,
        media_mime: null,
        media_size_bytes: null,
        category_id: "22222222-2222-4222-8222-222222222222",
        category: { id: "22222222-2222-4222-8222-222222222222", name: "Comercial", color: "teal" },
        usage_count: 3,
        last_used_at: null,
        steps: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            template_id: "11111111-1111-4111-8111-111111111111",
            position: 0,
            action_type: "text",
            body: "Mensagem cadastrada",
            wait_seconds: 0,
            media_mime: null,
            media_size_bytes: null,
            media_filename: null,
            action_config: {},
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            template_id: "11111111-1111-4111-8111-111111111111",
            position: 1,
            action_type: "wait",
            body: "",
            wait_seconds: 2,
            media_mime: null,
            media_size_bytes: null,
            media_filename: null,
            action_config: {},
          },
          {
            id: "55555555-5555-4555-8555-555555555555",
            template_id: "11111111-1111-4111-8111-111111111111",
            position: 2,
            action_type: "image",
            body: "Catálogo",
            wait_seconds: 0,
            media_mime: "image/jpeg",
            media_size_bytes: 100,
            media_filename: "catalogo.jpg",
            action_config: {},
          },
        ],
      },
    ],
  }),
}));

import { optionalMediaCaption, QuickRepliesPanel } from "./QuickRepliesPanel";

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickRepliesPanel
        conversationId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        contactId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        status="open"
        tags={[]}
        onClose={() => undefined}
      />
    </QueryClientProvider>,
  );
}

describe("painel de respostas rápidas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("omite legenda vazia para a API aceitar foto sem texto", () => {
    expect(optionalMediaCaption("")).toBeUndefined();
    expect(optionalMediaCaption("   ")).toBeUndefined();
    expect(optionalMediaCaption("  Catálogo  ")).toBe("Catálogo");
  });

  it("abre pelo olho e editar a prévia não envia nem altera o cadastro", () => {
    renderPanel();
    expect(screen.getByTestId("quick-replies-panel")).toBeTruthy();
    expect(screen.getAllByText("Comercial")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Revisar e enviar" }));
    expect(screen.getByRole("img", { name: "catalogo.jpg" })).toBeTruthy();
    const field = screen.getByDisplayValue("Mensagem cadastrada");
    fireEvent.change(field, { target: { value: "Edição só deste envio" } });
    expect(
      screen.getByText(
        "Esta cópia vale somente para a conversa atual. A resposta cadastrada não será alterada.",
      ),
    ).toBeTruthy();
    expect(h.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Revisar e enviar" }));
    expect(screen.getByDisplayValue("Mensagem cadastrada")).toBeTruthy();
  });

  it("filtra enquanto digita, sem exigir acento nem o separador do atalho", () => {
    renderPanel();
    const busca = screen.getByPlaceholderText("Pesquisar resposta rápida");

    fireEvent.change(busca, { target: { value: "catalogo" } });
    expect(screen.getByText("Apresentação")).toBeTruthy();

    fireEvent.change(busca, { target: { value: "apre sentacao" } });
    expect(screen.getByText("Apresentação")).toBeTruthy();

    fireEvent.change(busca, { target: { value: "comercial" } });
    expect(screen.getByText("Apresentação")).toBeTruthy();

    fireEvent.change(busca, { target: { value: "nao existe" } });
    expect(screen.queryByText("Apresentação")).toBeNull();
    expect(h.post).not.toHaveBeenCalled();
  });

  it("envia ao clicar no card e registra falha real devolvida pelo canal", async () => {
    h.post.mockImplementation((url: string) => {
      if (url === "/api/v1/message-template-executions") {
        return Promise.resolve({
          data: {
            id: "66666666-6666-4666-8666-666666666666",
            steps: [
              {
                id: "77777777-7777-4777-8777-777777777777",
                status: "pending",
                action_type: "text",
                payload: { body: "Mensagem cadastrada" },
                idempotency_key: "teste",
              },
            ],
          },
        });
      }
      if (url === "/api/v1/messages") {
        return Promise.resolve({ data: { status: "failed", error_message: "channel_500" } });
      }
      return Promise.resolve({ data: {} });
    });
    h.patch.mockResolvedValue({ data: {} });
    renderPanel();

    fireEvent.click(screen.getByTestId("quick-reply-card-11111111-1111-4111-8111-111111111111"));

    expect(
      screen
        .getByTestId("quick-reply-card-11111111-1111-4111-8111-111111111111")
        .getAttribute("data-sending"),
    ).toBe("true");
    await waitFor(() =>
      expect(h.patch).toHaveBeenCalledWith(
        "/api/v1/message-template-executions/66666666-6666-4666-8666-666666666666",
        expect.objectContaining({ status: "failed" }),
      ),
    );
  });
});
