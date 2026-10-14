import { describe, expect, it } from "vitest";

import {
  dataLocalParaCampo,
  fimLocalEmIso,
  inicioLocalEmIso,
  intervaloDeDataValido,
  periodoDoMes,
  periodoRapido,
} from "@/lib/inbox/filtro-de-data";
import { listConversationsQuerySchema } from "@/lib/schemas";

describe("filtro de data da Inbox", () => {
  it("ontem cobre somente o dia anterior", () => {
    expect(periodoRapido("ontem", new Date(2026, 9, 14, 15))).toEqual({
      dataDe: "2026-10-13",
      dataAte: "2026-10-13",
    });
  });

  it("últimos 7 e 30 dias incluem hoje", () => {
    const agora = new Date(2026, 9, 14, 15);
    expect(periodoRapido("ultimos_7_dias", agora)).toEqual({
      dataDe: "2026-10-08",
      dataAte: "2026-10-14",
    });
    expect(periodoRapido("ultimos_30_dias", agora)).toEqual({
      dataDe: "2026-09-15",
      dataAte: "2026-10-14",
    });
  });

  it("mês específico respeita meses de tamanhos diferentes", () => {
    expect(periodoDoMes("2024-02")).toEqual({ dataDe: "2024-02-01", dataAte: "2024-02-29" });
    expect(periodoDoMes("2026-11")).toEqual({ dataDe: "2026-11-01", dataAte: "2026-11-30" });
  });

  it("converte início e fim do dia local em limites UTC inclusivos", () => {
    const campo = dataLocalParaCampo(new Date(2026, 9, 14));
    expect(campo).toBe("2026-10-14");
    expect(new Date(inicioLocalEmIso(campo)!).getTime()).toBe(
      new Date(2026, 9, 14, 0, 0, 0, 0).getTime(),
    );
    expect(new Date(fimLocalEmIso(campo)!).getTime()).toBe(
      new Date(2026, 9, 14, 23, 59, 59, 999).getTime(),
    );
  });

  it("identifica intervalo invertido", () => {
    expect(intervaloDeDataValido("2026-10-15", "2026-10-14")).toBe(false);
    expect(intervaloDeDataValido("2026-10-14", "2026-10-14")).toBe(true);
    expect(intervaloDeDataValido("2026-10-14", undefined)).toBe(true);
  });

  it("o contrato HTTP aceita limites ISO e as duas ordens", () => {
    expect(
      listConversationsQuerySchema.parse({
        ultima_mensagem_de: "2026-10-01T03:00:00.000Z",
        ultima_mensagem_ate: "2026-11-01T02:59:59.999Z",
        ordem: "mais_antigas",
      }),
    ).toMatchObject({ ordem: "mais_antigas" });
    expect(listConversationsQuerySchema.safeParse({ ordem: "aleatoria" }).success).toBe(false);
  });
});
