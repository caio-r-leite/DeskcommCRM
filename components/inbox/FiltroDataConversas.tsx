"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/hooks/i18n/useT";
import {
  intervaloDeDataValido,
  periodoDoMes,
  periodoRapido,
  type FiltroDeDataDaInbox,
} from "@/lib/inbox/filtro-de-data";
import { CalendarBlank, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  value: FiltroDeDataDaInbox;
  fila: boolean;
  onChange: (next: FiltroDeDataDaInbox) => void;
}

export function FiltroDataConversas({ value, fila, onChange }: Props) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const [mes, setMes] = useState("");
  const temPeriodo = Boolean(value.dataDe || value.dataAte);
  const valido = intervaloDeDataValido(value.dataDe, value.dataAte);

  const limpar = () =>
    onChange({ dataDe: undefined, dataAte: undefined, ordem: value.ordem });

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("Filtrar e ordenar por data")}
            aria-pressed={temPeriodo}
            className={cn(
              "relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden",
              temPeriodo
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-transparent text-text-muted hover:bg-surface-elevated",
            )}
          >
            <CalendarBlank size={17} aria-hidden />
            {temPeriodo && (
              <span
                className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-success ring-2 ring-background"
                aria-hidden
              />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text">{t("Data da última mensagem")}</p>
              <p className="text-xs text-text-muted">{t("Filtre o período exibido na lista.")}</p>
            </div>
            {temPeriodo && (
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={limpar}>
                {t("Limpar")}
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-text-muted">{t("Períodos rápidos")}</p>
            <div className="grid grid-cols-1 gap-1.5">
              {(
                [
                  ["ontem", "Ontem"],
                  ["ultimos_7_dias", "Última semana"],
                  ["ultimos_30_dias", "Último mês"],
                ] as const
              ).map(([tipo, label]) => (
                <Button
                  key={tipo}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 justify-start px-3 text-xs"
                  onClick={() => onChange({ ...value, ...periodoRapido(tipo) })}
                >
                  {t(label)}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs font-medium text-text-muted">
              {t("A partir de")}
              <Input
                type="date"
                value={value.dataDe ?? ""}
                max={value.dataAte}
                onChange={(e) => onChange({ ...value, dataDe: e.target.value || undefined })}
                className="h-9 text-xs"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-text-muted">
              {t("Até")}
              <Input
                type="date"
                value={value.dataAte ?? ""}
                min={value.dataDe}
                onChange={(e) => onChange({ ...value, dataAte: e.target.value || undefined })}
                className="h-9 text-xs"
              />
            </label>
          </div>
          {!valido && (
            <p role="alert" className="text-xs text-destructive">
              {t("A data inicial deve ser anterior à data final.")}
            </p>
          )}

          <label className="block space-y-1 text-xs font-medium text-text-muted">
            {t("Mês específico")}
            <Input
              type="month"
              value={mes}
              onChange={(e) => {
                setMes(e.target.value);
                onChange({ ...value, ...periodoDoMes(e.target.value) });
              }}
              className="h-9 text-xs"
            />
          </label>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-text-muted">{t("Ordenar lista")}</p>
            {fila ? (
              <p className="rounded-md bg-surface-elevated px-2.5 py-2 text-xs text-text-muted">
                {t("Na Fila, quem espera há mais tempo permanece primeiro.")}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={
                    (value.ordem ?? "mais_recentes") === "mais_recentes" ? "default" : "outline"
                  }
                  onClick={() => onChange({ ...value, ordem: "mais_recentes" })}
                >
                  {t("Mais recentes")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={value.ordem === "mais_antigas" ? "default" : "outline"}
                  onClick={() => onChange({ ...value, ordem: "mais_antigas" })}
                >
                  {t("Mais antigas")}
                </Button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {temPeriodo && (
        <button
          type="button"
          onClick={limpar}
          aria-label={t("Limpar filtro de data")}
          title={t("Limpar filtro de data")}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-surface-elevated hover:text-text"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
