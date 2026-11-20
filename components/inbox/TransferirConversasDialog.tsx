"use client";

import { useState } from "react";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Check } from "@/lib/ui/icons";
import { rotuloDoMembro } from "@/lib/users/rotulo-do-atendente";

interface Props {
  quantidade: number;
  pendente: boolean;
  prefixo: string;
  onFechar: () => void;
  onTransferir: (destino: string, motivo?: string) => void;
}

export function TransferirConversasDialog({ quantidade, pendente, prefixo, onFechar, onTransferir }: Props) {
  const t = useT();
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const membros = useAssignableMembers(true);
  const lista = membros.data ?? [];

  function confirmarTransferencia() {
    if (!destino) return;
    onTransferir(destino, motivo.trim() || undefined);
    onFechar();
  }

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {quantidade === 1
              ? t("Transferir a conversa selecionada")
              : `${t("Transferir")} ${quantidade} ${t("conversas selecionadas")}`}
          </DialogTitle>
          <DialogDescription>{t("Escolha quem vai receber o atendimento.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${prefixo}-destino`}>{t("Para quem")}</Label>
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger id={`${prefixo}-destino`}>
                <SelectValue placeholder={t("Escolha um atendente")} />
              </SelectTrigger>
              <SelectContent>
                {lista.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {rotuloDoMembro(m, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!membros.isLoading && lista.length === 0 && (
              <p className="text-xs text-text-subtle">
                {t("Nenhum atendente disponível para transferir.")}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefixo}-motivo`}>{t("Motivo (opcional)")}</Label>
            <Textarea
              id={`${prefixo}-motivo`}
              value={motivo}
              maxLength={500}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onFechar()}>
            {t("Cancelar")}
          </Button>
          <Button
            onClick={confirmarTransferencia}
            disabled={pendente || destino.length === 0}
            data-testid={`${prefixo}-transferir-confirmar`}
          >
            <Check size={14} className="mr-1.5" aria-hidden />
            {t("Transferir")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
