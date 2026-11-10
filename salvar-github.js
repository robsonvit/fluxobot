/* Vários bots: cada um é um arquivo em bots/<nome>.json no GitHub.
   O botão "Salvar" grava direto no repositório. O token fica só neste navegador. */
(function () {
  const PASTA = "bots";
  const CHAVE_TOKEN = "fluxobot:token";
  const CHAVE_FLUXO = "fluxobot:fluxo";
  const CHAVE_BOT = "fluxobot:bot";
  const PADRAO = { dono: "robsonvit", repo: "fluxobot" };

  const status = document.getElementById("status");
  const btnSalvar = document.getElementById("btn-salvar");
  const seletor = document.getElementById("sel-bot");

  const guardado = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } };
  const apagar = (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } };
  const mostrar = (msg) => { status.textContent = msg; };

  let botAtual = guardado(CHAVE_BOT) || "padrao";

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

  function criarSlug(nome) {
    return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function pedirToken() {
    const t = prompt(
      "Cole aqui o seu token do GitHub (só precisa fazer isso uma vez neste navegador).\n\n" +
      "Como criar: github.com/settings/personal-access-tokens/new\n" +
      "- Repository access: Only select repositories > fluxobot\n" +
      "- Permissions > Contents: Read and write"
    );
    const limpo = (t || "").replace(/\s+/g, "");
    if (!limpo) return null;
    if (!tokenValido(limpo)) {
      alert("Esse texto não parece um token do GitHub (tem caracteres inválidos). Copie de novo, só o token.");
      return null;
    }
    guardar(CHAVE_TOKEN, limpo);
    return limpo;
  }

  // Tokens do GitHub só têm letras, números e _ (começam com ghp_ ou github_pat_)
  function tokenValido(t) {
    return /^[A-Za-z0-9_]{20,}$/.test(t);
  }

  function paraBase64(texto) {
    let bin = "";
    new TextEncoder().encode(texto).forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  /* ---------- Lista de bots ---------- */
  function preencherSeletor(slugs) {
    const todos = Array.from(new Set([...slugs, botAtual])).sort();
    seletor.innerHTML = "";
    todos.forEach((s) => {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = "🤖 " + s;
      seletor.append(o);
    });
    seletor.value = botAtual;
  }

  async function listarBots() {
    try {
      const token = guardado(CHAVE_TOKEN);
      const resp = await fetch(urlApi(PASTA), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!resp.ok) throw new Error(resp.status);
      const itens = await resp.json();
      preencherSeletor(itens.filter((i) => i.name.endsWith(".json")).map((i) => i.name.replace(/\.json$/, "")));
    } catch (e) {
      preencherSeletor([]);
    }
  }

  /* ---------- Ler do site ---------- */
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
      mostrar("✔ Bot '" + slug + "' aberto.");
    } catch (e) {
      seletor.value = botAtual;
      mostrar("✖ Não consegui abrir: " + e.message);
    }
  }

  /* ---------- Salvar ---------- */
  async function salvarNoGithub() {
    let token = guardado(CHAVE_TOKEN);
    if (token && !tokenValido(token)) { apagar(CHAVE_TOKEN); token = null; } // token guardado estragado
    token = token || pedirToken();
    if (!token) { mostrar("Salvar cancelado."); return; }

    const url = urlApi(`${PASTA}/${botAtual}.json`);
    const cab = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
    btnSalvar.disabled = true;
    mostrar("Salvando...");
    try {
      const atual = await fetch(url, { headers: cab });
      if (atual.status === 401 || atual.status === 403) {
        apagar(CHAVE_TOKEN);
        throw new Error("O token não funcionou (inválido, vencido ou sem permissão). Clique em Salvar para colar outro.");
      }
      const sha = atual.ok ? (await atual.json()).sha : undefined;
      const conteudo = JSON.stringify(window.FluxoEditor.obter(), null, 2) + "\n";
      const resp = await fetch(url, {
        method: "PUT",
        headers: { ...cab, "Content-Type": "application/json" },
        body: JSON.stringify({ message: `chat: atualiza o bot ${botAtual}`, content: paraBase64(conteudo), sha }),
      });
      if (!resp.ok) throw new Error("O GitHub recusou o salvamento (código " + resp.status + ").");
      mostrar("✔ Salvo! O chat público atualiza em ~1 minuto.");
      listarBots();
    } catch (e) {
      if (e instanceof TypeError) apagar(CHAVE_TOKEN); // falha de rede/formato: descarta o token para colar de novo
      mostrar("✖ " + e.message + (e instanceof TypeError ? " Token apagado: clique em Salvar e cole de novo." : ""));
    } finally {
      btnSalvar.disabled = false;
    }
  }

  /* ---------- Novo bot e link ---------- */
  // Cria um bot novo (vazio ou vindo de um arquivo importado) e abre no editor
  function criarBot(nomeSugerido, fluxoInicial, avisoExtra) {
    const nome = prompt("Nome do novo bot (ex.: Vendas, Suporte):", (nomeSugerido || "").trim());
    if (!nome) return;
    const slug = criarSlug(nome);
    if (!slug) { alert("Use letras ou números no nome."); return; }
    if ([...seletor.options].some((o) => o.value === slug) && !confirm("Já existe um bot com esse nome. Abrir e sobrescrever ao salvar?")) return;
    botAtual = slug;
    guardar(CHAVE_BOT, slug);
    const base = fluxoInicial || {
      nodes: [
        { id: "a", type: "inicio", x: 40, y: 60, data: {} },
        { id: "b", type: "mensagem", x: 320, y: 40, data: { texto: "Olá! Como posso ajudar?" } },
      ],
      edges: [{ from: "a", port: "out", to: "b" }],
    };
    window.FluxoEditor.definir({ ...base, nome });
    preencherSeletor([...seletor.options].map((o) => o.value));
    mostrar((avisoExtra ? avisoExtra + " " : "") + "Bot '" + slug + "' criado. Clique em Salvar para publicar.");
  }

  const novoBot = () => criarBot();

  /* ---------- Enviar arquivos (imagem, áudio, vídeo) para o repositório ---------- */
  const LIMITE_ARQUIVO_MB = 25;
  const PREFIXO_TIPO = { imagem: "image/", audio: "audio/", video: "video/" };

  function escolherArquivo(tipo) {
    return new Promise((resolve) => {
      const entrada = document.createElement("input");
      entrada.type = "file";
      entrada.accept = (PREFIXO_TIPO[tipo] || "image/") + "*";
      entrada.onchange = () => resolve(entrada.files[0] || null);
      entrada.click();
    });
  }

  async function paraBase64DoArquivo(arquivo) {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(bin);
  }

  async function escolherEEnviar(tipo) {
    const arquivo = await escolherArquivo(tipo);
    if (!arquivo) return null;
    if (!arquivo.type.startsWith(PREFIXO_TIPO[tipo] || "")) { alert("Esse arquivo não é do tipo certo para este bloco."); return null; }
    if (arquivo.size > LIMITE_ARQUIVO_MB * 1024 * 1024) { alert("Arquivo grande demais (máximo " + LIMITE_ARQUIVO_MB + " MB). Para vídeos maiores, use um link do YouTube ou Vimeo."); return null; }

    let token = guardado(CHAVE_TOKEN);
    if (token && !tokenValido(token)) { apagar(CHAVE_TOKEN); token = null; }
    token = token || pedirToken();
    if (!token) { mostrar("Envio cancelado."); return null; }

    const partes = arquivo.name.split(".");
    const extensao = (partes.length > 1 ? partes.pop() : "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const caminho = `midias/${botAtual}/${Date.now()}-${criarSlug(partes.join(".")) || "arquivo"}.${extensao}`;

    mostrar("Enviando " + arquivo.name + "...");
    try {
      const resp = await fetch(urlApi(caminho), {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
        body: JSON.stringify({ message: "chat: envia midia do bot " + botAtual, content: await paraBase64DoArquivo(arquivo) }),
      });
      if (resp.status === 401 || resp.status === 403) { apagar(CHAVE_TOKEN); throw new Error("O token não funcionou. Tente de novo para colar outro."); }
      if (!resp.ok) throw new Error("O GitHub recusou o arquivo (código " + resp.status + ").");
      // Prévia imediata no teste do editor, antes do site terminar de atualizar
      window.FluxoMidiaLocal = { ...(window.FluxoMidiaLocal || {}), [caminho]: URL.createObjectURL(arquivo) };
      mostrar("✔ Arquivo enviado. No chat público ele aparece em ~1 minuto.");
      return caminho;
    } catch (e) {
      mostrar("✖ " + e.message);
      return null;
    }
  }

  window.FluxoBots = { criarBot, escolherEEnviar };

  async function copiarLink() {
    const base = location.origin + location.pathname.replace(/[^/]*$/, "");
    const link = `${base}chat.html?f=${botAtual}`;
    try {
      await navigator.clipboard.writeText(link);
      mostrar("✔ Link copiado: " + link);
    } catch (e) {
      prompt("Copie o link do chat:", link);
    }
  }

  btnSalvar.onclick = salvarNoGithub;
  document.getElementById("btn-novo-bot").onclick = novoBot;
  document.getElementById("btn-link").onclick = copiarLink;
  document.getElementById("btn-carregar").onclick = () => {
    if (confirm("Isso troca o que está na tela pelo bot publicado no site. Continuar?")) abrirBot(botAtual);
  };
  seletor.onchange = () => {
    if (seletor.value === botAtual) return;
    if (!confirm("Trocar de bot? O que não foi salvo no bot atual será perdido.")) { seletor.value = botAtual; return; }
    abrirBot(seletor.value);
  };

  preencherSeletor([]);
  listarBots();

  // Navegador novo (sem rascunho): já abre o bot publicado, para não sobrescrever com o exemplo.
  if (guardado(CHAVE_FLUXO) === null) {
    buscarDoSite(botAtual).then((f) => window.FluxoEditor.definir(f)).catch(() => { /* segue com o exemplo */ });
  }
})();
