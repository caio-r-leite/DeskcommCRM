/**
 * A BUSCA E OS FILTROS DA INBOX DIZEM A VERDADE — PELA TELA.
 *
 * ## Por que esta spec existe
 *
 * Os oito consertos deste PR têm teste de unidade e de invariante, e nenhum deles
 * alcança o que o operador vive: o defeito principal era a tela AFIRMAR um estado
 * que o servidor não tinha. Medido numa instalação real, com duas conversas
 * existindo e "Não lidos" ligado, a tela dizia:
 *
 *     "Sem conversas por aqui — quando chegarem mensagens, elas aparecem aqui"
 *
 * Sem erro, sem aviso. E ligar o botão não gerava requisição nenhuma — provado
 * com controle positivo (trocar de aba, na mesma sessão, gerava).
 *
 * ## O caso que NENHUM teste unitário cobre, e por isso ele abre a lista
 *
 * Digitar UMA letra na busca não pode fazer erro aparecer na tela. O piso de dois
 * caracteres vive no schema (a rota recusa), e o hook trata falha com
 * `showApiError` — que aparece para quem está digitando. A guarda que impede o
 * pedido mora no `InboxLayout`, e o arnês que renderiza esse componente mocka o
 * `InboxFilters`, então não há como digitar nele. Esta spec é o ÚNICO gate dessa
 * guarda: sem ela, tirar a guarda passa verde em tudo.
 *
 * ## O que ela prova, e sempre pelo caminho do ERRO
 *
 * O caminho feliz é o que teste manual já cobre. O que paga é provocar a falha:
 * uma letra só, espaço duplo, termo inexistente, filtro que zera a lista.
 */
import { expect, test } from "./helpers/test";

import { esperarCacheCurtoVencer, esperarEscritaDeFora } from "./helpers/cache-curto";
import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

const CAMPO_DE_BUSCA = "Buscar conversas";

/**
 * ⏱️ 60s, e o número saiu de MEDIÇÃO — não de chute.
 *
 * O `beforeEach` loga com MFA, e o helper de login espera a próxima janela do
 * TOTP quando o código anterior já foi usado: até 30 segundos parados antes de a
 * tela fazer qualquer coisa. O teto padrão do Playwright são 30s e ele mede o
 * teste INTEIRO, login incluso — então a espera do relógio consome a prova.
 *
 * No CI de 2026-09-13 as durações foram 4.1s · 29.7s · 29.7s · 30.7s✘ · 6.3s ·
 * 22.1s · 30.8s✘ · 6.6s. Os dois vermelhos estouraram o teto com a asserção mal
 * tendo começado, e o mesmo caso passou em 6.3s quando a janela do TOTP caiu a
 * favor. Não é o produto: é o relógio.
 */
test.describe.configure({ timeout: 60_000 });

test.beforeEach(async ({ page }) => {
  await loginComoAdmin(page, lerCreds());
  await page.goto("/app/inbox");
  await expect(page.getByLabel(CAMPO_DE_BUSCA)).toBeVisible();
});

test("uma letra só não gera erro na tela nem requisição", async ({ page }) => {
  const pedidos: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/conversations?")) pedidos.push(r.url());
  });

  await page.getByLabel(CAMPO_DE_BUSCA).fill("a");
  await page.waitForTimeout(600); // o debounce é de 250 ms

  expect(
    pedidos.filter((u) => u.includes("search=")),
    "a tela pediu a busca que a rota recusa",
  ).toEqual([]);
  await expect(
    page.getByText(/erro|falhou|internal/i),
    "apareceu erro ao digitar a primeira letra",
  ).toHaveCount(0);
});

test("CONTROLE: com dois caracteres a busca VAI ao servidor", async ({ page }) => {
  // Sem este caso, uma tela que nunca buscasse passaria no de cima.
  const pedidos: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("search=")) pedidos.push(r.url());
  });

  await page.getByLabel(CAMPO_DE_BUSCA).fill("an");
  await expect
    .poll(() => pedidos.length, { timeout: 5_000 })
    .toBeGreaterThan(0);
});

test("o placeholder promete o que a busca faz — a ÚLTIMA mensagem", async ({ page }) => {
  await expect(page.getByLabel(CAMPO_DE_BUSCA)).toHaveAttribute(
    "placeholder",
    /última mensagem/i,
  );
});

test("lista vazia por filtro NÃO se passa por caixa vazia, e mantém a saída", async ({
  page,
}) => {
  // Termo que não casa nada: a lista zera POR FILTRO, não por ausência.
  await page.getByLabel(CAMPO_DE_BUSCA).fill("zzqqxxnaoexiste");

  await expect(
    page.getByText(/Sem conversas por aqui/i),
    "a tela afirmou caixa vazia com um filtro ativo",
  ).toHaveCount(0);
  await expect(page.getByText(/Nenhuma conversa com esses filtros/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Limpar filtros/i })).toBeVisible();
});

