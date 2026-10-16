import type { MessageTemplate } from "@/hooks/inbox/useMessageTemplates";

/**
 * Normaliza como a pessoa procura, não como o cadastro foi digitado:
 * "máquina", "maquina" e "maquina-mini" encontram as mesmas palavras.
 */
export function normalizarBuscaDeRespostaRapida(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[_\-–—/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function respostaRapidaCorresponde(template: MessageTemplate, query: string): boolean {
  const termos = normalizarBuscaDeRespostaRapida(query).split(" ").filter(Boolean);
  if (termos.length === 0) return true;

  const textoPesquisavel = normalizarBuscaDeRespostaRapida(
    [
      template.title,
      template.shortcut,
      template.body,
      template.media_filename,
      template.category?.name,
      ...template.steps.flatMap((step) => [step.body, step.media_filename]),
    ]
      .filter(Boolean)
      .join(" "),
  );

  // Todas as palavras precisam existir, mas podem estar em campos diferentes.
  // Assim "apre nao" encontra o atalho `apre_nao_ourives` sem tornar a busca
  // frouxa demais para listas grandes.
  return termos.every((termo) => textoPesquisavel.includes(termo));
}
