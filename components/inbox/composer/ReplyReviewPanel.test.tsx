import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(async () => ({
      data: {
        drafts: [
          {
            id: "draft-1",
            revision: "rev-1",
            status: "pending",
            original_body: "Mensagem sugerida pela IA",
            edited_body: null,
            error_code: null,
            proposals: [],
          },
        ],
      },
    })),
    post: vi.fn(),
  },
}));

import { ReplyReviewPanel } from "./ReplyReviewPanel";

describe("assistência do agente na ficha lateral", () => {
  it("nasce compacta e permite expandir e recolher sem ocupar a conversa", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ReplyReviewPanel conversationId="conv-1" />
      </QueryClientProvider>,
    );

    const panel = screen.getByTestId("reply-review-panel");
    expect(panel).toHaveAttribute("data-expanded", "false");

    const toggle = screen.getByRole("button", { name: /Assistência do agente/ });
    fireEvent.click(toggle);
    expect(panel).toHaveAttribute("data-expanded", "true");
    expect(await screen.findByDisplayValue("Mensagem sugerida pela IA")).toBeTruthy();

    fireEvent.click(toggle);
    expect(panel).toHaveAttribute("data-expanded", "false");
  });
});