test('"Limpar filtros" devolve a lista e MANTÉM a aba', async ({ page }) => {
  await page.getByLabel(CAMPO_DE_BUSCA).fill("zzqqxxnaoexiste");
  await expect(page.getByRole("button", { name: /Limpar filtros/i })).toBeVisible();

  await page.getByRole("button", { name: /Limpar filtros/i }).click();

  await expect(page.getByLabel(CAMPO_DE_BUSCA)).toHaveValue("");
  await expect(
    page.getByText(/Nenhuma conversa com esses filtros/i),
  ).toHaveCount(0);
});

test('"Não lidos" VAI ao servidor — o defeito era filtrar a página carregada', async ({
  page,
}) => {
  const comUnread: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("unread=true")) comUnread.push(r.url());
  });

  await page.getByRole("button", { name: /Não lidos/i }).click();

  await expect
    .poll(() => comUnread.length, { timeout: 5_000 })
    .toBeGreaterThan(0);
});

test("trocar de aba logo após digitar NÃO volta à aba anterior", async ({ page }) => {
  // O timer do debounce é de 250 ms; a troca acontece dentro da janela.
  await page.getByLabel(CAMPO_DE_BUSCA).fill("teste");
  await page.getByRole("tab", { name: /Todas/i }).click();
  await page.waitForTimeout(600);

  await expect(
    page.getByRole("tab", { name: /Todas/i }),
    "o debounce desfez a troca de aba",
  ).toHaveAttribute("aria-selected", "true");
});

test('a aba "Fechadas" mostra número', async ({ page }) => {
  // Ela existia sem contador nenhum. Num inbox antigo é o número que diz o
  // tamanho do arquivo, e a ausência fazia a aba parecer um lugar vazio.
  //
  // ⚠️ O badge NÃO mostra zero, e isso é deliberado — vale para todas as abas,
  // senão cada aba vazia carregaria um zero. Então o teste precisa criar a sua
  // conversa fechada: torcer para o ambiente ter uma é o que fazia este caso
  // reprovar um produto correto em banco fresco.
  //
  // E ele CRIA a sua em vez de fechar uma existente. Este Supabase é
  // compartilhado entre frentes; fechar conversa alheia muda o mundo de outra
  // spec, e o estrago apareceria longe daqui.
  const aberta = await page.request.post("/api/v1/conversations/open-with-contact", {
    data: { phone_number: `+5511${Date.now().toString().slice(-9)}`, name: "Arquivo do teste" },
  });
  expect(aberta.ok(), await aberta.text()).toBe(true);
  // `open-with-contact` devolve `{ conversation_id, contact_id }` — NAO um `id`.
  // Supor `id` produzia `invalid input syntax for type uuid: "undefined"`, e o
  // erro chegava como 500 do banco, longe da causa. Medido no CI em 2026-09-13.
  const { data: conversa } = await aberta.json();

  const fechada = await page.request.patch(`/api/v1/conversations/${conversa.conversation_id}`, {
    data: { status: "closed" },
  });
  expect(fechada.ok(), await fechada.text()).toBe(true);

  await page.reload();
  await expect(page.getByRole("tab", { name: /Fechadas/i })).toHaveText(/\d/);
});

