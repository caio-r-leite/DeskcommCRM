"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { ConfiguracaoDoArquivamento } from "@/lib/inbox/configuracao-do-arquivamento";
import { cn } from "@/lib/utils";

interface EtapaDoLead {
  id: string;
  name: string;
  is_won: boolean;
  is_lost: boolean;
}

interface LeadDoResumo {
  id: string;
  title: string;
  pipeline_id: string;
  stage_id?: string;
  funil_nome: string | null;
  etapa_nome: string | null;
  etapas_do_funil?: EtapaDoLead[];
}

type AcaoDoCard = "keep" | "move" | "delete";

interface Props {
  open: boolean;
  config: ConfiguracaoDoArquivamento;
  quantidade: number;
  /** Só existe quando exatamente uma conversa está sendo arquivada. */
  contactId?: string | null;
  pending?: boolean;
  /** Em conversa ainda viva, arquivar também encerra o atendimento atual. */
  encerraAtendimento?: boolean;
  onCancel: () => void;
  onArchive: () => Promise<void>;
}

/**
 * A única janela de arquivamento, usada tanto no cabeçalho quanto no lote.
 *
 * O caminho automático e o clique na cortina SEMPRE fazem só o padrão seguro:
 * arquivar a conversa e manter o CRM como está. Excluir ou mover card exige
 * escolha e clique explícitos; nunca herdam o timer.
 */
