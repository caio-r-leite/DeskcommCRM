export type OrdemDasConversas = "mais_recentes" | "mais_antigas";

export interface FiltroDeDataDaInbox {
  dataDe?: string;
  dataAte?: string;
  ordem?: OrdemDasConversas;
}

function dois(n: number): string {
  return String(n).padStart(2, "0");
}

export function dataLocalParaCampo(data: Date): string {
  return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`;
}

export function inicioLocalEmIso(data?: string): string | undefined {
  if (!data) return undefined;
  const [ano, mes, dia] = data.split("-").map(Number);
  if (!ano || !mes || !dia) return undefined;
  return new Date(ano, mes - 1, dia, 0, 0, 0, 0).toISOString();
}

export function fimLocalEmIso(data?: string): string | undefined {
  if (!data) return undefined;
  const [ano, mes, dia] = data.split("-").map(Number);
  if (!ano || !mes || !dia) return undefined;
  return new Date(ano, mes - 1, dia, 23, 59, 59, 999).toISOString();
}

export function periodoRapido(
  tipo: "ontem" | "ultimos_7_dias" | "ultimos_30_dias",
  agora = new Date(),
): Pick<FiltroDeDataDaInbox, "dataDe" | "dataAte"> {
  const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const inicio = new Date(fim);

  if (tipo === "ontem") {
    inicio.setDate(inicio.getDate() - 1);
    fim.setDate(fim.getDate() - 1);
  } else {
    inicio.setDate(inicio.getDate() - (tipo === "ultimos_7_dias" ? 6 : 29));
  }

  return { dataDe: dataLocalParaCampo(inicio), dataAte: dataLocalParaCampo(fim) };
}

export function periodoDoMes(mes: string): Pick<FiltroDeDataDaInbox, "dataDe" | "dataAte"> {
  const [ano, numeroDoMes] = mes.split("-").map(Number);
  if (!ano || !numeroDoMes) return {};
  const inicio = new Date(ano, numeroDoMes - 1, 1);
  const fim = new Date(ano, numeroDoMes, 0);
  return { dataDe: dataLocalParaCampo(inicio), dataAte: dataLocalParaCampo(fim) };
}

export function intervaloDeDataValido(dataDe?: string, dataAte?: string): boolean {
  return !dataDe || !dataAte || dataDe <= dataAte;
}