test("número e Não lidos sobrevivem à recarga e permanecem na sua organização", async ({ page }) => {
  // +2 TTLs do cache curto (#3696): os vínculos novos chegarem, e a limpeza.
  test.setTimeout(240_000);
  const { randomUUID } = await import("node:crypto");
  const { mkdirSync } = await import("node:fs");
  const { createClient } = await import("@supabase/supabase-js");
  const { credenciaisSupabaseDeTeste } = await import("../../scripts/lib/env-de-teste");
  const c = credenciaisSupabaseDeTeste();
  expect(["127.0.0.1", "localhost"]).toContain(new URL(c.url).hostname);
  const db = createClient(c.url, c.serviceRole, { auth: { persistSession: false } });
  const usuario = lerCreds().users.admin as { email: string; id: string };
  const orgs: string[] = [];
  const sufixo = randomUUID().slice(0, 8);
  const inserir = async (tabela: string, dados: Record<string, unknown>): Promise<string> => {
    const { data, error } = await db.from(tabela).insert(dados).select("id").single();
    expect(error).toBeNull();
    return data!.id as string;
  };
  const trocar = async (id: string) => {
    const seletor = page.getByTestId("tenant-switcher");
    await seletor.click();
    await page.getByTestId(`tenant-switcher-item-${id}`).click();
    await expect(seletor).toBeEnabled();
    await expect.poll(async () => (await page.context().cookies()).find((cookie) => cookie.name === "active_org")?.value).toBe(id);
  };
  const numero = page.getByRole("combobox", { name: "Filtrar por número de WhatsApp" });
  const naoLidos = page.getByRole("button", { name: "Não lidos", exact: true });
  try {
    const canais: { org: string; id: string; nome: string }[] = [];
    for (const letra of ["A", "B"]) {
      const org = await inserir("organizations", {
        slug: `filtros-${letra.toLowerCase()}-${sufixo}`,
        display_name: `Filtros ${letra} ${sufixo}`, legal_name: `Filtros ${letra}`,
        onboarded_at: new Date().toISOString(),
      });
      orgs.push(org);
      const vinculo = await db.from("user_organizations").insert({
        organization_id: org, user_id: usuario.id, role: "admin", accepted_at: new Date().toISOString(),
      });
      expect(vinculo.error).toBeNull();
      // Após excluir o escolhido, ainda ficam dois números. Com apenas um,
      // o seletor some por contrato quando a pessoa limpa o filtro removido.
      for (const reserva of [0, 1, 2]) {
        const nome = `Número ${letra}${reserva ? ` reserva ${reserva}` : ""} ${sufixo}`;
        const id = await inserir("channel_sessions", {
          organization_id: org, display_name: nome, waha_session_name: `filtros-${randomUUID()}`,
          status: "WORKING", webhook_secret_encrypted: "\\x00",
        });
        if (!reserva) canais.push({ org, id, nome });
      }
    }
    // Os vínculos foram gravados direto no banco depois do login do `beforeEach`,
    // e o snapshot de vínculos desta conta já está no cache curto (#3696): as
    // organizações novas aparecem no seletor quando a entrada vence.
    await esperarEscritaDeFora(async () => {
      await page.reload();
      await page.getByTestId("tenant-switcher").click({ timeout: 3_000 });
      await expect(page.getByTestId(`tenant-switcher-item-${canais[1]!.org}`)).toBeVisible({ timeout: 3_000 });
      await page.keyboard.press("Escape");
      // Escape inicia a saída: espere o menu antigo desmontar antes de reabrir.
      // Durante a animação o item ainda existe e pode ser escolhido pelo locator.
      await expect(page.getByTestId(`tenant-switcher-item-${canais[1]!.org}`)).toHaveCount(0);
    });
    await trocar(canais[0]!.org);
    await numero.click();
    await page.getByRole("option", { name: canais[0]!.nome, exact: true }).click();
    await naoLidos.click();
    await expect(naoLidos).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(numero).toHaveText(canais[0]!.nome);
    await expect(naoLidos).toHaveAttribute("aria-pressed", "true");

    await trocar(canais[1]!.org);
    await expect(numero).toHaveText("Todos os números");
    await expect(naoLidos).toHaveAttribute("aria-pressed", "false");
    await numero.click();
    await page.getByRole("option", { name: canais[1]!.nome, exact: true }).click();
    await trocar(canais[0]!.org);
    await expect(numero).toHaveText(canais[0]!.nome);
    await expect(naoLidos).toHaveAttribute("aria-pressed", "true");
    await trocar(canais[1]!.org);
    await expect(numero).toHaveText(canais[1]!.nome);
    await expect(naoLidos).toHaveAttribute("aria-pressed", "false");

    const removido = await db.from("channel_sessions").delete().eq("organization_id", canais[1]!.org).eq("id", canais[1]!.id);
    expect(removido.error).toBeNull();
    await page.reload();
    await expect(numero).toHaveText("Número removido");
    mkdirSync("evidence/antigos-core-3402", { recursive: true });
    await page.screenshot({ path: "evidence/antigos-core-3402/numero-removido.png" });
    await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
    await page.reload();
    await expect(numero).toHaveText("Todos os números");
    await trocar(canais[0]!.org);
    await expect(numero).toHaveText(canais[0]!.nome);
    await expect(naoLidos).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: "evidence/antigos-core-3402/filtros-restaurados.png" });

    // Restrição do navegador declarada: bloqueia só o armazenamento, sem
    // substituir a rota, a UI ou os filtros que a pessoa escolhe nesta visita.
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Bloqueado", "SecurityError"); } });
    });
    await page.reload();
    await expect(naoLidos).toHaveAttribute("aria-pressed", "false");
    await naoLidos.click();
    await expect(naoLidos).toHaveAttribute("aria-pressed", "true");
    await numero.click();
    await page.getByRole("option", { name: canais[0]!.nome, exact: true }).click();
    await expect(numero).toHaveText(canais[0]!.nome);
  } finally {
    const limpezas = await Promise.allSettled(orgs.map((id) => db.from("organizations").delete().eq("id", id)));
    expect(limpezas.every((r) => r.status === "fulfilled" && r.value.error === null), "limpeza das organizações da própria spec").toBe(true);
    // A próxima spec do `e2e-admin` não pode herdar do cache as organizações apagadas.
    await esperarCacheCurtoVencer();
  }
});

