import { declararTools } from "./tipos";

export const TOOLS_RESPOSTAS_RAPIDAS = declararTools([
  {
    name: "crm_execute_quick_reply",
    category: "write",
    rotulo: "Executar respostas rápidas autorizadas",
    explicacao:
      "Executa o roteiro compartilhado escolhido pelo agente, mantendo textos, arquivos, etiquetas e movimentos no CRM na ordem cadastrada.",
    oQueToca: "Conversa e CRM",
    risco: "critico",
    pacotes: ["atender", "organizar"],
  },
]);
