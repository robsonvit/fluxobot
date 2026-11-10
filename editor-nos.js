/* Tipos de bloco e o desenho de cada cartão no editor. */
(function (global) {
  const UI = global.UI;

  const TIPOS = {
    inicio: { titulo: "Início", icone: "play", cor: "#16a34a", fixo: true },
    mensagem: { titulo: "Mensagem", icone: "mensagem", cor: "#6366f1", descricao: "Envia um texto", padrao: () => ({ texto: "Digite a mensagem..." }) },
    imagem: { titulo: "Imagem", icone: "imagem", cor: "#ec4899", descricao: "Mostra uma foto", padrao: () => ({ url: "" }) },
    audio: { titulo: "Áudio", icone: "audio", cor: "#8b5cf6", descricao: "Toca um áudio", padrao: () => ({ url: "" }) },
    video: { titulo: "Vídeo", icone: "video", cor: "#14b8a6", descricao: "Mostra um vídeo", padrao: () => ({ url: "" }) },
    pergunta: { titulo: "Pergunta", icone: "pergunta", cor: "#0ea5e9", descricao: "Pede uma resposta digitada", padrao: () => ({ texto: "Qual a sua pergunta?", variavel: "resposta", tipo: "texto" }) },
    botoes: { titulo: "Botões", icone: "botoes", cor: "#f59e0b", descricao: "Opções para escolher", padrao: () => ({ texto: "Escolha uma opção:", variavel: "escolha", opcoes: ["Sim", "Não"] }) },
    espera: { titulo: "Pausa", icone: "espera", cor: "#64748b", descricao: "Espera alguns segundos", padrao: () => ({ segundos: 2 }) },
    redirecionar: { titulo: "Abrir link", icone: "link", cor: "#f97316", descricao: "Leva a um site (ex.: pagamento)", padrao: () => ({ url: "", novaAba: false }) },
    fim: { titulo: "Fim", icone: "fim", cor: "#ef4444", descricao: "Encerra a conversa", padrao: () => ({}) },
  };

  const GRUPOS_PALETA = [
    ["Conteúdo", ["mensagem", "imagem", "audio", "video"]],
    ["Interação", ["pergunta", "botoes"]],
    ["Fluxo", ["espera", "redirecionar", "fim"]],
  ];

  const ROTULO_ARQUIVO = { imagem: "imagem", audio: "áudio", video: "vídeo" };

  const pararMouse = (e) => e.stopPropagation();

  function campoTexto(ctx, rotulo, valor, aoMudar, opcoes) {
    const o = opcoes || {};
    const caixa = UI.el("label", "campo");
    caixa.append(UI.el("span", "rotulo", rotulo));
    const entrada = o.multilinha ? UI.el("textarea") : UI.el("input");
    if (!o.multilinha) entrada.type = "text";
    entrada.value = valor ?? "";
    entrada.placeholder = o.placeholder || "";
    if (o.multilinha) entrada.rows = 3;
    entrada.addEventListener("input", () => { aoMudar(entrada.value); ctx.aoMudar(); });
    entrada.addEventListener("mousedown", pararMouse);
    caixa.append(entrada);
    caixa.entrada = entrada;
    return caixa;
  }

  function campoSelecao(ctx, rotulo, valor, aoMudar, itens) {
    const caixa = UI.el("label", "campo");
    caixa.append(UI.el("span", "rotulo", rotulo));
    const sel = UI.el("select");
    itens.forEach(([v, t]) => { const o = UI.el("option", "", t); o.value = v; sel.append(o); });
    sel.value = valor;
    sel.addEventListener("change", () => { aoMudar(sel.value); ctx.aoMudar(); });
    sel.addEventListener("mousedown", pararMouse);
    caixa.append(sel);
    return caixa;
  }

  /* Botõezinhos {{variavel}} que inserem o nome da variável no texto */
  function chipsDeVariaveis(ctx, campo) {
    const vars = ctx.variaveis();
    if (!vars.length) return null;
    const linha = UI.el("div", "chips");
    linha.append(UI.el("span", "chips-rotulo", "Inserir:"));
    vars.forEach((v) => {
      const b = UI.el("button", "chip-var", "{{" + v + "}}");
      b.type = "button";
      b.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
      b.onclick = () => {
        const t = campo.entrada;
        const ini = t.selectionStart ?? t.value.length;
        const fim = t.selectionEnd ?? ini;
        t.value = t.value.slice(0, ini) + "{{" + v + "}}" + t.value.slice(fim);
        t.focus();
        t.selectionStart = t.selectionEnd = ini + v.length + 4;
        t.dispatchEvent(new Event("input"));
      };
      linha.append(b);
    });
    return linha;
  }

  function campoEspera(ctx, no) {
    const caixa = UI.el("label", "campo campo-linha");
    caixa.append(UI.el("span", "rotulo", "Esperar antes"));
    const entrada = UI.el("input");
    entrada.type = "text";
    entrada.className = "mini-num";
    entrada.placeholder = "0,5";
    entrada.value = no.data.espera ?? "";
    entrada.addEventListener("input", () => { no.data.espera = entrada.value; ctx.aoMudar(); });
    entrada.addEventListener("mousedown", pararMouse);
    caixa.append(entrada, UI.el("span", "unidade", "seg"));
    return caixa;
  }

  function porta(classe, titulo) {
    const p = UI.el("div", "porta " + classe);
    p.title = titulo;
    return p;
  }

  function corpoDeMidia(ctx, no, corpo) {
    const campo = campoTexto(ctx, "Link público (https://...) ou arquivo", no.data.url, (v) => { no.data.url = v; }, { placeholder: "Cole um link ou envie do PC" });
    corpo.append(campo);
    if (no.type === "imagem") {
      const previa = UI.el("img", "previa");
      previa.alt = "";
      const atualizar = () => {
        const url = (no.data.url || "").trim();
        previa.style.display = url ? "block" : "none";
        if (url) previa.src = ctx.resolverUrl(url);
      };
      previa.onerror = () => { previa.style.display = "none"; };
      campo.entrada.addEventListener("change", atualizar);
      atualizar();
      corpo.append(previa);
    }
    const enviar = UI.el("button", "botao-linha", "");
    enviar.type = "button";
    enviar.insertAdjacentHTML("beforeend", UI.icone("enviar", 15));
    enviar.append(UI.el("span", "", "Enviar " + ROTULO_ARQUIVO[no.type] + " do PC"));
    enviar.addEventListener("mousedown", pararMouse);
    enviar.onclick = async () => {
      const url = await ctx.enviarArquivo(no.type);
      if (url) { no.data.url = url; ctx.aoMudar(); ctx.redesenhar(); }
    };
    corpo.append(enviar, campoEspera(ctx, no));
  }

  function corpoDeBotoes(ctx, no, corpo) {
    const texto = campoTexto(ctx, "Pergunta (opcional)", no.data.texto, (v) => { no.data.texto = v; }, { multilinha: true });
    corpo.append(texto);
    const chips = chipsDeVariaveis(ctx, texto);
    if (chips) corpo.append(chips);
    corpo.append(
      campoTexto(ctx, "Guardar escolha em", no.data.variavel, (v) => { no.data.variavel = v; }, { placeholder: "nome da variável" }),
      campoEspera(ctx, no),
    );
    corpo.append(UI.el("div", "rotulo-secao", "Opções"));
    (no.data.opcoes || []).forEach((rotulo, i) => {
      const linha = UI.el("div", "opcao");
      const entrada = UI.el("input");
      entrada.type = "text";
      entrada.value = rotulo;
      entrada.addEventListener("input", () => { no.data.opcoes[i] = entrada.value; ctx.aoMudar(); });
      entrada.addEventListener("mousedown", pararMouse);
      const apagar = UI.el("button", "icone-mini");
      apagar.type = "button";
      apagar.title = "Remover opção";
      apagar.innerHTML = UI.icone("x", 14);
      apagar.addEventListener("mousedown", pararMouse);
      apagar.onclick = () => ctx.removerOpcao(no, i);
      const p = porta("saida", "Arraste até o próximo bloco");
      p.dataset.porta = String(i);
      p.addEventListener("mousedown", (e) => ctx.iniciarLigacao(e, no.id, i, p));
      linha.append(entrada, apagar, p);
      corpo.append(linha);
    });
    const mais = UI.el("button", "botao-linha", "");
    mais.type = "button";
    mais.insertAdjacentHTML("beforeend", UI.icone("novo", 15));
    mais.append(UI.el("span", "", "Adicionar opção"));
    mais.addEventListener("mousedown", pararMouse);
    mais.onclick = () => ctx.adicionarOpcao(no);
    corpo.append(mais);
  }

  function montarCorpo(ctx, no, corpo) {
    const set = (k) => (v) => { no.data[k] = v; };
    if (no.type === "mensagem") {
      const texto = campoTexto(ctx, "Texto  (*negrito*  _itálico_)", no.data.texto, set("texto"), { multilinha: true });
      corpo.append(texto);
      const chips = chipsDeVariaveis(ctx, texto);
      if (chips) corpo.append(chips);
      corpo.append(campoEspera(ctx, no));
    } else if (no.type === "imagem" || no.type === "audio" || no.type === "video") {
      corpoDeMidia(ctx, no, corpo);
    } else if (no.type === "pergunta") {
      const texto = campoTexto(ctx, "Pergunta", no.data.texto, set("texto"), { multilinha: true });
      corpo.append(texto);
      const chips = chipsDeVariaveis(ctx, texto);
      if (chips) corpo.append(chips);
      corpo.append(
        campoTexto(ctx, "Guardar resposta em", no.data.variavel, set("variavel"), { placeholder: "nome da variável" }),
        campoSelecao(ctx, "Tipo de resposta", no.data.tipo || "texto", set("tipo"),
          [["texto", "Texto"], ["email", "E-mail"], ["numero", "Número"], ["telefone", "Telefone"]]),
        campoEspera(ctx, no),
      );
    } else if (no.type === "botoes") {
      corpoDeBotoes(ctx, no, corpo);
    } else if (no.type === "espera") {
      corpo.append(campoTexto(ctx, "Segundos de pausa", no.data.segundos, set("segundos")));
    } else if (no.type === "redirecionar") {
      corpo.append(
        campoTexto(ctx, "Endereço do link", no.data.url, set("url"), { placeholder: "https://..." }),
        campoSelecao(ctx, "Abrir em", no.data.novaAba ? "sim" : "nao", (v) => { no.data.novaAba = v === "sim"; },
          [["nao", "Mesma página (encerra o chat)"], ["sim", "Nova aba (o chat continua)"]]),
      );
    } else if (no.type === "inicio") {
      corpo.append(UI.el("p", "dica-no", "A conversa começa aqui. Arraste a bolinha da direita até o primeiro bloco."));
    } else if (no.type === "fim") {
      corpo.append(UI.el("p", "dica-no", "A conversa termina aqui."));
    }
  }

  function criarNo(no, ctx) {
    const tipo = TIPOS[no.type];
    if (!tipo) return null;
    const el = UI.el("div", "no t-" + no.type);
    el.dataset.id = no.id;
    el.dataset.type = no.type;
    el.style.left = no.x + "px";
    el.style.top = no.y + "px";
    el.style.setProperty("--cor-no", tipo.cor);

    if (!tipo.fixo) {
      const acoes = UI.el("div", "no-acoes");
      const dup = UI.el("button", "", "");
      dup.type = "button";
      dup.title = "Duplicar (Ctrl+D)";
      dup.innerHTML = UI.icone("copiar", 15);
      dup.onclick = () => ctx.duplicar(no.id);
      const del = UI.el("button", "perigo", "");
      del.type = "button";
      del.title = "Excluir (Delete)";
      del.innerHTML = UI.icone("lixeira", 15);
      del.onclick = () => ctx.excluir(no.id);
      [dup, del].forEach((b) => b.addEventListener("mousedown", pararMouse));
      acoes.append(dup, del);
      el.append(acoes);
    }

    const cab = UI.el("div", "no-cab");
    const chip = UI.el("span", "chip");
    chip.innerHTML = UI.icone(tipo.icone, 15);
    cab.append(chip, UI.el("span", "no-titulo", tipo.titulo));
    cab.addEventListener("mousedown", (e) => ctx.iniciarArraste(e, no.id));
    el.append(cab);

    const corpo = UI.el("div", "no-corpo");
    montarCorpo(ctx, no, corpo);
    el.append(corpo);

    if (no.type !== "inicio") el.append(porta("entrada", "Entrada"));
    if (no.type !== "botoes" && no.type !== "fim") {
      const saida = porta("saida", "Arraste até o próximo bloco");
      saida.dataset.porta = "out";
      saida.addEventListener("mousedown", (e) => ctx.iniciarLigacao(e, no.id, "out", saida));
      el.append(saida);
    }

    el.addEventListener("focusin", () => ctx.selecionar(no.id));
    return el;
  }

  global.EditorNos = { TIPOS, GRUPOS_PALETA, criarNo };
})(window);
