export type EstadoDoPainelDeRespostas = "fechado" | "recolhido" | "aberto";

/** Ciclo do raio: abre recolhido, fecha o recolhido e minimiza o painel aberto. */
export function alternarPainelDeRespostas(
  estado: EstadoDoPainelDeRespostas,
): EstadoDoPainelDeRespostas {
  if (estado === "fechado") return "recolhido";
  if (estado === "aberto") return "recolhido";
  return "fechado";
}
