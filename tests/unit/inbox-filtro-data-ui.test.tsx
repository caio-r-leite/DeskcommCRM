import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { FiltroDataConversas } from "@/components/inbox/FiltroDataConversas";
import type { FiltroDeDataDaInbox } from "@/lib/inbox/filtro-de-data";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));

function Arnes({ fila = false }: { fila?: boolean }) {
  const [value, setValue] = useState<FiltroDeDataDaInbox>({});
  return (
    <>
      <FiltroDataConversas value={value} fila={fila} onChange={setValue} />
      <output data-testid="valor">{JSON.stringify(value)}</output>
    </>
  );
}

describe("controle compacto de data da Inbox", () => {
  it("abre pelo calendário, ativa um período e oferece limpeza rápida", async () => {
    const user = userEvent.setup();
    render(<Arnes />);
    const calendario = screen.getByRole("button", { name: "Filtrar e ordenar por data" });

    expect(calendario).toHaveAttribute("aria-pressed", "false");
    await user.click(calendario);
    await user.click(screen.getByRole("button", { name: "Ontem" }));

    expect(calendario).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("valor").textContent).toContain("dataDe");
    await user.click(screen.getByRole("button", { name: "Limpar filtro de data" }));
    expect(calendario).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("valor")).toHaveTextContent("{}");
  });

  it("permite ordenar fora da Fila e explica a ordem fixa dentro dela", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Arnes />);
    await user.click(screen.getByRole("button", { name: "Filtrar e ordenar por data" }));
    await user.click(screen.getByRole("button", { name: "Mais antigas" }));
    expect(screen.getByTestId("valor")).toHaveTextContent('"ordem":"mais_antigas"');

    unmount();
    render(<Arnes fila />);
    await user.click(screen.getByRole("button", { name: "Filtrar e ordenar por data" }));
    expect(screen.getByText("Na Fila, quem espera há mais tempo permanece primeiro.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Mais antigas" })).not.toBeInTheDocument();
  });
});
