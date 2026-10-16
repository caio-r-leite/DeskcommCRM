"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { definirConfiguracaoDoArquivamento } from "@/app/actions/settings/definirConfiguracaoDoArquivamento";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import type { ConfiguracaoDoArquivamento } from "@/lib/inbox/configuracao-do-arquivamento";

export function ConfiguracaoDoArquivamentoForm({
  initial,
}: {
  initial: ConfiguracaoDoArquivamento;
}) {
  const t = useT();
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();

  function salvar() {
    startTransition(async () => {
      const result = await definirConfiguracaoDoArquivamento(form);
      if (!result.ok) {
        toast.error(t("Não foi possível salvar a configuração de arquivamento."));
        return;
      }
      setForm(result.data);
      toast.success(t("Configuração de arquivamento atualizada."));
    });
  }

  return (
    <Card className="max-w-2xl space-y-4 p-6">
      <div>
        <h2 className="font-semibold">{t("Arquivamento no Inbox")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Antes de arquivar, mostre uma janela curta para manter, mover ou excluir o card do CRM.",
          )}
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div>
          <Label htmlFor="archive-dialog-enabled">{t("Mostrar janela ao arquivar")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("Desligado: a conversa é arquivada imediatamente e o card do CRM não muda.")}
          </p>
        </div>
        <Switch
          id="archive-dialog-enabled"
          checked={form.enabled}
          onCheckedChange={(enabled) => setForm((current) => ({ ...current, enabled }))}
        />
      </div>
      <div className="max-w-xs space-y-2">
        <Label htmlFor="archive-dialog-duration">
          {t("Tempo antes da ação padrão (segundos)")}
        </Label>
        <Input
          id="archive-dialog-duration"
          type="number"
          min={1}
          max={60}
          disabled={!form.enabled}
          value={form.duration_seconds}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              duration_seconds: Math.max(1, Math.min(60, Number(event.target.value) || 1)),
            }))
          }
        />
        <p className="text-xs text-muted-foreground">
          {t("Sem interação, a conversa é arquivada e o card permanece na etapa atual.")}
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="button" disabled={pending} onClick={salvar}>
          {pending ? t("Salvando…") : t("Salvar configuração")}
        </Button>
      </div>
    </Card>
  );
}
