/* Converte um fluxo exportado do Typebot (.json) para o formato do FluxoBot.
   Funciona no navegador (window.ImportarTypebot) e no Node (para testes). */
(function (global) {
  const ENTRADAS = {
    "text input": "texto",
    "email input": "email",
    "number input": "numero",
    "phone number input": "telefone",
  };
  const ALTURA_BLOCO = { mensagem: 170, pergunta: 270, botoes: 190, imagem: 220, audio: 220, video: 220, redirecionar: 220, espera: 140 };
  const ALTURA_OPCAO = 36;
  const MARGEM = 40;

  const ehTypebot = (j) => !!j && Array.isArray(j.groups) && Array.isArray(j.edges);
  const tipoDe = (b) => String(b.type || "").toLowerCase();

  /* ---------- Texto rico -> texto com *negrito* e _itálico_ ---------- */
  function marcar(texto, negrito, italico) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(texto);
    if (!m[2]) return texto;
    let miolo = m[2];
    if (italico) miolo = "_" + miolo + "_";
    if (negrito) miolo = "*" + miolo + "*";
    return m[1] + miolo + m[3];
  }

  function textoDe(el) {
    if (el == null) return "";
    if (typeof el.text === "string") return marcar(el.text, !!el.bold, !!el.italic);
    const filhos = Array.isArray(el.children) ? el.children.map(textoDe).join("") : "";
    if (el.type === "a" && el.url && !filhos.includes(el.url)) return filhos + " " + el.url;
    if (el.type === "li") return "• " + filhos;
    return filhos;
  }

  function richTextParaTexto(rich) {
    if (!Array.isArray(rich)) return "";
    return rich.map(textoDe).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function segundos(valor) {
    const n = Number(String(valor ?? "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  /* ---------- Tema ---------- */
  const corHex = (v) => (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) ? v.trim() : undefined);

  // Lê só TEXTOS do código de cabeçalho do Typebot (nome, foto, cor da barra). Nada é executado.
  function lerBarraDoCodigo(codigo) {
    if (!/user-bar/.test(codigo || "")) return null;
    const nomeStatus = /<span>([^<]*)<\/span>\s*<span class="status">([^<]*)<\/span>/.exec(codigo);
    const foto = /<img[^>]*?src\s*=\s*["']([^"']+)["']/.exec(codigo);
    const cor = /\.user-bar\s*\{[^}]*?background\s*:\s*(#[0-9a-fA-F]{3,8})/.exec(codigo);
    if (!nomeStatus && !foto) return null;
    const barra = { mostrarBarra: true };
    if (nomeStatus) { barra.nome = nomeStatus[1].trim(); barra.status = nomeStatus[2].trim(); }
    if (foto) barra.foto = foto[1].trim();
    if (cor) barra.corBarra = cor[1];
    return barra;
  }

  function converterTema(typebot) {
    const tema = {};
    const guardar = (chave, valor) => { if (valor !== undefined && valor !== "") tema[chave] = valor; };
    const geral = ((typebot.theme || {}).general) || {};
    const chat = ((typebot.theme || {}).chat) || {};
    const fundo = geral.background || {};
    if (fundo.type === "Color") guardar("corFundo", corHex(fundo.content));
    if (fundo.type === "Image" && fundo.content) guardar("fundoImagem", fundo.content);
    guardar("corBalaoBot", corHex((chat.hostBubbles || {}).backgroundColor));
    guardar("corTextoBot", corHex((chat.hostBubbles || {}).color));
    guardar("corBalaoUsuario", corHex((chat.guestBubbles || {}).backgroundColor));
    guardar("corTextoUsuario", corHex((chat.guestBubbles || {}).color));
    guardar("corBotao", corHex((chat.buttons || {}).backgroundColor));
    guardar("corTextoBotao", corHex((chat.buttons || {}).color));
    const barra = lerBarraDoCodigo((((typebot.settings || {}).metadata) || {}).customHeadCode);
    if (barra) Object.assign(tema, barra);
    else if ((chat.hostAvatar || {}).isEnabled && chat.hostAvatar.url) tema.foto = chat.hostAvatar.url;
    return Object.keys(tema).length ? tema : null;
  }

  /* ---------- Conversão ---------- */
  function converter(typebot) {
    if (!ehTypebot(typebot)) throw new Error("Este arquivo não parece ser um fluxo exportado do Typebot.");

    const nomesVariaveis = new Map((typebot.variables || []).map((v) => [v.id, v.name]));
    const arestas = new Map(typebot.edges.map((e) => [e.id, e]));
    const indiceOrigem = new Map(); // "blocoId:itemId" ou "blocoId" ou "evento:id" -> aresta
    typebot.edges.forEach((e) => {
      const f = e.from || {};
      if (f.eventId) indiceOrigem.set("evento:" + f.eventId, e);
      else if (f.blockId) indiceOrigem.set(f.itemId ? f.blockId + ":" + f.itemId : f.blockId, e);
    });

    const ignorados = {};
    const midias = [];
    let contadorNos = 0;
    const novoId = () => "n" + ++contadorNos;
    const blocoParaNo = new Map();   // id do bloco do Typebot -> id do nó novo
    const semDestino = new Set();    // blocos ignorados no fim de um grupo
    const primeiroDoGrupo = new Map();
    const nos = [];                  // { no, bloco, grupo, indice }
    let arestaInicio = null;

    // Typebot v5: o início é um bloco "start" dentro de um grupo
    typebot.groups.forEach((g) => (g.blocks || []).forEach((b) => {
      if (tipoDe(b) === "start") arestaInicio = b.outgoingEdgeId || null;
    }));
    const evento = (typebot.events || []).find((e) => e.type === "start");
    if (evento) arestaInicio = evento.outgoingEdgeId || (indiceOrigem.get("evento:" + evento.id) || {}).id || null;

    /* 1) Cria os nós de cada grupo, empilhados na vertical */
    typebot.groups.forEach((grupo) => {
      const gx = (grupo.graphCoordinates || {}).x || 0;
      const gy = (grupo.graphCoordinates || {}).y || 0;
      let y = gy;
      let espera = 0;
      let indice = 0;
      let pendentes = []; // ids de blocos ignorados/esperas aguardando o próximo nó
      const doGrupo = [];

      const criar = (tipo, data, bloco, ids) => {
        const dados = { ...data };
        if (espera > 0) dados.espera = espera;
        espera = 0;
        const id = novoId();
        const no = { id, type: tipo, x: gx, y, data: dados };
        y += (ALTURA_BLOCO[tipo] || 180) + (tipo === "botoes" ? (dados.opcoes || []).length * ALTURA_OPCAO : 0);
        const reg = { no, bloco, grupo: grupo.id, indice: indice++ };
        nos.push(reg);
        doGrupo.push(reg);
        [bloco.id, ...(ids || []), ...pendentes].forEach((b) => blocoParaNo.set(b, id));
        pendentes = [];
        if (!primeiroDoGrupo.has(grupo.id)) primeiroDoGrupo.set(grupo.id, id);
        return reg;
      };

      (grupo.blocks || []).forEach((bloco) => {
        const tipo = tipoDe(bloco);
        const opt = bloco.options || {};
        const ignorar = () => { ignorados[bloco.type] = (ignorados[bloco.type] || 0) + 1; pendentes.push(bloco.id); };

        if (tipo === "start") return;
        if (tipo === "wait") { espera += segundos(opt.secondsToWaitFor); pendentes.push(bloco.id); return; }

        if (tipo === "text") {
          criar("mensagem", { texto: richTextParaTexto((bloco.content || {}).richText) }, bloco);
        } else if (tipo === "image" || tipo === "audio" || tipo === "video") {
          const url = (bloco.content || {}).url;
          if (!url) return ignorar();
          midias.push(url);
          criar(tipo === "image" ? "imagem" : tipo, { url }, bloco);
        } else if (tipo === "redirect") {
          if (!opt.url) return ignorar();
          criar("redirecionar", { url: opt.url, novaAba: !!opt.isNewTab }, bloco);
        } else if (tipo === "choice input") {
          const itens = bloco.items || [];
          const opcoes = itens.map((i) => i.content || "Opção");
          const variavel = nomesVariaveis.get(opt.variableId) || "";
          // Junta com o texto logo acima (a pergunta), quando ele vem colado no botão
          const anterior = doGrupo[doGrupo.length - 1];
          const colavel = anterior && anterior.no.type === "mensagem" && pendentes.length === 0 && espera === 0;
          if (colavel) {
            const dados = { texto: anterior.no.data.texto, variavel, opcoes };
            if (anterior.no.data.espera) dados.espera = anterior.no.data.espera;
            anterior.no.type = "botoes";
            anterior.no.data = dados;
            anterior.bloco = bloco;
            anterior.itens = itens;
            blocoParaNo.set(bloco.id, anterior.no.id);
            y += opcoes.length * ALTURA_OPCAO;
          } else {
            criar("botoes", { texto: "", variavel, opcoes }, bloco).itens = itens;
          }
        } else if (ENTRADAS[tipo]) {
          const variavel = nomesVariaveis.get(opt.variableId) || "resposta" + (contadorNos + 1);
          const anterior = doGrupo[doGrupo.length - 1];
          const colavel = anterior && anterior.no.type === "mensagem" && pendentes.length === 0 && espera === 0;
          if (colavel) {
            anterior.no.type = "pergunta";
            anterior.no.data = { ...anterior.no.data, variavel, tipo: ENTRADAS[tipo] };
            anterior.bloco = bloco;
            blocoParaNo.set(bloco.id, anterior.no.id);
          } else {
            criar("pergunta", { texto: "", variavel, tipo: ENTRADAS[tipo] }, bloco);
          }
        } else {
          ignorar();
        }
      });

      // Espera sobrando no fim do grupo vira um bloco de espera
      if (espera > 0) {
        const ultimoBloco = (grupo.blocks || [])[(grupo.blocks || []).length - 1] || { id: "espera-" + grupo.id };
        const reg = criar("espera", { segundos: espera }, { ...ultimoBloco, id: "espera-" + grupo.id }, []);
        delete reg.no.data.espera;
        reg.bloco = ultimoBloco;
      }
      pendentes.forEach((b) => semDestino.add(b));
    });

    /* 2) Descobre para onde cada aresta aponta */
    function alvoDaAresta(arestaId) {
      const e = arestaId ? arestas.get(arestaId) : null;
      if (!e || !e.to) return null;
      if (e.to.blockId) {
        if (blocoParaNo.has(e.to.blockId)) return blocoParaNo.get(e.to.blockId);
        if (semDestino.has(e.to.blockId)) return null;
      }
      return primeiroDoGrupo.get(e.to.groupId) || null;
    }

    const saidas = [];
    const ligar = (de, porta, para) => { if (para) saidas.push({ from: de, port: porta, to: para }); };

    nos.forEach((reg, k) => {
      const seguinte = nos[k + 1] && nos[k + 1].grupo === reg.grupo ? nos[k + 1].no.id : null;
      const bloco = reg.bloco;
      if (reg.no.type === "botoes") {
        (reg.itens || []).forEach((item, i) => {
          const aresta = item.outgoingEdgeId || (indiceOrigem.get(bloco.id + ":" + item.id) || {}).id;
          ligar(reg.no.id, i, aresta ? alvoDaAresta(aresta) : seguinte);
        });
        return;
      }
      if (reg.no.type === "redirecionar" && !reg.no.data.novaAba) return; // a conversa termina no link
      const aresta = bloco.outgoingEdgeId || (indiceOrigem.get(bloco.id) || {}).id;
      ligar(reg.no.id, "out", aresta ? alvoDaAresta(aresta) : seguinte);
    });

    /* 3) Início + posições (começando perto do canto) */
    const inicio = { id: novoId(), type: "inicio", x: ((evento || {}).graphCoordinates || {}).x || 0, y: ((evento || {}).graphCoordinates || {}).y || 0, data: {} };
    ligar(inicio.id, "out", alvoDaAresta(arestaInicio) || (nos[0] && nos[0].no.id));

    const todos = [inicio, ...nos.map((r) => r.no)];
    const minX = Math.min(...todos.map((n) => n.x));
    const minY = Math.min(...todos.map((n) => n.y));
    todos.forEach((n) => { n.x = Math.round(n.x - minX + MARGEM); n.y = Math.round(n.y - minY + MARGEM); });

    const tema = converterTema(typebot);
    const fluxo = { nome: typebot.name || "Bot importado", nodes: todos, edges: saidas };
    if (tema) fluxo.tema = tema;

    return {
      fluxo,
      relatorio: {
        tema: !!tema,
        barraDeContato: !!(tema && tema.mostrarBarra),
        blocosNoTypebot: typebot.groups.reduce((s, g) => s + (g.blocks || []).length, 0),
        blocosCriados: nos.length,
        ignorados,
        midias,
      },
    };
  }

  const api = { converter, ehTypebot, richTextParaTexto };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.ImportarTypebot = api;
})(typeof window !== "undefined" ? window : globalThis);