async function contextoDeLayout() {
  const { createClient } = await import("@supabase/supabase-js");
  const { credenciaisSupabaseDeTeste } = await import("../../scripts/lib/env-de-teste");
  const c = credenciaisSupabaseDeTeste();
  expect(["127.0.0.1", "localhost"]).toContain(new URL(c.url).hostname);
  const db = createClient(c.url, c.serviceRole, { auth: { persistSession: false } });
  const { org_id: org } = lerCreds() as ReturnType<typeof lerCreds> & { org_id: string };
  const canal = await db.from("channel_sessions").insert({
    organization_id: org,
    display_name: "Canal de teste da Inbox",
    waha_session_name: `layout-${crypto.randomUUID()}`,
    status: "WORKING",
    webhook_secret_encrypted: "\\x00",
  }).select("id").single();
  expect(canal.error).toBeNull();
  const canalId = canal.data!.id;
  const contatos: string[] = [];
  const conversas: string[] = [];

  async function inserirConversa(nome: string, data: string) {
    const contato = await db.from("contacts")
      .insert({ organization_id: org, display_name: nome, phone_number: `+5511${String(Date.now()).slice(-9)}` })
      .select("id").single();
    expect(contato.error).toBeNull();
    contatos.push(contato.data!.id);
    const conversa = await db.from("conversations").insert({
      organization_id: org, contact_id: contato.data!.id, channel_session_id: canalId,
      status: "open", last_message_at: data, last_inbound_at: "2024-01-01T13:00:00Z",
      last_message_preview: nome, unread_count_for_assignee: 0,
    }).select("id").single();
    expect(conversa.error).toBeNull();
    conversas.push(conversa.data!.id);
    return conversa.data!.id as string;
  }

  async function limpar() {
    if (conversas.length) await db.from("conversations").delete().in("id", conversas).eq("organization_id", org);
    if (contatos.length) await db.from("contacts").delete().in("id", contatos).eq("organization_id", org);
    await db.from("channel_sessions").delete().eq("id", canalId).eq("organization_id", org);
  }
  return { inserirConversa, limpar };
}

test("Inbox @layout: calendário aplica todos os períodos e usa a última mensagem", async ({ page }, info) => {
  test.setTimeout(120_000);
  const { inserirConversa, limpar } = await contextoDeLayout();
  const prefixo = `Calendario ${Date.now().toString(36)}`;
  const conversas: string[] = [];
  const datas = ["2028-03-03", "2028-03-02", "2028-02-29", "2028-02-05", "2028-01-09"];

  try {
    for (const [index, dia] of datas.entries()) {
      conversas.push(await inserirConversa(`${prefixo} ${index}`, `${dia}T13:00:00Z`));
    }

    await page.clock.setFixedTime(new Date("2028-03-03T13:00:00Z"));
    await page.getByRole("tab", { name: /^Todas/i }).click();
    await page.getByLabel(CAMPO_DE_BUSCA).fill(prefixo);

    async function conferir(indices: number[]) {
      for (const [index, id] of conversas.entries()) {
        await expect(page.locator(`[data-conversation-id="${id}"]`)).toHaveCount(indices.includes(index) ? 1 : 0);
      }
    }

    const calendario = page.getByRole("button", { name: "Filtrar e ordenar por data" });
    const inicio = page.getByLabel("A partir de", { exact: true });
    const fim = page.getByLabel("Até", { exact: true });
    const aplicar = page.getByRole("button", { name: "Aplicar filtro de data" });

    await conferir([0, 1, 2, 3, 4]);
    const rapidos: [string, number[]][] = [
      ["Hoje", [0]], ["Ontem", [1]], ["Última semana", [0, 1, 2]], ["Último mês", [0, 1, 2, 3]],
    ];
    for (const [rotulo, esperadas] of rapidos) {
      await calendario.click();
      await page.getByRole("button", { name: rotulo, exact: true }).click();
      await expect(calendario).toHaveAttribute("aria-pressed", "true");
      await conferir(esperadas);
    }

    await calendario.click();
    await inicio.fill("2028-03-03");
    await fim.fill("2028-02-29");
    await expect(page.getByText("A data inicial deve ser anterior à data final.")).toBeVisible();
    await expect(aplicar).toBeDisabled();
    await conferir([0, 1, 2, 3]);

    await inicio.fill("2028-02-29");
    await fim.fill("2028-03-02");
    await page.screenshot({ path: info.outputPath("calendario-inbox.png") });
    await aplicar.click();
    await conferir([1, 2]);

    await calendario.click();
    await fim.fill("");
    await aplicar.click();
    await conferir([0, 1, 2]);

    await calendario.click();
    await inicio.fill("");
    await fim.fill("2028-02-05");
    await aplicar.click();
    await conferir([3, 4]);

    await calendario.click();
    await page.getByLabel("Mês específico").fill("2028-02");
    await aplicar.click();
    await conferir([2, 3]);

    await calendario.click();
    await page.getByRole("button", { name: "Mais antigas", exact: true }).click();
    const linhaDoMes = page.locator(`[data-conversation-id="${conversas[2]}"], [data-conversation-id="${conversas[3]}"]`);
    await expect(linhaDoMes.first()).toHaveAttribute("data-conversation-id", conversas[3]!);
    await page.getByRole("button", { name: "Mais recentes", exact: true }).click();
    await expect(linhaDoMes.first()).toHaveAttribute("data-conversation-id", conversas[2]!);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Limpar filtro de data" }).click();
    await expect(calendario).toHaveAttribute("aria-pressed", "false");
    await conferir([0, 1, 2, 3, 4]);
  } finally {
    await limpar();
  }
});

