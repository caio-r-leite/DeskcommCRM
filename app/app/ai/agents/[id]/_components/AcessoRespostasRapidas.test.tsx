import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(async () => ({ data: [] })) }));
const toast = vi.hoisted(() => ({ message: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("sonner", () => ({ toast }));

import { AcessoRespostasRapidas } from "./AcessoRespostasRapidas";

function Harness() {
  const [mode, setMode] = React.useState<"none" | "selected" | "all">("selected");
  const [ids, setIds] = React.useState(["11111111-1111-4111-8111-111111111111"]);
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AcessoRespostasRapidas
        mode={mode}
        templateIds={ids}
        onModeChange={setMode}
        onTemplateIdsChange={setIds}
      />
      <output data-testid="state">{`${mode}:${ids.join(",")}`}</output>
    </QueryClientProvider>
  );
}

describe("acesso do agente a respostas rápidas", () => {
  it("recupera o formulário quando a única resposta selecionada foi excluída", async () => {
    render(<Harness />);

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("none:"));
    expect(toast.message).toHaveBeenCalledWith(
      expect.stringContaining("Uma resposta rápida excluída foi removida deste agente"),
    );
  });
});
