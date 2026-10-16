import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationHeader } from "./ConversationHeader";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

/**
 * "Fechar" e "Arquivar" usavam `window.confirm()` — mesmo defeito documentado
 * em `app/app/tasks/_components/ListaDeTarefas.tsx`: bloqueado em iframe,
 * ignora o tema, não passa por `t()`. Fechar usa o `AlertDialog` da casa;
 * arquivar usa a janela temporizada com opções do CRM. Em ambos, o botão só
 * abre a janela e a mutação depende da ação explícita ou do prazo configurado.
 */

const closeMutate = vi.hoisted(() => vi.fn());
const arquivarMutate = vi.hoisted(() => vi.fn());
const startCall = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", support: null } }),
}));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useReleaseConversation", () => ({
  useReleaseConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useCloseConversation", () => ({
  useCloseConversation: () => ({ mutate: closeMutate, isPending: false }),
  useReopenConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveConversation: () => ({
    mutate: arquivarMutate,
    mutateAsync: (...args: unknown[]) => {
      arquivarMutate(...args);
      return Promise.resolve();
    },
    isPending: false,
  }),
}));
vi.mock("@/hooks/inbox/useResumeAiAttendance", () => ({
  useResumeAiAttendance: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/usePauseAiAttendance", () => ({
  usePauseAiAttendance: () => ({ mutate: vi.fn(), isPending: false }),
}));
// Spec 21, etapa 15: o cabeçalho chama os hooks de pessoal em toda
// renderização (antes dos early returns) — sem este mock, o `useMutation` real
// exigiria QueryClientProvider e o teste inteiro caía.
vi.mock("@/hooks/contacts/usePersonalContact", () => ({
  useMarkPersonalContact: () => ({ mutate: vi.fn(), isPending: false }),
  useUnmarkPersonalContact: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/ai/useAutomaticoAtivo", () => ({
  useAutomaticoAtivo: () => ({ data: false }),
}));
vi.mock("@/components/kanban/OwnerBadge", () => ({ OwnerBadge: () => null }));
vi.mock("@/components/inbox/ReassignDialog", () => ({ ReassignDialog: () => null }));
vi.mock("@/components/inbox/SnoozeButton", () => ({ SnoozeButton: () => null }));
vi.mock("@/components/inbox/JanelaSelo", () => ({ JanelaSelo: () => null }));
vi.mock("@/components/inbox/ChannelLogo", () => ({ ChannelLogo: () => null }));
vi.mock("@/hooks/voice/useVoiceSessionStatus", () => ({
  useVoiceSessionStatus: () => ({ data: { configured: true, paired: true } }),
}));
vi.mock("@/components/voice/VoiceCallContext", () => ({
  useVoiceCall: () => ({ call: null, startCall }),
}));

function conversa(status: string): ConversationWithContact {
  return {
    id: "conv-1",
    organization_id: "org-1",
    contact_id: "contato-1",
    channel_session_id: "sess-1",
    channel: "whatsapp",
    status,
    status_changed_at: new Date().toISOString(),
    service_revision: 3,
    assigned_to_user_id: null,
    assigned_to_user_name: null,
    assignee_kind: null,
    assigned_at: null,
    last_inbound_at: null,
    last_outbound_at: null,
    last_message_at: null,
    last_message_preview: null,
    unread_count_for_assignee: 0,
    is_group: false,
    group_chat_id: null,
    tags: [],
    metadata: {},
    snooze_until: null,
    contacts: null,
    channel_sessions: null,
  } as unknown as ConversationWithContact;
}

beforeEach(() => {
  closeMutate.mockReset();
  arquivarMutate.mockReset();
  startCall.mockReset();
});