test("Inbox @layout: iniciar pelo Atendimento e agir no card sem selecionar em lote", async ({ page }, info) => {
  test.setTimeout(120_000);
  const { inserirConversa, limpar } = await contextoDeLayout();
  try {
    const id = await inserirConversa("Cartao Inbox E2E", new Date().toISOString());
    await page.goto(`/app/inbox?filter=all&id=${id}`);
    await page.getByLabel(CAMPO_DE_BUSCA).fill("Cartao Inbox E2E");

    const linha = page.locator(`[data-conversation-id="${id}"]`).locator("..");
    const marcarLida = linha.getByRole("button", { name: "Marcar como lida", exact: true });
    const marcarNaoLida = linha.getByRole("button", { name: "Marcar como não lida", exact: true });
    await marcarNaoLida.click();
    await expect(marcarLida).toBeVisible();
    // O timer de leitura automática da conversa aberta não deve desfazer o gesto.
    await page.waitForTimeout(1800);
    await expect(marcarLida).toBeVisible();
    expect(new URL(page.url()).searchParams.get("id")).toBe(id);
    await marcarLida.click();
    await expect(marcarNaoLida).toBeVisible();

    const expandir = linha.getByRole("button", { name: "Mais ações da conversa" });
    await expandir.click();
    for (const name of ["Fechar", "Arquivar", "Pausar IA", "Devolver ao automático", "Transferir para…", "Usar como exemplo para a IA"]) {
      await expect(page.getByRole("menuitem", { name, exact: true })).toBeVisible();
    }
    await page.screenshot({ path: info.outputPath("acoes-da-conversa.png") });
    await page.getByRole("menuitem", { name: "Transferir para…" }).click();
    await expect(page.getByRole("dialog", { name: "Transferir a conversa selecionada" })).toBeVisible();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();

    await linha.getByRole("button", { name: "Arquivar conversa" }).click();
    await expect(page.getByRole("button", { name: "Cancelar arquivamento" })).toBeVisible();
    await page.getByRole("button", { name: "Cancelar arquivamento" }).click();
    await expect(linha).toBeVisible();
    await linha.getByRole("button", { name: "Arquivar conversa" }).click();
    await page.getByRole("button", { name: "Arquivar agora", exact: true }).click();
    await expect.poll(async () => {
      const response = await page.request.get(`/api/v1/conversations/${id}`);
      return response.ok() ? (await response.json()).data.status : response.status();
    }).toBe("archived");

    const iniciar = page.getByRole("link", { name: "Iniciar conversa", exact: true });
    await expect(page.getByRole("button", { name: "Iniciar conversa", exact: true })).toHaveCount(0);
    await iniciar.click();
    await expect(page.getByRole("dialog", { name: "Nova conversa" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("iniciar-conversa.png") });
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Nova conversa" })).toHaveCount(0);
    await iniciar.click();
    await expect(page.getByRole("dialog", { name: "Nova conversa" })).toBeVisible();
  } finally {
    await limpar();
  }
});
