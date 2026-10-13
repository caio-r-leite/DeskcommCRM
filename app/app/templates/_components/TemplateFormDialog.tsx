"use client";

import { useT } from "@/hooks/i18n/useT";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { MessageTemplate } from "@/hooks/inbox/useMessageTemplates";
import { ChatCircle, ImageIcon, VideoCamera } from "@/lib/ui/icons";
import { MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";

const TEMPLATES_KEY = ["message-templates"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canShare: boolean;
  template?: MessageTemplate | null;
}

interface CreateInput {
  kind: "text";
  title: string;
  body: string;
  shortcut?: string;
  shared?: boolean;
}

interface UpdateInput {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
}

export function TemplateFormDialog({ open, onOpenChange, canShare, template }: Props) {
  const t = useT();
  const isEdit = !!template;
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [shortcut, setShortcut] = React.useState("");
  const [shared, setShared] = React.useState(false);
  const [kind, setKind] = React.useState<"text" | "image" | "video">("text");
  const [file, setFile] = React.useState<File | null>(null);

  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: async (input: { path: string; body: CreateInput | FormData }) =>
      apiClient.post<{ data: MessageTemplate }>(input.path, input.body),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
  const update = useMutation({
    mutationFn: async ({ id, ...input }: UpdateInput) =>
      apiClient.patch<{ data: MessageTemplate }>(`/api/v1/message-templates/${id}`, input),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
  const pending = create.isPending || update.isPending;

  React.useEffect(() => {
    if (!open) return;
    setTitle(template?.title ?? "");
    setBody(template?.body ?? "");
    setShortcut(template?.shortcut ?? "");
    setShared(template ? template.owner_user_id === null : false);
    setKind(template?.kind === "image" || template?.kind === "video" ? template.kind : "text");
    setFile(null);
  }, [open, template]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: template.id,
          title,
          body,
          shortcut: shortcut.trim() || null,
        });
        toast.success(t("Template atualizado."));
      } else {
        if (kind === "text") {
          await create.mutateAsync({
            path: "/api/v1/message-templates",
            body: {
              kind,
              title,
              body,
              shortcut: shortcut.trim() || undefined,
              shared: canShare ? shared : false,
            },
          });
        } else {
          if (!file) {
            toast.error(t("Escolha um arquivo."));
            return;
          }
          if (file.size > MAX_MEDIA_BYTES) {
            toast.error(t("Arquivo acima de 50MB."));
            return;
          }
          if (!file.type.startsWith(`${kind}/`)) {
            toast.error(t("O arquivo não corresponde ao tipo escolhido."));
            return;
          }
          const form = new FormData();
          form.set("file", file);
          form.set(
            "payload",
            JSON.stringify({
              kind,
              title,
              body,
              shortcut: shortcut.trim() || undefined,
              shared: canShare ? shared : false,
            }),
          );
          await create.mutateAsync({ path: "/api/v1/message-templates/media", body: form });
        }
        toast.success(t("Template criado."));
      }
      onOpenChange(false);
    } catch {
      /* erro já mostrado pelo showApiError */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("Editar template") : t("Novo template")}</DialogTitle>
          <DialogDescription>
            {t("Scripts salvos para responder mais rápido no atendimento.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("Tipo de resposta")}</Label>
            <div
              className="grid grid-cols-3 gap-2"
              role="radiogroup"
              aria-label={t("Tipo de resposta")}
            >
              {(
                [
                  ["text", t("Texto"), ChatCircle],
                  ["image", t("Foto"), ImageIcon],
                  ["video", t("Vídeo"), VideoCamera],
                ] as const
              ).map(([value, label, Icon]) => (
                <Button
                  key={value}
                  type="button"
                  variant={kind === value ? "default" : "outline"}
                  className="gap-2"
                  role="radio"
                  aria-checked={kind === value}
                  disabled={isEdit}
                  onClick={() => {
                    setKind(value);
                    setFile(null);
                  }}
                >
                  <Icon aria-hidden /> {label}
                </Button>
              ))}
            </div>
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                {t("O tipo e o arquivo não mudam na edição. Para trocar, crie outra resposta.")}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-title">{t("Título")}</Label>
            <Input
              id="tpl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("Saudação inicial")}
              minLength={1}
              maxLength={80}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-body">
              {kind === "text" ? t("Mensagem") : t("Legenda (opcional)")}
            </Label>
            <Textarea
              id="tpl-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("Oi {{primeiro_nome}}, tudo bem?")}
              minLength={kind === "text" ? 1 : undefined}
              maxLength={4096}
              required={kind === "text"}
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              {t("Use")} {"{{primeiro_nome}}"} {t("e")} {"{{nome}}"} {t("para personalizar.")}
            </p>
          </div>
          {kind !== "text" && !isEdit && (
            <div className="space-y-2">
              <Label htmlFor="tpl-file">{kind === "image" ? t("Foto") : t("Vídeo")}</Label>
              <Input
                id="tpl-file"
                type="file"
                accept={kind === "image" ? "image/*" : "video/*"}
                required
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">{t("Tamanho máximo: 50MB.")}</p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="tpl-shortcut">{t("Atalho (opcional)")}</Label>
            <Input
              id="tpl-shortcut"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              placeholder="oi"
              maxLength={40}
            />
          </div>
          {canShare && (
            <div className="flex items-center gap-2">
              <Switch
                id="tpl-shared"
                checked={shared}
                onCheckedChange={setShared}
                disabled={isEdit}
              />
              <Label htmlFor="tpl-shared">{t("Compartilhar com a equipe")}</Label>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={pending}>
              {isEdit ? t("Salvar") : t("Criar template")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
