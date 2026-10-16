import { describe, expect, it } from "vitest";

import {
  CONFIGURACAO_PADRAO_DO_ARQUIVAMENTO,
  lerConfiguracaoDoArquivamento,
} from "./configuracao-do-arquivamento";

describe("configuração da janela de arquivamento", () => {
  it("usa o padrão seguro quando a configuração não existe ou está corrompida", () => {
    expect(lerConfiguracaoDoArquivamento(null)).toEqual(CONFIGURACAO_PADRAO_DO_ARQUIVAMENTO);
    expect(lerConfiguracaoDoArquivamento({ inbox: { archive_dialog: "inválido" } })).toEqual(
      CONFIGURACAO_PADRAO_DO_ARQUIVAMENTO,
    );
  });

  it("lê o interruptor e limita a duração entre 1 e 60 segundos", () => {
    expect(
      lerConfiguracaoDoArquivamento({
        inbox: { archive_dialog: { enabled: false, duration_seconds: 8 } },
      }),
    ).toEqual({ enabled: false, duration_seconds: 8 });
    expect(
      lerConfiguracaoDoArquivamento({
        inbox: { archive_dialog: { enabled: true, duration_seconds: 999 } },
      }),
    ).toEqual(CONFIGURACAO_PADRAO_DO_ARQUIVAMENTO);
  });
});