export function ArchiveConversationDialog({
  open,
  config,
  quantidade,
  contactId,
  pending = false,
  encerraAtendimento = false,
  onCancel,
  onArchive,
}: Props) {
  const t = useT();
  const [acao, setAcao] = useState<AcaoDoCard>("keep");
  const [leadId, setLeadId] = useState("");
  const [stageId, setStageId] = useState("");
  const [executando, setExecutando] = useState(false);
  const [segundos, setSegundos] = useState(config.duration_seconds);
  const [contagemPausada, setContagemPausada] = useState(false);
  const [crm, setCrm] = useState<{
    contactId: string;
    leads: LeadDoResumo[];
    erro: boolean;
  } | null>(null);
  const executouRef = useRef(false);
  const onArchiveRef = useRef(onArchive);
  const onCancelRef = useRef(onCancel);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const consultaCrmAtiva = open && quantidade === 1 && !!contactId;
  const leads = useMemo(
    () => (consultaCrmAtiva && crm?.contactId === contactId ? crm.leads : []),
    [contactId, consultaCrmAtiva, crm],
  );
  const carregandoCrm = consultaCrmAtiva && crm?.contactId !== contactId;
  const erroCrm = consultaCrmAtiva && crm?.contactId === contactId && crm.erro;
  const lead = useMemo(
    () => leads.find((item) => item.id === leadId) ?? leads[0] ?? null,
    [leadId, leads],
  );
  const etapas = lead?.etapas_do_funil ?? [];
  const stageIdEfetivo =
    stageId || etapas.find((item) => item.id !== lead?.stage_id)?.id || "";

  useEffect(() => {
    onArchiveRef.current = onArchive;
    onCancelRef.current = onCancel;
  }, [onArchive, onCancel]);

  useEffect(() => {
    if (!open || quantidade !== 1 || !contactId) return;
    let cancelled = false;
    apiClient
      .get<{ data: { leads: LeadDoResumo[] } }>(`/api/v1/contacts/${contactId}/crm-summary`)
      .then((response) => {
        if (!cancelled) setCrm({ contactId, leads: response.data.leads, erro: false });
      })
      .catch(() => {
        if (!cancelled) setCrm({ contactId, leads: [], erro: true });
      });
    return () => {
      cancelled = true;
    };
  }, [contactId, open, quantidade]);

  const limparRelogio = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }, []);

  const pausarContagem = useCallback(() => {
    if (executouRef.current) return;
    limparRelogio();
    setContagemPausada(true);
  }, [limparRelogio]);

  const concluirArquivamento = useCallback(async () => {
    try {
      await onArchiveRef.current();
      onCancelRef.current();
      return true;
    } catch {
      // O hook de arquivamento já mostrou o erro canônico.
      executouRef.current = false;
      return false;
    }
  }, []);

  // Separado da ação de CRM para a chegada assíncrona dos cards não reiniciar
  // o relógio. O padrão não depende de card, etapa ou consulta alguma.
  const executarPadrao = useCallback(async () => {
    if (executouRef.current || pending) return;
    executouRef.current = true;
    limparRelogio();
    setExecutando(true);
    await concluirArquivamento();
    setExecutando(false);
  }, [concluirArquivamento, limparRelogio, pending]);

  const executar = useCallback(
    async (escolha: AcaoDoCard) => {
      if (escolha === "keep") {
        await executarPadrao();
        return;
      }
      if (executouRef.current || pending) return;
      executouRef.current = true;
      limparRelogio();
      setExecutando(true);

      try {
        if (!lead) {
          executouRef.current = false;
          toast.error(t("Escolha um card do CRM."));
          return;
        }
        if (escolha === "move") {
          if (!stageIdEfetivo || stageIdEfetivo === lead.stage_id) {
            executouRef.current = false;
            toast.error(t("Escolha uma nova etapa para o card."));
            return;
          }
          await apiClient.post("/api/v1/leads/bulk", {
            action: "move",
            lead_ids: [lead.id],
            params: { stage_id: stageIdEfetivo },
          });
        } else {
          await apiClient.post("/api/v1/leads/bulk", {
            action: "delete",
            lead_ids: [lead.id],
            params: {},
          });
        }
        const arquivou = await concluirArquivamento();
        if (!arquivou) {
          toast.warning(
            t("O card foi alterado, mas a conversa não foi arquivada. Tente arquivar novamente."),
          );
        }
      } catch (error) {
        showApiError(error);
        executouRef.current = false;
      } finally {
        setExecutando(false);
      }
    },
    [concluirArquivamento, executarPadrao, lead, limparRelogio, pending, stageIdEfetivo, t],
  );

  useEffect(() => {
    if (!open) {
      limparRelogio();
      return;
    }

    const inicio = Date.now();
    const duracao = config.duration_seconds * 1_000;
    intervalRef.current = setInterval(() => {
      setSegundos(Math.max(0, Math.ceil((duracao - (Date.now() - inicio)) / 1_000)));
    }, 100);
    timeoutRef.current = setTimeout(() => void executarPadrao(), duracao);
    return limparRelogio;
  }, [config.duration_seconds, executarPadrao, limparRelogio, open]);

  const bloqueado = pending || executando;
  const podeAlterarCard = quantidade === 1 && !!contactId && leads.length > 0;
  const rotuloConfirmar =
    acao === "delete"
      ? t("Excluir card e arquivar")
      : acao === "move"
        ? t("Mover card e arquivar")
        : t("Arquivar agora");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !bloqueado) onCancel();
      }}
    >
      <DialogContent
        data-testid="archive-conversation-dialog"
        onPointerDownCapture={pausarContagem}
        onPointerDownOutside={(event) => {
          event.preventDefault();
          void executarPadrao();
        }}
        onEscapeKeyDown={(event) => {
          if (bloqueado) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {quantidade === 1
              ? t("Arquivar esta conversa?")
              : `${t("Arquivar conversas selecionadas")} (${quantidade})`}
          </DialogTitle>
          <DialogDescription>
            {t(
              "A ação padrão arquiva a conversa e mantém o card do CRM na etapa atual. Uma nova mensagem do cliente faz a conversa voltar ao Inbox.",
            )}
            {encerraAtendimento && (
              <span className="mt-1 block font-medium text-foreground">
                {t("Como esta conversa está aberta, arquivar também encerra o atendimento atual.")}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div
          className="rounded-lg border border-accent/30 bg-accent-soft p-3 text-sm"
          aria-live="polite"
        >
          {contagemPausada
            ? t("A contagem foi pausada enquanto você escolhe.")
            : `${t("Sem nenhum clique, a ação padrão acontece em")} ${segundos}s.`}
        </div>

        <fieldset className="space-y-2" disabled={bloqueado}>
          <legend className="mb-2 text-sm font-medium">{t("O que fazer com o CRM?")}</legend>
          <label className="flex cursor-pointer gap-3 rounded-lg border p-3 hover:bg-muted/50">
            <input
              type="radio"
              name="archive-crm-action"
              value="keep"
              checked={acao === "keep"}
              onChange={() => setAcao("keep")}
            />
            <span>
              <span className="block text-sm font-medium">{t("Manter o card como está")}</span>
              <span className="block text-xs text-muted-foreground">
                {t("Somente a conversa será arquivada.")}
              </span>
            </span>
          </label>

          <label
            className={cn(
              "flex gap-3 rounded-lg border p-3",
              podeAlterarCard
                ? "cursor-pointer hover:bg-muted/50"
                : "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="radio"
              name="archive-crm-action"
              value="move"
              disabled={!podeAlterarCard || etapas.length < 2}
              checked={acao === "move"}
              onChange={() => setAcao("move")}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {t("Mover o card para outra etapa")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t("Escolha o negócio e a etapa antes de arquivar.")}
              </span>
            </span>
          </label>

          <label
            className={cn(
              "flex gap-3 rounded-lg border border-error/40 p-3",
              podeAlterarCard
                ? "cursor-pointer hover:bg-error-bg"
                : "cursor-not-allowed opacity-60",
            )}
          >
            <input
              type="radio"
              name="archive-crm-action"
              value="delete"
              disabled={!podeAlterarCard}
              checked={acao === "delete"}
              onChange={() => setAcao("delete")}
            />
            <span>
              <span className="block text-sm font-medium text-error-fg">
                {t("Excluir o card do CRM")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t(
                  "O contato e as conversas continuam, mas o card e seu histórico não podem ser recuperados.",
                )}
              </span>
            </span>
          </label>
        </fieldset>

        {quantidade > 1 && (
          <p className="text-xs text-muted-foreground">
            {t(
              "Para evitar excluir ou mover o negócio errado, ações no CRM ficam disponíveis ao arquivar uma conversa por vez.",
            )}
          </p>
        )}
        {quantidade === 1 && contactId && carregandoCrm && (
          <p className="text-xs text-muted-foreground">{t("Carregando cards do CRM…")}</p>
        )}
        {quantidade === 1 && contactId && !carregandoCrm && !erroCrm && leads.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t("Este contato não tem card no CRM. A conversa pode ser arquivada normalmente.")}
          </p>
        )}
        {erroCrm && (
          <p className="text-xs text-error-fg">
            {t("Não foi possível consultar o CRM. A ação padrão continua disponível.")}
          </p>
        )}

        {podeAlterarCard && acao !== "keep" && (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="archive-lead">{t("Card do CRM")}</Label>
              <select
                id="archive-lead"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={lead?.id ?? ""}
                onChange={(event) => {
                  setLeadId(event.target.value);
                  setStageId("");
                }}
              >
                {leads.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} · {item.funil_nome ?? t("Funil")} ·{" "}
                    {item.etapa_nome ?? t("Sem etapa")}
                  </option>
                ))}
              </select>
            </div>
            {acao === "move" && (
              <div className="space-y-1.5">
                <Label htmlFor="archive-stage">{t("Nova etapa")}</Label>
                <select
                  id="archive-stage"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={stageIdEfetivo}
                  onChange={(event) => setStageId(event.target.value)}
                >
                  {etapas
                    .filter((item) => item.id !== lead?.stage_id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={bloqueado} onClick={onCancel}>
            {t("Cancelar arquivamento")}
          </Button>
          <Button
            type="button"
            disabled={bloqueado || (acao === "move" && !stageIdEfetivo)}
            className={acao === "delete" ? buttonVariants({ variant: "destructive" }) : undefined}
            onClick={() => void executar(acao)}
          >
            {bloqueado ? t("Executando…") : rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
