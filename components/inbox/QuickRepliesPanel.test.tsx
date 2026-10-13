import { fireEvent, render, screen } from "@testing-library/react";
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
        ],
      },
    ],
  }),
}));

import { QuickRepliesPanel } from "./QuickRepliesPanel";

describe("painel de respostas rápidas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("abre pelo olho e editar a prévia não envia nem altera o cadastro", () => {
    render(
      <QuickRepliesPanel
        conversationId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        contactId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        status="open"
        tags={[]}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByTestId("quick-replies-panel")).toBeTruthy();
    expect(screen.getAllByText("Comercial")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Revisar e enviar" }));
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
});
