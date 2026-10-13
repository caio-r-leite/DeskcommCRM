"use client";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface MessageTemplate {
  id: string;
  kind: "text" | "image" | "video" | "script";
  title: string;
  body: string;
  shortcut: string | null;
  owner_user_id: string | null;
  media_filename: string | null;
  media_mime: string | null;
  media_size_bytes: number | null;
  category_id: string | null;
  category: { id: string; name: string; color: string } | null;
  usage_count: number;
  last_used_at: string | null;
  steps: MessageTemplateStep[];
}

export type MessageTemplateAction =
  "text" | "image" | "video" | "wait" | "add_tag" | "move_stage" | "upsert_crm";

export interface MessageTemplateStep {
  id: string;
  template_id: string;
  position: number;
  action_type: MessageTemplateAction;
  body: string;
  wait_seconds: number;
  media_mime: string | null;
  media_size_bytes: number | null;
  media_filename: string | null;
  action_config: Record<string, unknown>;
}

/** Onda 5: templates de script (pessoais + compartilhados) para o slash-menu do composer. */
export function useMessageTemplates() {
  const podeConsultar = usePermission("message-templates.view");
  return useQuery({
    enabled: podeConsultar,
    queryKey: ["message-templates"],
    queryFn: async () => apiClient.get<{ data: MessageTemplate[] }>("/api/v1/message-templates"),
    staleTime: 60_000,
    select: (res) => res.data,
  });
}

export function useMessageTemplateCategories() {
  const podeConsultar = usePermission("message-templates.view");
  return useQuery({
    enabled: podeConsultar,
    queryKey: ["message-template-categories"],
    queryFn: async () =>
      apiClient.get<{ data: Array<{ id: string; name: string; color: string }> }>(
        "/api/v1/message-template-categories",
      ),
    staleTime: 60_000,
    select: (res) => res.data,
  });
}
