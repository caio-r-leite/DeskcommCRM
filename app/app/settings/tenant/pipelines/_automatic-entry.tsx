"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import { ArrowRight, Kanban } from "@/lib/ui/icons";

export interface FunilDaEntradaAutomatica {
  id: string;
  name: string;
  is_default: boolean;
  entry_stage_id: string | null;
}

export interface EtapaDaEntradaAutomatica {
  id: string;
  name: string;
  is_archived: boolean;
  is_won: boolean;
  is_lost: boolean;
}

function abertas(etapas: EtapaDaEntradaAutomatica[] | undefined) {
  return (etapas ?? []).filter((e) => !e.is_archived && !e.is_won && !e.is_lost);
}

/**
 * Superfície única da política que `nascimento-do-lead.ts` executa.
 * O fallback para a primeira etapa continua existindo no runtime; aqui ele
 * aparece selecionado, para a configuração nunca ficar invisível.
 */
export function EntradaAutomatica({
  pipelines,
  etapas,
}: {
  pipelines: FunilDaEntradaAutomatica[];
  etapas: Record<string, EtapaDaEntradaAutomatica[]>;
}) {
  const t = useT();
  const router = useRouter();
  const inicial = pipelines.find((p) => p.is_default) ?? pipelines[0] ?? null;
  const etapaInicial =
    abertas(inicial ? etapas[inicial.id] : undefined).find((e) => e.id === inicial?.entry_stage_id)
      ?.id ??
    abertas(inicial ? etapas[inicial.id] : undefined)[0]?.id ??
    "";

  const [pipelineId, setPipelineId] = useState(inicial?.id ?? "");
  const [stageId, setStageId] = useState(etapaInicial);
  const [salvo, setSalvo] = useState({
    pipelineId: inicial?.id ?? "",
    // Configuração antiga sem escolha explícita herda a primeira etapa e já
    // está correta. Uma referência NÃO nula que ficou inválida (por exemplo,
    // a etapa foi arquivada) permanece diferente do fallback mostrado, para o
    // botão ficar habilitado e o operador conseguir reparar com um clique.
    stageId: inicial?.entry_stage_id ?? etapaInicial,
  });
  const [salvando, setSalvando] = useState(false);
  const opcoesDeEtapa = useMemo(() => abertas(etapas[pipelineId]), [etapas, pipelineId]);

  function escolherFunil(id: string) {
    setPipelineId(id);
    const funil = pipelines.find((p) => p.id === id);
    const opcoes = abertas(etapas[id]);
    setStageId(opcoes.find((e) => e.id === funil?.entry_stage_id)?.id ?? opcoes[0]?.id ?? "");
  }

  async function salvar() {
    if (!pipelineId || !stageId) return;
    setSalvando(true);
    try {
      await apiClient.post("/api/v1/pipelines/automatic-entry", {
        pipeline_id: pipelineId,
        stage_id: stageId,
      });
      setSalvo({ pipelineId, stageId });
      toast.success(t("Entrada automática salva."));
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : t("Não consegui salvar a entrada automática."),
      );
    } finally {
      setSalvando(false);
    }
  }

  if (pipelines.length === 0) return null;

  return (
    <Card className="space-y-4 border-primary/20 bg-primary/[0.03] p-5">
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Kanban size={20} weight="duotone" aria-hidden />
        </div>
        <div>
          <h2 className="text-base font-semibold">{t("Card automático no CRM")}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t(
              "Quando um contato envia uma mensagem e ainda não tem negócio aberto, o Deskcomm cria um card neste destino. Mensagens seguintes continuam no mesmo card.",
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="funil-da-entrada-automatica">{t("Fluxo de entrada")}</Label>
          <Select value={pipelineId} onValueChange={escolherFunil} disabled={salvando}>
            <SelectTrigger id="funil-da-entrada-automatica" aria-label={t("Fluxo de entrada")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ArrowRight className="mb-2 hidden text-muted-foreground md:block" aria-hidden />

        <div className="space-y-2">
          <Label htmlFor="coluna-da-entrada-automatica">{t("Coluna inicial")}</Label>
          <Select
            value={stageId}
            onValueChange={setStageId}
            disabled={salvando || opcoesDeEtapa.length === 0}
          >
            <SelectTrigger id="coluna-da-entrada-automatica" aria-label={t("Coluna inicial")}>
              <SelectValue placeholder={t("Nenhuma coluna aberta")} />
            </SelectTrigger>
            <SelectContent>
              {opcoesDeEtapa.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={salvar}
          disabled={
            salvando ||
            !pipelineId ||
            !stageId ||
            (salvo.pipelineId === pipelineId && salvo.stageId === stageId)
          }
        >
          {salvando ? t("Salvando…") : t("Salvar destino")}
        </Button>
      </div>

      {opcoesDeEtapa.length === 0 && (
        <p className="text-sm text-destructive" role="alert">
          {t(
            "Este funil não tem coluna aberta. Crie ou reative uma coluna antes de usá-lo como entrada.",
          )}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {t(
          "Contatos bloqueados ou marcados como pessoais não viram oportunidade. Campanhas com destino próprio continuam respeitando o destino da campanha.",
        )}
      </p>
    </Card>
  );
}