describe("ConversationHeader — chamada de voz na Inbox", () => {
  it("mostra Chamar e liga para o contato da conversa", async () => {
    const user = userEvent.setup();
    const atual = conversa("open");
    atual.contacts = {
      id: "contato-1",
      display_name: "Raphael",
      name: "Raphael",
      phone_number: "+5511999999999",
      tags: [],
      is_blocked: false,
      is_personal: false,
      is_anonymized: false,
    };
    render(<ConversationHeader conversation={atual} />);

    await user.click(screen.getByRole("button", { name: "Chamar" }));
    expect(startCall).toHaveBeenCalledWith("contato-1");
  });

  it("não oferece chamada individual para um grupo", () => {
    const atual = conversa("open");
    atual.is_group = true;
    atual.contacts = {
      id: "contato-1",
      display_name: "Grupo",
      name: "Grupo",
      phone_number: "+5511999999999",
      tags: [],
      is_blocked: false,
      is_personal: false,
      is_anonymized: false,
    };
    render(<ConversationHeader conversation={atual} />);
    expect(screen.queryByRole("button", { name: "Chamar" })).toBeNull();
  });
});

describe("ConversationHeader — confirmação de Fechar e Arquivar", () => {
  it("Fechar pede confirmação e só encerra no clique de dentro do diálogo", async () => {
    const user = userEvent.setup();
    render(<ConversationHeader conversation={conversa("open")} />);

    await user.click(screen.getByRole("button", { name: "Fechar" }));

    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Fechar esta conversa?")).toBeTruthy();
    expect(closeMutate).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(closeMutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Fechar" }));
    const dialogo2 = await screen.findByRole("alertdialog");
    await user.click(within(dialogo2).getByRole("button", { name: "Fechar" }));

    await waitFor(() => expect(closeMutate).toHaveBeenCalledTimes(1));
    expect(closeMutate).toHaveBeenCalledWith({
      conversation_id: "conv-1",
      expected_revision: 3,
    });
  });

  it("Arquivar, numa conversa aberta, avisa que o atendimento é encerrado junto", async () => {
    const user = userEvent.setup();
    render(<ConversationHeader conversation={conversa("open")} />);

    await user.click(screen.getByRole("button", { name: "Arquivar" }));

    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Arquivar esta conversa?")).toBeTruthy();
    expect(
      within(dialogo).getByText(
        "Como esta conversa está aberta, arquivar também encerra o atendimento atual.",
      ),
    ).toBeTruthy();
    expect(arquivarMutate).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole("button", { name: "Arquivar agora" }));
    await waitFor(() => expect(arquivarMutate).toHaveBeenCalledTimes(1));
    expect(arquivarMutate).toHaveBeenCalledWith({
      conversation_id: "conv-1",
      expected_revision: 3,
    });
  });

  it("Arquivar, numa conversa já encerrada, não repete o aviso de encerramento", async () => {
    const user = userEvent.setup();
    render(<ConversationHeader conversation={conversa("closed")} />);

    await user.click(screen.getByRole("button", { name: "Arquivar" }));

    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Arquivar esta conversa?")).toBeTruthy();
    expect(
      screen.queryByText(
        "Como esta conversa está aberta, arquivar também encerra o atendimento atual.",
      ),
    ).toBeNull();
  });

  it("arquiva direto quando a organização desativa a janela", async () => {
    const user = userEvent.setup();
    render(
      <ConversationHeader
        conversation={conversa("open")}
        archiveDialogConfig={{ enabled: false, duration_seconds: 3 }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Arquivar" }));

    await waitFor(() => expect(arquivarMutate).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ConversationHeader — busca dentro da conversa (#1793)", () => {
  it("o botão só existe com quem o atenda, e só abre a busca — nenhuma ação de atendimento", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ConversationHeader conversation={conversa("open")} />);
    expect(screen.queryByRole("button", { name: "Buscar nesta conversa" })).toBeNull();

    const buscar = vi.fn();
    rerender(
      <ConversationHeader conversation={conversa("open")} onBuscar={buscar} buscaAberta={false} />,
    );
    const botao = screen.getByRole("button", { name: "Buscar nesta conversa" });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    await user.click(botao);
    expect(buscar).toHaveBeenCalledOnce();
    expect(closeMutate).not.toHaveBeenCalled();
    expect(arquivarMutate).not.toHaveBeenCalled();
  });
});
