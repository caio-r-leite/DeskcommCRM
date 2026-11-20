"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import type { AcaoEmLote } from "@/hooks/inbox/useBulkConversations";
import { STATUS_ENCERRADOS } from "@/lib/inbox/comando-da-conversa";
import {
  Archive, ArrowRight, CaretDown, EnvelopeSimple, EnvelopeSimpleOpen, Pause, Robot, Sparkle, X,
} from "@/lib/ui/icons";

interface Props {
  conversationId: string;
  status: string;
  naoLida: boolean;
  exemploMarcado: boolean;
  pendente: boolean;
  onAcao?: (acao: AcaoEmLote) => void;
  onAlternarExemplo?: () => void;
}

const ACAO_COMPACTA = "size-8 lg:size-7 rounded-sm p-0 text-text-muted hover:bg-surface-elevated hover:text-text focus-visible:ring-2";

export function AcoesDaConversaNaLista({
  conversationId, status, naoLida, exemploMarcado, pendente, onAcao, onAlternarExemplo,
}: Props) {
  const t = useT();
  if (!onAcao && !onAlternarExemplo) return null;

  const arquivada = status === "archived";
  const encerrada = STATUS_ENCERRADOS.has(status);
  const rotuloLeitura = naoLida ? t("Marcar como lida") : t("Marcar como não lida");
  const alternarLeitura = () => onAcao?.(naoLida ? "mark-read" : "mark-unread");
  const IconeLeitura = naoLida ? EnvelopeSimpleOpen : EnvelopeSimple;
  const rotuloExemplo = exemploMarcado ? t("Deixar de usar como exemplo") : t("Usar como exemplo para a IA");

  return (
    <div className="mr-1 flex shrink-0 flex-col items-center py-1.5">
      {onAcao && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={ACAO_COMPACTA}
            aria-label={t("Arquivar conversa")}
            title={t("Arquivar conversa")}
            disabled={pendente || arquivada}
            onClick={() => onAcao("archive")}
          >
            <Archive size={15} aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={ACAO_COMPACTA}
            aria-label={rotuloLeitura}
            title={rotuloLeitura}
            disabled={pendente}
            onClick={alternarLeitura}
          >
            <IconeLeitura size={15} aria-hidden />
          </Button>
        </>
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={ACAO_COMPACTA}
            aria-label={t("Mais ações da conversa")}
            title={t("Mais ações da conversa")}
            disabled={pendente}
          >
            <CaretDown size={14} aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onAcao && (
            <>
              <DropdownMenuItem disabled={encerrada} onSelect={() => onAcao("close")}>
                <X size={15} aria-hidden />
                {t("Fechar")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={alternarLeitura}>
                <IconeLeitura size={15} aria-hidden />
                {rotuloLeitura}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={arquivada} onSelect={() => onAcao("archive")}>
                <Archive size={15} aria-hidden />
                {t("Arquivar")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAcao("pause-ai")}>
                <Pause size={15} aria-hidden />
                {t("Pausar IA")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAcao("reactivate-bot")}>
                <Robot size={15} aria-hidden />
                {t("Devolver ao automático")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAcao("transfer")}>
                <ArrowRight size={15} aria-hidden />
                {t("Transferir para…")}
              </DropdownMenuItem>
            </>
          )}
          {onAlternarExemplo && (
            <>
              {onAcao && <DropdownMenuSeparator />}
              <DropdownMenuItem data-testid={`exemplo-ia-${conversationId}`} onSelect={onAlternarExemplo}>
                <Sparkle size={15} weight={exemploMarcado ? "fill" : "regular"} aria-hidden />
                {rotuloExemplo}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
