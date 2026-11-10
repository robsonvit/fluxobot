/* Vários bots (cada um é bots/<nome>.json no GitHub), salvar, enviar arquivos, planilha e contador. */
(function () {
  const UI = window.UI;
  const $ = (id) => document.getElementById(id);

  const PASTA = "bots";
  const CHAVE_TOKEN = "fluxobot:token";
  const CHAVE_FLUXO = "fluxobot:fluxo";
  const CHAVE_BOT = "fluxobot:bot";
  const PADRAO = { dono: "robsonvit", repo: "fluxobot" };
  const LIMITE_ARQUIVO_MB = 25;
  const PREFIXO_TIPO = { imagem: "image/", audio: "audio/", video: "video/" };

  const guardado = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } };
  const apagar = (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } };

  const seletor = $("sel-bot");
  let botAtual = guardado(CHAVE_BOT) || "padrao";
  let config = {};

  /* ---------- Utilitários ---------- */
  function repositorio() {
    const h = location.hostname;
    if (h.endsWith(".github.io")) {
      const repo = location.pathname.split("/")[1];
      if (repo) return { dono: h.split(".")[0], repo };
    }
    return PADRAO;
  }

  function urlApi(caminho) {
    const { dono, repo } = repositorio();
    return `https://api.github.com/repos/${dono}/${repo}/contents/${caminho}`;
  }

  const criarSlug = (nome) => nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  // Mesmo nome de aba que o apps-script.gs usa
  const nomeDaAba = (nome) => (String(nome || "sem-nome").replace(/[\[\]*?:/\\]/g, " ").trim().slice(0, 90) || "sem-nome");

  // Tokens do GitHub só têm letras, números e _
  const tokenValido = (t) => /^[A-Za-z0-9_]{20,}$/.test(t);

  function paraBase64(texto) {
    let bin = "";
    new TextEncoder().encode(texto).forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  async function paraBase64DoArquivo(arquivo) {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(bin);
  }

  const AJUDA_TOKEN = 'Para gravar direto no GitHub, crie uma "senha" <b>uma única vez</b>:' +
    '<ol><li>Abra <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a></li>' +
    '<li><b>Repository access:</b> Only select repositories › <b>fluxobot</b></li>' +
    '<li><b>Permissions › Contents:</b> Read and write</li>' +
    '<li>Clique em <b>Generate token</b> e cole o texto aqui.</li></ol>' +
    'Ele fica guardado só neste navegador.';

  async function obterToken() {
    let token = guardado(CHAVE_TOKEN);
    if (token && !tokenValido(token)) { apagar(CHAVE_TOKEN); token = null; }
    if (token) return token;
    const digitado = await UI.pedirTexto({
      titulo: "Conectar ao GitHub", rotulo: "Token do GitHub", tipo: "password", placeholder: "github_pat_...", ajuda: AJUDA_TOKEN, botao: "Conectar",
    });
    const limpo = (digitado || "").replace(/\s+/g, "");
    if (!limpo) return null;
    if (!tokenValido(limpo)) { UI.toast("Esse texto não parece um token do GitHub. Copie de novo, só o token.", "erro"); return null; }
    guardar(CHAVE_TOKEN, limpo);
    return limpo;
  }

  const cabecalhos = (token) => ({ Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" });

  /* Grava (cria ou atualiza) um arquivo no repositório */
  async function gravarArquivo(token, caminho, conteudoBase64, mensagem) {
    const url = urlApi(caminho);
    const atual = await fetch(url, { headers: cabecalhos(token) });
    if (atual.status === 401 || atual.status === 403) {
      apagar(CHAVE_TOKEN);
      throw new Error("O token não funcionou (inválido, vencido ou sem permissão). Tente de novo para colar outro.");
    }
    const sha = atual.ok ? (await atual.json()).sha : undefined;
    const resp = await fetch(url, {
      method: "PUT",
      headers: { ...cabecalhos(token), "Content-Type": "application/json" },
      body: JSON.stringify({ message: mensagem, content: conteudoBase64, sha }),
    });
    if (!resp.ok) throw new Error("O GitHub recusou o salvamento (código " + resp.status + ").");
  }

  /* ---------- Lista de bots ---------- */
  function preencherSeletor(slugs) {
    const todos = Array.from(new Set([...slugs, botAtual])).sort();
    seletor.innerHTML = "";
    todos.forEach((s) => {
      const o = UI.el("option", "", s);
      o.value = s;
      seletor.append(o);
    });
    seletor.value = botAtual;
  }

  async function listarBots() {
    try {
      const token = guardado(CHAVE_TOKEN);
      const resp = await fetch(urlApi(PASTA), { headers: token && tokenValido(token) ? cabecalhos(token) : {} });
      if (!resp.ok) throw new Error(resp.status);
      const itens = await resp.json();
      preencherSeletor(itens.filter((i) => i.name.endsWith(".json")).map((i) => i.name.replace(/\.json$/, "")));
    } catch (e) {
      preencherSeletor([]);
    }
  }

  async function buscarDoSite(slug) {
    const resp = await fetch(`${PASTA}/${slug}.json?v=${Date.now()}`);
    if (!resp.ok) throw new Error("não encontrei o bot " + slug);
    const lido = await resp.json();
    if (!Array.isArray(lido.nodes) || !Array.isArray(lido.edges)) throw new Error("formato inválido");
    return lido;
  }

  async function abrirBot(slug) {
    try {
      const fluxo = await buscarDoSite(slug);
      botAtual = slug;
      guardar(CHAVE_BOT, slug);
      window.FluxoEditor.definir(fluxo);
      seletor.value = slug;
      atualizarStats();
    } catch (e) {
      seletor.value = botAtual;
      UI.toast("Não consegui abrir o bot: " + e.message, "erro");
    }
  }

  const estaSujo = () => $("estado").classList.contains("sujo");

  /* ---------- Salvar ---------- */
  async function salvar() {
    const botao = $("btn-salvar");
    const token = await obterToken();
    if (!token) return;
    botao.disabled = true;
    try {
      const conteudo = JSON.stringify(window.FluxoEditor.obter(), null, 2) + "\n";
      await gravarArquivo(token, `${PASTA}/${botAtual}.json`, paraBase64(conteudo), `chat: atualiza o bot ${botAtual}`);
      window.FluxoEditor.marcarSalvo();
      UI.toast("Salvo! O chat público atualiza em cerca de 1 minuto.", "ok");
      listarBots();
    } catch (e) {
      UI.toast(e.message, "erro");
    } finally {
      botao.disabled = false;
    }
  }

  /* ---------- Novo, duplicar, excluir ---------- */
  async function criarBot(nomeSugerido, fluxoInicial, avisoExtra) {
    const nome = await UI.pedirTexto({
      titulo: fluxoInicial ? "Nome do novo bot" : "Novo bot",
      descricao: "Esse nome também será o nome da aba na planilha.",
      rotulo: "Nome do bot", valor: (nomeSugerido || "").trim(), placeholder: "Ex.: Vendas, Suporte", botao: "Criar",
    });
    if (!nome) return;
    const slug = criarSlug(nome);
    if (!slug) { UI.toast("Use letras ou números no nome.", "erro"); return; }
    if ([...seletor.options].some((o) => o.value === slug)) {
      const ok = await UI.confirmar({ titulo: "Já existe um bot com esse nome", texto: "Abrir e sobrescrever ao salvar?", botao: "Sobrescrever", perigo: true });
      if (!ok) return;
    }
    botAtual = slug;
    guardar(CHAVE_BOT, slug);
    const base = fluxoInicial || {
      nodes: [
        { id: "a", type: "inicio", x: 40, y: 60, data: {} },
        { id: "b", type: "mensagem", x: 340, y: 40, data: { texto: "Olá! Como posso ajudar?" } },
      ],
      edges: [{ from: "a", port: "out", to: "b" }],
    };
    window.FluxoEditor.definir({ ...base, nome }, { sujo: true });
    preencherSeletor([...seletor.options].map((o) => o.value));
    UI.toast((avisoExtra ? avisoExtra + " " : "") + `Bot "${slug}" criado. Clique em Salvar para publicar.`, "ok");
    atualizarStats();
  }

  function duplicarBot() {
    const atual = window.FluxoEditor.obter();
    criarBot((atual.nome || botAtual) + " (cópia)", JSON.parse(JSON.stringify(atual)));
  }

  async function excluirBot() {
    const opcoes = [...seletor.options].map((o) => o.value);
    if (opcoes.length <= 1) { UI.toast("Mantenha pelo menos um bot.", "erro"); return; }
    const ok = await UI.confirmar({
      titulo: `Excluir o bot "${botAtual}"?`,
      texto: "O link do chat desse bot deixa de funcionar. As respostas já gravadas na planilha continuam lá.",
      botao: "Excluir bot", perigo: true,
    });
    if (!ok) return;
    const token = await obterToken();
    if (!token) return;
    try {
      const url = urlApi(`${PASTA}/${botAtual}.json`);
      const atual = await fetch(url, { headers: cabecalhos(token) });
      if (atual.status === 401 || atual.status === 403) { apagar(CHAVE_TOKEN); throw new Error("O token não funcionou. Tente de novo."); }
      if (atual.ok) {
        const { sha } = await atual.json();
        const resp = await fetch(url, {
          method: "DELETE",
          headers: { ...cabecalhos(token), "Content-Type": "application/json" },
          body: JSON.stringify({ message: `chat: exclui o bot ${botAtual}`, sha }),
        });
        if (!resp.ok) throw new Error("O GitHub recusou a exclusão (código " + resp.status + ").");
      }
      const excluido = botAtual;
      const restante = opcoes.filter((s) => s !== excluido);
      botAtual = restante[0];
      await listarBots();
      await abrirBot(botAtual);
      UI.toast(`Bot "${excluido}" excluído.`, "ok");
    } catch (e) {
      UI.toast(e.message, "erro");
    }
  }

  async function copiarLink() {
    const base = location.origin + location.pathname.replace(/[^/]*$/, "");
    const link = `${base}chat.html?f=${botAtual}`;
    try {
      await navigator.clipboard.writeText(link);
      UI.toast("Link copiado: " + link, "ok");
    } catch (e) {
      await UI.pedirTexto({ titulo: "Link do chat", rotulo: "Copie o endereço", valor: link, botao: "Fechar" });
    }
  }

  /* ---------- Enviar arquivos (imagem, áudio, vídeo) ---------- */
  function escolherArquivo(tipo) {
    return new Promise((resolve) => {
      const entrada = document.createElement("input");
      entrada.type = "file";
      entrada.accept = (PREFIXO_TIPO[tipo] || "image/") + "*";
      entrada.onchange = () => resolve(entrada.files[0] || null);
      entrada.click();
    });
  }

  async function escolherEEnviar(tipo) {
    const arquivo = await escolherArquivo(tipo);
    if (!arquivo) return null;
    if (!arquivo.type.startsWith(PREFIXO_TIPO[tipo] || "")) { UI.toast("Esse arquivo não é do tipo certo para este bloco.", "erro"); return null; }
    if (arquivo.size > LIMITE_ARQUIVO_MB * 1024 * 1024) {
      UI.toast(`Arquivo grande demais (máximo ${LIMITE_ARQUIVO_MB} MB). Para vídeos maiores, use um link do YouTube ou Vimeo.`, "erro");
      return null;
    }
    const token = await obterToken();
    if (!token) return null;

    const partes = arquivo.name.split(".");
    const extensao = (partes.length > 1 ? partes.pop() : "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const caminho = `midias/${botAtual}/${Date.now()}-${criarSlug(partes.join(".")) || "arquivo"}.${extensao}`;
    UI.toast("Enviando " + arquivo.name + "...");
    try {
      const resp = await fetch(urlApi(caminho), {
        method: "PUT",
        headers: { ...cabecalhos(token), "Content-Type": "application/json" },
        body: JSON.stringify({ message: "chat: envia midia do bot " + botAtual, content: await paraBase64DoArquivo(arquivo) }),
      });
      if (resp.status === 401 || resp.status === 403) { apagar(CHAVE_TOKEN); throw new Error("O token não funcionou. Tente de novo para colar outro."); }
      if (!resp.ok) throw new Error("O GitHub recusou o arquivo (código " + resp.status + ").");
      // Prévia imediata no editor, antes do site terminar de atualizar
      window.FluxoMidiaLocal = { ...(window.FluxoMidiaLocal || {}), [caminho]: URL.createObjectURL(arquivo) };
      UI.toast("Arquivo enviado. No chat público ele aparece em cerca de 1 minuto.", "ok");
      return caminho;
    } catch (e) {
      UI.toast(e.message, "erro");
      return null;
    }
  }

  /* ---------- Planilha e contador de acessos ---------- */
  async function carregarConfig() {
    try {
      const resp = await fetch("config.json?v=" + Date.now());
      config = resp.ok ? await resp.json() : {};
    } catch (e) {
      config = {};
    }
  }

  async function atualizarStats() {
    const caixa = $("stats");
    if (!config.planilha || !config.rastreio) { caixa.hidden = true; return; }
    try {
      const resp = await fetch(config.planilha + "?acao=estatisticas");
      const dados = await resp.json();
      const d = (dados.bots || {})[nomeDaAba(window.FluxoEditor.obter().nome)] || { acessos: 0, concluidos: 0 };
      const taxa = d.acessos ? Math.round((d.concluidos / d.acessos) * 100) : 0;
      caixa.innerHTML = `${UI.icone("olho", 14)} <b>${d.acessos}</b> acessos · ${UI.icone("check", 14)} <b>${d.concluidos}</b> concluídos (${taxa}%)`;
      caixa.hidden = false;
    } catch (e) {
      caixa.hidden = true;
    }
  }

  async function abrirConfig() {
    const ativo = config.rastreio ? "ATIVO" : "desligado";
    const url = await UI.pedirTexto({
      titulo: "Planilha e acessos",
      descricao: `Registro automático: ${ativo}. Todas as conversas de todos os bots são gravadas sozinhas nesta planilha (uma aba por bot, uma linha por visitante, mesmo quem não responde nada) e a aba "📊 Resumo" conta os acessos.`,
      rotulo: "Endereço do Apps Script (termina em /exec)", valor: config.planilha || "", placeholder: "https://script.google.com/macros/s/.../exec",
      ajuda: 'O código do script está no arquivo <b>apps-script.gs</b> do repositório (Extensões › Apps Script, cole e implante como "App da Web", acesso "Qualquer pessoa").',
      botao: "Salvar e ativar",
    });
    if (!url) return;
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) { UI.toast("Esse endereço não parece ser de um Apps Script (deve terminar em /exec).", "erro"); return; }
    const token = await obterToken();
    if (!token) return;
    try {
      const nova = { planilha: url, rastreio: true };
      await gravarArquivo(token, "config.json", paraBase64(JSON.stringify(nova, null, 2) + "\n"), "chat: atualiza a configuracao da planilha");
      config = nova;
      UI.toast("Configuração salva. Vale para todos os bots em cerca de 1 minuto.", "ok");
      atualizarStats();
    } catch (e) {
      UI.toast(e.message, "erro");
    }
  }

  /* ---------- Menu ⋯ e eventos ---------- */
  async function recarregar() {
    const ok = await UI.confirmar({ titulo: "Recarregar do site?", texto: "Isso troca o que está na tela pelo bot publicado e descarta alterações não salvas.", botao: "Recarregar", perigo: true });
    if (ok) abrirBot(botAtual);
  }

  function abrirMenu() {
    const r = $("btn-menu").getBoundingClientRect();
    const E = window.FluxoEditor;
    UI.menu(r.right - 230, r.bottom + 6, [
      { titulo: "Bots" },
      { rotulo: "Novo bot", icone: "novo", acao: () => criarBot() },
      { rotulo: "Duplicar este bot", icone: "copiar", acao: duplicarBot },
      { rotulo: "Excluir este bot", icone: "lixeira", perigo: true, acao: excluirBot },
      "-",
      { titulo: "Arquivo" },
      { rotulo: "Importar .json (FluxoBot ou Typebot)", icone: "enviar", acao: E.escolherArquivoParaImportar },
      { rotulo: "Baixar .json", icone: "baixar", acao: E.baixar },
      { rotulo: "Recarregar do site", icone: "reiniciar", acao: recarregar },
      "-",
      { titulo: "Ferramentas" },
      { rotulo: "Organizar blocos", icone: "organizar", acao: E.organizar },
      { rotulo: "Copiar link do chat", icone: "link", acao: copiarLink },
      { rotulo: "Planilha e acessos", icone: "tabela", acao: abrirConfig },
    ]);
  }

  $("btn-salvar").onclick = salvar;
  $("btn-menu").onclick = abrirMenu;
  $("stats").onclick = atualizarStats;
  seletor.onchange = async () => {
    if (seletor.value === botAtual) return;
    if (estaSujo()) {
      const ok = await UI.confirmar({ titulo: "Trocar de bot?", texto: "O que não foi salvo no bot atual será perdido.", botao: "Trocar", perigo: true });
      if (!ok) { seletor.value = botAtual; return; }
    }
    abrirBot(seletor.value);
  };

  window.FluxoBots = { criarBot, escolherEEnviar, salvar };

  preencherSeletor([]);
  listarBots();
  carregarConfig().then(atualizarStats);

  // Navegador novo (sem rascunho): já abre o bot publicado, para não sobrescrever com o exemplo.
  if (guardado(CHAVE_FLUXO) === null) {
    buscarDoSite(botAtual).then((f) => window.FluxoEditor.definir(f)).catch(() => { /* segue com o exemplo */ });
  }
})();
