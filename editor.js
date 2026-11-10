/* Editor visual: blocos arrastáveis ligados por linhas. */
(function () {
  const CHAVE = "fluxobot:fluxo";
  const TITULOS = {
    inicio: "▶ Início", mensagem: "💬 Mensagem", pergunta: "❓ Pergunta",
    botoes: "🔘 Botões", webhook: "📤 Enviar dados", fim: "⏹ Fim",
  };

  const quadro = document.getElementById("quadro");
  const svg = document.getElementById("linhas");
  let fluxo = carregar();
  let ligando = null; // { from, port } enquanto o usuário liga dois blocos

  const novoId = () => "n" + Math.random().toString(36).slice(2, 8);

  function exemplo() {
    return {
      nome: "Meu primeiro fluxo",
      nodes: [
        { id: "a", type: "inicio", x: 40, y: 60, data: {} },
        { id: "b", type: "mensagem", x: 320, y: 40, data: { texto: "Olá! 👋 Eu sou o assistente virtual." } },
        { id: "c", type: "pergunta", x: 600, y: 40, data: { texto: "Qual é o seu nome?", variavel: "nome", tipo: "texto" } },
        { id: "d", type: "botoes", x: 880, y: 40, data: { texto: "Prazer, {{nome}}! Como posso ajudar?", variavel: "interesse", opcoes: ["Quero um orçamento", "Tenho uma dúvida"] } },
        { id: "e", type: "pergunta", x: 1160, y: 20, data: { texto: "Qual o seu e-mail para eu te enviar o orçamento?", variavel: "email", tipo: "email" } },
        { id: "f", type: "mensagem", x: 1160, y: 260, data: { texto: "Pode mandar sua dúvida por e-mail que respondemos rapidinho!" } },
        { id: "g", type: "webhook", x: 1440, y: 20, data: { url: "" } },
        { id: "h", type: "fim", x: 1720, y: 40, data: {} },
      ],
      edges: [
        { from: "a", port: "out", to: "b" }, { from: "b", port: "out", to: "c" },
        { from: "c", port: "out", to: "d" }, { from: "d", port: 0, to: "e" },
        { from: "d", port: 1, to: "f" }, { from: "e", port: "out", to: "g" },
        { from: "g", port: "out", to: "h" }, { from: "f", port: "out", to: "h" },
      ],
    };
  }

  function carregar() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE));
      if (salvo && Array.isArray(salvo.nodes) && Array.isArray(salvo.edges)) return salvo;
    } catch (e) { /* sem localStorage: usa o exemplo */ }
    return exemplo();
  }

  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(fluxo)); } catch (e) { /* ignora */ }
  }

  /* ---------- Desenho ---------- */
  function criar(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function campo(rotulo, tipo, valor, aoMudar, opcoes) {
    const caixa = criar("div");
    caixa.append(criar("label", "", rotulo));
    let el;
    if (tipo === "textarea") el = criar("textarea");
    else if (tipo === "select") {
      el = criar("select");
      opcoes.forEach(([v, t]) => { const o = criar("option", "", t); o.value = v; el.append(o); });
    } else { el = criar("input"); el.type = "text"; }
    el.value = valor ?? "";
    el.addEventListener("input", () => { aoMudar(el.value); salvar(); });
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    caixa.append(el);
    return caixa;
  }

  function desenharNo(no) {
    const el = criar("div", "no t-" + no.type);
    el.dataset.id = no.id;
    el.style.left = no.x + "px";
    el.style.top = no.y + "px";

    const cab = criar("header");
    cab.append(criar("span", "", TITULOS[no.type]));
    if (no.type !== "inicio") {
      const x = criar("button", "", "×");
      x.title = "Apagar bloco";
      x.onclick = () => removerNo(no.id);
      cab.append(x);
    }
    cab.addEventListener("mousedown", (e) => iniciarArraste(e, no, el));
    el.append(cab);

    const corpo = criar("div", "corpo");
    const set = (k) => (v) => { no.data[k] = v; };
    if (no.type === "mensagem") {
      corpo.append(campo("Texto (use {{variavel}})", "textarea", no.data.texto, set("texto")));
    } else if (no.type === "pergunta") {
      corpo.append(
        campo("Pergunta", "textarea", no.data.texto, set("texto")),
        campo("Guardar resposta em", "input", no.data.variavel, set("variavel")),
        campo("Tipo de resposta", "select", no.data.tipo || "texto", set("tipo"),
          [["texto", "Texto"], ["email", "E-mail"], ["numero", "Número"], ["telefone", "Telefone"]]),
      );
    } else if (no.type === "botoes") {
      corpo.append(
        campo("Pergunta", "textarea", no.data.texto, set("texto")),
        campo("Guardar escolha em", "input", no.data.variavel, set("variavel")),
      );
      (no.data.opcoes || []).forEach((rotulo, i) => {
        const linha = criar("div", "opcao");
        const inp = criar("input"); inp.value = rotulo;
        inp.addEventListener("input", () => { no.data.opcoes[i] = inp.value; salvar(); });
        inp.addEventListener("mousedown", (e) => e.stopPropagation());
        const del = criar("button", "", "×");
        del.onclick = () => removerOpcao(no, i);
        const porta = criar("div", "porta saida");
        porta.title = "Ligar esta opção";
        porta.onclick = (e) => { e.stopPropagation(); clicarSaida(no.id, i, porta); };
        linha.append(inp, del, porta);
        corpo.append(linha);
      });
      const mais = criar("button", "mini", "+ opção");
      mais.onclick = () => { no.data.opcoes = [...(no.data.opcoes || []), "Nova opção"]; salvar(); redesenhar(); };
      corpo.append(mais);
    } else if (no.type === "webhook") {
      corpo.append(campo("URL que recebe as respostas", "input", no.data.url, set("url")));
    } else if (no.type === "inicio") {
      corpo.append(criar("label", "", "O chat começa aqui."));
    } else if (no.type === "fim") {
      corpo.append(criar("label", "", "A conversa termina aqui."));
    }
    el.append(corpo);

    if (no.type !== "inicio") {
      const entrada = criar("div", "porta entrada");
      entrada.title = "Entrada";
      entrada.onclick = (e) => { e.stopPropagation(); clicarEntrada(no.id); };
      el.append(entrada);
    }
    if (no.type !== "botoes" && no.type !== "fim") {
      const saida = criar("div", "porta saida");
      saida.title = "Ligar ao próximo bloco";
      saida.onclick = (e) => { e.stopPropagation(); clicarSaida(no.id, "out", saida); };
      el.append(saida);
    }
    return el;
  }

  function redesenhar() {
    quadro.querySelectorAll(".no").forEach((n) => n.remove());
    fluxo.nodes.forEach((no) => quadro.append(desenharNo(no)));
    desenharLinhas();
  }

  function centroDaPorta(el) {
    const q = quadro.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - q.left + r.width / 2, y: r.top - q.top + r.height / 2 };
  }

  function acharPortaSaida(deId, porta) {
    const noEl = quadro.querySelector(`.no[data-id="${deId}"]`);
    if (!noEl) return null;
    const portas = noEl.querySelectorAll(".porta.saida");
    return String(porta) === "out" ? portas[0] : portas[Number(porta)];
  }

  function desenharLinhas() {
    svg.innerHTML = "";
    fluxo.edges.forEach((a) => {
      const pOrigem = acharPortaSaida(a.from, a.port);
      const pDestino = quadro.querySelector(`.no[data-id="${a.to}"] .porta.entrada`);
      if (!pOrigem || !pDestino) return;
      const i = centroDaPorta(pOrigem), f = centroDaPorta(pDestino);
      const dx = Math.max(60, Math.abs(f.x - i.x) / 2);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M${i.x},${i.y} C${i.x + dx},${i.y} ${f.x - dx},${f.y} ${f.x},${f.y}`);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "title");
      t.textContent = "Clique para apagar esta ligação";
      path.append(t);
      path.onclick = () => {
        fluxo = { ...fluxo, edges: fluxo.edges.filter((e) => e !== a) };
        salvar(); desenharLinhas();
      };
      svg.append(path);
    });
  }

  /* ---------- Ações ---------- */
  function clicarSaida(deId, porta, el) {
    quadro.querySelectorAll(".porta.ativa").forEach((p) => p.classList.remove("ativa"));
    ligando = { from: deId, port: porta };
    el.classList.add("ativa");
  }

  function clicarEntrada(paraId) {
    if (!ligando || ligando.from === paraId) return;
    const resto = fluxo.edges.filter((e) => !(e.from === ligando.from && String(e.port) === String(ligando.port)));
    fluxo = { ...fluxo, edges: [...resto, { from: ligando.from, port: ligando.port, to: paraId }] };
    ligando = null;
    salvar(); redesenhar();
  }

  function removerNo(id) {
    fluxo = {
      ...fluxo,
      nodes: fluxo.nodes.filter((n) => n.id !== id),
      edges: fluxo.edges.filter((e) => e.from !== id && e.to !== id),
    };
    salvar(); redesenhar();
  }

  function removerOpcao(no, indice) {
    no.data.opcoes = no.data.opcoes.filter((_, i) => i !== indice);
    // ajusta as ligações: apaga a da opção removida e desloca as seguintes
    fluxo = {
      ...fluxo,
      edges: fluxo.edges
        .filter((e) => !(e.from === no.id && Number(e.port) === indice))
        .map((e) => (e.from === no.id && Number(e.port) > indice ? { ...e, port: Number(e.port) - 1 } : e)),
    };
    salvar(); redesenhar();
  }

  function adicionar(tipo) {
    const c = document.getElementById("canvas");
    const dados = {
      mensagem: { texto: "Digite a mensagem..." },
      pergunta: { texto: "Qual a sua pergunta?", variavel: "resposta", tipo: "texto" },
      botoes: { texto: "Escolha uma opção:", variavel: "escolha", opcoes: ["Sim", "Não"] },
      webhook: { url: "" },
      fim: {},
    }[tipo];
    const no = { id: novoId(), type: tipo, x: c.scrollLeft + 60, y: c.scrollTop + 60, data: dados };
    fluxo = { ...fluxo, nodes: [...fluxo.nodes, no] };
    salvar(); redesenhar();
  }

  function iniciarArraste(ev, no, el) {
    if (ev.target.tagName === "BUTTON") return;
    const ox = ev.clientX - no.x, oy = ev.clientY - no.y;
    const mover = (e) => {
      no.x = Math.max(0, e.clientX - ox);
      no.y = Math.max(0, e.clientY - oy);
      el.style.left = no.x + "px";
      el.style.top = no.y + "px";
      desenharLinhas();
    };
    const soltar = () => {
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseup", soltar);
      salvar();
    };
    document.addEventListener("mousemove", mover);
    document.addEventListener("mouseup", soltar);
    ev.preventDefault();
  }

  /* ---------- Teste, arquivo e botões ---------- */
  const painel = document.getElementById("teste");
  function testar() {
    painel.classList.add("aberto");
    window.FluxoChat.executar(fluxo, document.getElementById("conversa"));
  }

  function baixar() {
    const blob = new Blob([JSON.stringify(fluxo, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fluxo.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function abrirArquivo(ev) {
    const arq = ev.target.files[0];
    if (!arq) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        const lido = JSON.parse(leitor.result);
        if (!Array.isArray(lido.nodes) || !Array.isArray(lido.edges)) throw new Error("formato");
        fluxo = lido;
        document.getElementById("nome").value = fluxo.nome || "";
        salvar(); redesenhar();
      } catch (e) {
        alert("Esse arquivo não parece ser um fluxo válido do FluxoBot.");
      }
    };
    leitor.readAsText(arq);
    ev.target.value = "";
  }

  document.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => adicionar(b.dataset.add)));
  document.getElementById("btn-testar").onclick = testar;
  document.getElementById("btn-reiniciar").onclick = testar;
  document.getElementById("btn-fechar").onclick = () => painel.classList.remove("aberto");
  document.getElementById("btn-baixar").onclick = baixar;
  document.getElementById("arquivo").onchange = abrirArquivo;
  document.getElementById("btn-novo").onclick = () => {
    if (!confirm("Isso apaga o fluxo atual e volta ao exemplo. Continuar?")) return;
    fluxo = exemplo(); salvar(); redesenhar();
  };
  const nome = document.getElementById("nome");
  nome.value = fluxo.nome || "";
  nome.oninput = () => { fluxo = { ...fluxo, nome: nome.value }; salvar(); };
  document.getElementById("canvas").addEventListener("click", () => {
    ligando = null;
    quadro.querySelectorAll(".porta.ativa").forEach((p) => p.classList.remove("ativa"));
  });

  // Pequena ponte para o salvar-github.js (que grava o fluxo no GitHub)
  window.FluxoEditor = {
    obter: () => fluxo,
    definir: (novo) => {
      fluxo = novo;
      nome.value = fluxo.nome || "";
      salvar(); redesenhar();
    },
  };

  redesenhar();
})();
