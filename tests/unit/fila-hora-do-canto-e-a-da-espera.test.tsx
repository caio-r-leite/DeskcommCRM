import { render, screen } from "@testing-library/react";
import { format, subDays } from "date-fns";
import { describe, expect, it } from "vitest";

import { ConversationListItem } from "@/components/inbox/ConversationListItem";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

const agora = new Date();
/** Espera medida — é ela que a Fila usa para ordenar e para numerar (#990). */
const espera = subDays(agora, 9).toISOString();
/** A última mensagem do cliente, MAIS NOVA que a espera — a régua antiga. */
const ultimaDoCliente = subDays(agora, 1).toISOString();
/** Última mensagem de qualquer lado — o que a linha mostrava. */
const atividade = subDays(agora, 12).toISOString();
/** Criação da conversa — o fallback, e o relógio mais antigo dos três. */
const criacao = subDays(agora, 300).toISOString();

const horaDaAtividade = format(new Date(atividade), "dd/MM");

const base = {
  id: "c1",
  organization_id: "org",
  contact_id: "ct1",
  channel_session_id: "s1",
  channel: "whatsapp",
  status: "open",
  last_message_at: atividade,
  last_inbound_at: ultimaDoCliente,
  awaiting_since: espera,
  last_message_preview: "olá",
  unread_count_for_assignee: 0,
  created_at: criacao,
  contacts: { id: "ct1", display_name: "Cliente", name: null, phone_number: "+595999", tags: [], is_blocked: false, is_anonymized: false },
} as unknown as ConversationWithContact;

/** `queuePosition` dado = a linha está na Fila (é o mesmo sinal que o badge usa). */
const pintar = (conv: ConversationWithContact, queuePosition?: number) =>
  render(
    <ConversationListItem
      conversation={conv}
      isSelected={false}
      onSelect={() => {}}
      queuePosition={queuePosition}
      mostrarCanal={false}
    />,
  );

describe("data da conversa na Inbox", () => {
  it("exibe a última mensagem na Fila e mantém o tempo de espera separado", () => {
    pintar(base, 3);
    expect(screen.getByTitle("Data da última mensagem")).toHaveTextContent(horaDaAtividade);
    expect(screen.getByText(/Aguardando há 9/)).toBeInTheDocument();
    expect(screen.getByLabelText("Posição 3 na fila")).toBeInTheDocument();
  });

  it("exibe a última mensagem fora da Fila", () => {
    pintar(base);
    expect(screen.getByTitle("Data da última mensagem")).toHaveTextContent(horaDaAtividade);
  });
});
