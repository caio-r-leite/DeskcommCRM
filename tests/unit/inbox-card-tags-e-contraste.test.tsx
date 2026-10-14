import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConversationListItem } from "@/components/inbox/ConversationListItem";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

const conversa = {
  id: "c1",
  organization_id: "org",
  contact_id: "ct1",
  channel_session_id: "s1",
  channel: "whatsapp",
  status: "open",
  tags: ["teste", "OURIVES"],
  last_message_at: new Date().toISOString(),
  last_message_preview: "tenho interesse",
  unread_count_for_assignee: 0,
  created_at: new Date().toISOString(),
  contacts: {
    id: "ct1",
    display_name: "Caio",
    name: null,
    phone_number: "+5511996297276",
    tags: ["vip", "teste"],
    is_blocked: false,
    is_anonymized: false,
  },
} as unknown as ConversationWithContact;

describe("card da conversa", () => {
  it("mostra a união sem duplicar tags da conversa e do contato", () => {
    render(<ConversationListItem conversation={conversa} isSelected={false} onSelect={() => {}} />);
    expect(screen.getByText("teste")).toBeInTheDocument();
    expect(screen.getByText("OURIVES")).toBeInTheDocument();
    expect(screen.getByText("vip")).toBeInTheDocument();
    expect(screen.getAllByText("teste")).toHaveLength(1);
  });

  it("usa fundo semântico no estado selecionado, não a cor clara literal", () => {
    render(<ConversationListItem conversation={conversa} isSelected onSelect={() => {}} />);
    const card = screen.getByRole("button", { name: /Caio/ });
    expect(card.className).toContain("bg-accent-soft");
    expect(card.className).not.toContain("bg-accent-50");
    expect(screen.getByText("Caio")).toBeVisible();
  });
});
