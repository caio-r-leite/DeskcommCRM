import { describe, expect, it } from "vitest";

import { listConversationsHandler } from "@/app/api/v1/conversations/_handler";

interface Chamada {
  tabela: string;
  metodo: string;
  args: unknown[];
}

function fakeSupabase() {
  const chamadas: Chamada[] = [];
  const client = {
    from: (tabela: string) => {
      const proxy: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              return (ok: (v: unknown) => unknown) => ok({ data: [], error: null });
            }
            return (...args: unknown[]) => {
              chamadas.push({ tabela, metodo: String(prop), args });
              return proxy;
            };
          },
        },
      );
      return proxy;
    },
  };
  return { client: client as never, chamadas };
}

const ctx = {
  organization_id: "org-1",
  requestId: "req-1",
  actor: { type: "user" as const, id: "user-1" },
} as never;

async function listar(query: Record<string, unknown>) {
  const { client, chamadas } = fakeSupabase();
  await listConversationsHandler(client, ctx, { limit: 50, ...query } as never);
  return chamadas.filter((c) => c.tabela === "conversations");
}

describe("data da última mensagem filtra e ordena no banco", () => {
  it("aplica os dois limites inclusivos antes da paginação", async () => {
    const de = "2026-10-01T03:00:00.000Z";
    const ate = "2026-11-01T02:59:59.999Z";
    const chamadas = await listar({ ultima_mensagem_de: de, ultima_mensagem_ate: ate });
    expect(chamadas.some((c) => c.metodo === "gte" && c.args.join(":") === `last_message_at:${de}`)).toBe(true);
    expect(chamadas.some((c) => c.metodo === "lte" && c.args.join(":") === `last_message_at:${ate}`)).toBe(true);
    expect(chamadas.some((c) => c.metodo === "eq" && c.args.join(":") === "organization_id:org-1")).toBe(true);
  });

  it("ordena as abas comuns da mais antiga para a mais recente", async () => {
    const ordens = (await listar({ ordem: "mais_antigas" })).filter((c) => c.metodo === "order");
    expect(ordens[0]?.args).toEqual(["last_message_at", { ascending: true, nullsFirst: false }]);
    expect(ordens[1]?.args).toEqual(["id", { ascending: true }]);
  });

  it("a preferência não altera a prioridade operacional da Fila", async () => {
    const ordens = (await listar({ comando: ["aguardando"], ordem: "mais_recentes" })).filter(
      (c) => c.metodo === "order",
    );
    expect(ordens[0]?.args).toEqual(["awaiting_since", { ascending: true, nullsFirst: false }]);
  });
});
