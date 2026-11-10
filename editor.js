/* Editor visual: canvas com zoom, seleção, ligações por arraste, duplicar, desfazer... */
(function () {
  const { TIPOS, GRUPOS_PALETA, criarNo } = window.EditorNos;
  const UI = window.UI;
  const $ = (id) => document.getElementById(id);

  const CHAVE_FLUXO = "fluxobot:fluxo";
  const GRADE = 10;
  const LARGURA_NO = 250;
  const ESCALA_MIN = 0.3;
  const ESCALA_MAX = 1.6;
  const LIMITE_HISTORICO = 100;
  const ESPERA_COMMIT_MS = 600;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const canvas = $("canvas");
  const palco = $("palco");
  const quadro = $("quadro");
  const svg = $("linhas");

  let escala = 1;
  const selecionados = new Set();
  let pilha = [];
  let indice = 0;
  let timerCommit = null;
  let fluxo = migrar(carregarLocal() || exemplo());
  pilha = [JSON.stringify(fluxo)];

  const novoId = () => "n" + Math.random().toString(36).slice(2, 8);
  const snap = (v) => Math.max(0, Math.round(v / GRADE) * GRADE);
  const achar = (id) => fluxo.nodes.find((n) => n.id === id);

  /* ---------- Dados ---------- */
  function exemplo() {
    return {
      nome: "Meu primeiro fluxo",
      nodes: [
        { id: "a", type: "inicio", x: 40, y: 60, data: {} },
        { id: "b", type: "mensagem", x: 340, y: 40, data: { texto: "Olá! 👋 Eu sou o assistente virtual." } },
        { id: "c", type: "pergunta", x: 640, y: 40, data: { texto: "Qual é o seu nome?", variavel: "nome", tipo: "texto" } },
        { id: "d", type: "botoes", x: 940, y: 40, data: { texto: "Prazer, {{nome}}! Como posso ajudar?", variavel: "interesse", opcoes: ["Quero um orçamento", "Tenho uma dúvida"] } },
        { id: "e", type: "pergunta", x: 1240, y: 20, data: { texto: "Qual o seu e-mail para eu te enviar o orçamento?", variavel: "email", tipo: "email" } },
        { id: "f", type: "mensagem", x: 1240, y: 340, data: { texto: "Pode mandar sua dúvida por e-mail que respondemos rapidinho!" } },
        { id: "h", type: "fim", x: 1540, y: 60, data: {} },
      ],
      edges: [
        { from: "a", port: "out", to: "b" }, { from: "b", port: "out", to: "c" },
        { from: "c", port: "out", to: "d" }, { from: "d", port: 0, to: "e" },
        { from: "d", port: 1, to: "f" }, { from: "e", port: "out", to: "h" },
        { from: "f", port: "out", to: "h" },
      ],
    };
  }

  function carregarLocal() {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_FLUXO));
      if (salvo && Array.isArray(salvo.nodes) && Array.isArray(salvo.edges)) return salvo;
    } catch (e) { /* sem rascunho local */ }
    return null;
  }

  function salvarLocal() {
    try { localStorage.setItem(CHAVE_FLUXO, JSON.stringify(fluxo)); } catch (e) { /* ignora */ }
  }

  /* O envio para a planilha agora é automático: blocos "Enviar dados" antigos são removidos
     e as ligações passam direto pelo lugar deles. */
  function migrar(f) {
    const antigos = f.nodes.filter((n) => n.type === "webhook");
    if (!antigos.length) return f;
    let arestas = f.edges;
    antigos.forEach((w) => {
      const saida = arestas.find((e) => e.from === w.id && String(e.port) === "out");
      const novas = saida ? arestas.filter((e) => e.to === w.id).map((e) => ({ ...e, to: saida.to })) : [];
      arestas = [...arestas.filter((e) => e.to !== w.id && e.from !== w.id), ...novas];
    });
    return { ...f, nodes: f.nodes.filter((n) => n.type !== "webhook"), edges: arestas };
  }

  /* ---------- Histórico (desfazer / refazer) ---------- */
  function atualizarEstadoDoHistorico() {
    $("btn-desfazer").disabled = indice <= 0;
    $("btn-refazer").disabled = indice >= pilha.length - 1;
  }

  function marcarSujo() {
    const e = $("estado");
    e.textContent = "Alterações não salvas";
    e.className = "estado sujo";
  }

  function marcarSalvo() {
    const e = $("estado");
    e.textContent = "Tudo salvo";
    e.className = "estado salvo";
    setTimeout(() => {
      if (e.classList.contains("salvo")) { e.className = "estado"; e.textContent = ""; }
    }, 3000);
  }

  function commit() {
    clearTimeout(timerCommit);
    salvarLocal();
    const atual = JSON.stringify(fluxo);
    if (atual === pilha[indice]) return;
    pilha = [...pilha.slice(0, indice + 1), atual].slice(-LIMITE_HISTORICO);
    indice = pilha.length - 1;
    marcarSujo();
    atualizarEstadoDoHistorico();
  }

  const agendarCommit = () => { clearTimeout(timerCommit); timerCommit = setTimeout(commit, ESPERA_COMMIT_MS); };

  function irParaHistorico(novoIndice) {
    commit();
    if (novoIndice < 0 || novoIndice >= pilha.length) return;
    indice = novoIndice;
    fluxo = JSON.parse(pilha[indice]);
    [...selecionados].forEach((id) => { if (!achar(id)) selecionados.delete(id); });
    $("nome").value = fluxo.nome || "";
    salvarLocal();
    redesenhar();
    marcarSujo();
    atualizarEstadoDoHistorico();
  }

  /* ---------- Desenho ---------- */
  const variaveis = () => Array.from(new Set(
    fluxo.nodes.filter((n) => (n.type === "pergunta" || n.type === "botoes") && n.data.variavel).map((n) => n.data.variavel),
  ));

  const observador = new ResizeObserver(() => agendarLinhas());
  let linhasAgendadas = false;
  function agendarLinhas() {
    if (linhasAgendadas) return;
    linhasAgendadas = true;
    requestAnimationFrame(() => { linhasAgendadas = false; desenharLinhas(); });
  }

  function ajustarPalco() {
    const maxX = Math.max(0, ...fluxo.nodes.map((n) => n.x));
    const maxY = Math.max(0, ...fluxo.nodes.map((n) => n.y));
    const largura = Math.max(3000, maxX + 900);
    const altura = Math.max(2000, maxY + 900);
    quadro.style.width = largura + "px";
    quadro.style.height = altura + "px";
    quadro.style.transform = `scale(${escala})`;
    palco.style.width = largura * escala + "px";
    palco.style.height = altura * escala + "px";
  }

  function definirEscala(nova) {
    escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, nova));
    ajustarPalco();
    $("zoom-valor").textContent = Math.round(escala * 100) + "%";
  }

  function redesenhar() {
    ajustarPalco();
    quadro.querySelectorAll(".no").forEach((n) => { observador.unobserve(n); n.remove(); });
    fluxo.nodes.forEach((no) => {
      const el = criarNo(no, ctx);
      if (!el) return;
      if (selecionados.has(no.id)) el.classList.add("selecionado");
      quadro.append(el);
      observador.observe(el);
    });
    desenharLinhas();
  }

  function centro(elemento) {
    const q = quadro.getBoundingClientRect();
    const r = elemento.getBoundingClientRect();
    return { x: (r.left - q.left + r.width / 2) / escala, y: (r.top - q.top + r.height / 2) / escala };
  }

  const noSvg = (tag, atributos) => {
    const e = document.createElementNS(SVG_NS, tag);
    Object.entries(atributos || {}).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
  };

  function curva(i, f) {
    const dx = Math.max(50, Math.abs(f.x - i.x) / 2);
    return `M${i.x},${i.y} C${i.x + dx},${i.y} ${f.x - dx},${f.y} ${f.x},${f.y}`;
  }

  function portaDeSaida(deId, porta) {
    const noEl = quadro.querySelector(`.no[data-id="${deId}"]`);
    return noEl ? noEl.querySelector(`.porta.saida[data-porta="${String(porta)}"]`) : null;
  }

  function desenharLinhas() {
    svg.innerHTML = "";
    const defs = noSvg("defs");
    const seta = noSvg("marker", { id: "seta", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
    seta.append(noSvg("path", { d: "M0,1 L10,5 L0,9 z", fill: "#94a3b8" }));
    defs.append(seta);
    svg.append(defs);
    quadro.querySelectorAll(".porta.ligada").forEach((p) => p.classList.remove("ligada"));

    fluxo.edges.forEach((a) => {
      const pOrigem = portaDeSaida(a.from, a.port);
      const pDestino = quadro.querySelector(`.no[data-id="${a.to}"] .porta.entrada`);
      if (!pOrigem || !pDestino) return;
      pOrigem.classList.add("ligada");
      pDestino.classList.add("ligada");
      const i = centro(pOrigem);
      const f = centro(pDestino);
      const d = curva(i, f);
      const g = noSvg("g", { class: "aresta" });
      g.append(noSvg("path", { d, class: "area-clique" }), noSvg("path", { d, class: "linha", "marker-end": "url(#seta)" }));
      const mx = (i.x + 3 * (i.x + Math.max(50, Math.abs(f.x - i.x) / 2)) + 3 * (f.x - Math.max(50, Math.abs(f.x - i.x) / 2)) + f.x) / 8;
      const my = (i.y + 3 * i.y + 3 * f.y + f.y) / 8;
      const x = noSvg("g", { class: "remover", transform: `translate(${mx},${my})` });
      x.append(noSvg("circle", { r: "11" }), noSvg("path", { d: "M-3.5,-3.5 L3.5,3.5 M3.5,-3.5 L-3.5,3.5" }));
      const t = noSvg("title");
      t.textContent = "Remover ligação";
      x.append(t);
      x.addEventListener("mousedown", (e) => e.stopPropagation());
      x.addEventListener("click", (e) => { e.stopPropagation(); removerAresta(a); });
      g.append(x);
      svg.append(g);
    });
  }

  /* ---------- Seleção ---------- */
  function atualizarSelecao() {
    quadro.querySelectorAll(".no").forEach((el) => el.classList.toggle("selecionado", selecionados.has(el.dataset.id)));
  }

  function selecionar(id) {
    if (selecionados.size === 1 && selecionados.has(id)) return;
    selecionados.clear();
    selecionados.add(id);
    atualizarSelecao();
  }

  function limparSelecao() {
    if (!selecionados.size) return;
    selecionados.clear();
    atualizarSelecao();
  }

  /* ---------- Operações ---------- */
  function removerAresta(a) {
    fluxo = { ...fluxo, edges: fluxo.edges.filter((e) => e !== a) };
    commit();
    desenharLinhas();
  }

  function conectar(deId, porta, paraId) {
    const resto = fluxo.edges.filter((e) => !(e.from === deId && String(e.port) === String(porta)));
    fluxo = { ...fluxo, edges: [...resto, { from: deId, port: porta, to: paraId }] };
    commit();
    desenharLinhas();
  }

  function centroDaVista() {
    return { x: (canvas.scrollLeft + canvas.clientWidth / 2) / escala, y: (canvas.scrollTop + canvas.clientHeight / 2) / escala };
  }

  function adicionar(tipo, x, y, ligarDe) {
    const info = TIPOS[tipo];
    if (!info || info.fixo) return null;
    const c = centroDaVista();
    let nx = snap(x ?? c.x - LARGURA_NO / 2);
    let ny = snap(y ?? c.y - 80);
    while (fluxo.nodes.some((n) => Math.abs(n.x - nx) < 30 && Math.abs(n.y - ny) < 30)) { nx += 40; ny += 40; }
    const no = { id: novoId(), type: tipo, x: nx, y: ny, data: info.padrao() };
    const arestas = ligarDe ? [...fluxo.edges.filter((e) => !(e.from === ligarDe.id && String(e.port) === String(ligarDe.porta))), { from: ligarDe.id, port: ligarDe.porta, to: no.id }] : fluxo.edges;
    fluxo = { ...fluxo, nodes: [...fluxo.nodes, no], edges: arestas };
    selecionados.clear();
    selecionados.add(no.id);
    commit();
    redesenhar();
    return no;
  }

  function excluirIds(ids) {
    const alvo = new Set(ids.filter((id) => { const n = achar(id); return n && n.type !== "inicio"; }));
    if (!alvo.size) return;
    fluxo = {
      ...fluxo,
      nodes: fluxo.nodes.filter((n) => !alvo.has(n.id)),
      edges: fluxo.edges.filter((e) => !alvo.has(e.from) && !alvo.has(e.to)),
    };
    alvo.forEach((id) => selecionados.delete(id));
    commit();
    redesenhar();
    UI.toast(alvo.size === 1 ? "Bloco excluído. Ctrl+Z desfaz." : alvo.size + " blocos excluídos. Ctrl+Z desfaz.");
  }

  function duplicar(ids) {
    const origem = fluxo.nodes.filter((n) => ids.includes(n.id) && n.type !== "inicio");
    if (!origem.length) return;
    const mapa = new Map(origem.map((n) => [n.id, novoId()]));
    const copias = origem.map((n) => ({ ...JSON.parse(JSON.stringify(n)), id: mapa.get(n.id), x: snap(n.x + 40), y: snap(n.y + 40) }));
    const internas = fluxo.edges
      .filter((e) => mapa.has(e.from) && mapa.has(e.to))
      .map((e) => ({ ...e, from: mapa.get(e.from), to: mapa.get(e.to) }));
    fluxo = { ...fluxo, nodes: [...fluxo.nodes, ...copias], edges: [...fluxo.edges, ...internas] };
    selecionados.clear();
    copias.forEach((c) => selecionados.add(c.id));
    commit();
    redesenhar();
  }

  function removerOpcao(no, i) {
    no.data.opcoes = no.data.opcoes.filter((_, k) => k !== i);
    fluxo = {
      ...fluxo,
      edges: fluxo.edges
        .filter((e) => !(e.from === no.id && Number(e.port) === i))
        .map((e) => (e.from === no.id && Number(e.port) > i ? { ...e, port: Number(e.port) - 1 } : e)),
    };
    commit();
    redesenhar();
  }

  function adicionarOpcao(no) {
    no.data.opcoes = [...(no.data.opcoes || []), "Nova opção"];
    commit();
    redesenhar();
  }

  /* ---------- Arrastar blocos ---------- */
  function iniciarArraste(ev, id) {
    if (ev.button !== 0 || ev.target.closest("button")) return;
    ev.preventDefault();
    UI.fecharMenu();
    const multi = ev.shiftKey || ev.ctrlKey || ev.metaKey;
    if (multi) {
      if (selecionados.has(id)) selecionados.delete(id); else selecionados.add(id);
      atualizarSelecao();
      if (!selecionados.has(id)) return;
    } else if (!selecionados.has(id)) {
      selecionados.clear();
      selecionados.add(id);
      atualizarSelecao();
    }
    const base = new Map([...selecionados].map((i) => [i, { x: achar(i).x, y: achar(i).y }]));
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    let moveu = false;
    const mover = (e) => {
      const dx = (e.clientX - x0) / escala;
      const dy = (e.clientY - y0) / escala;
      if (!moveu && Math.hypot(dx, dy) < 3) return;
      moveu = true;
      base.forEach((p, i) => {
        const n = achar(i);
        n.x = snap(p.x + dx);
        n.y = snap(p.y + dy);
        const el = quadro.querySelector(`.no[data-id="${i}"]`);
        if (el) { el.style.left = n.x + "px"; el.style.top = n.y + "px"; }
      });
      desenharLinhas();
    };
    const soltar = () => {
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseup", soltar);
      if (moveu) { ajustarPalco(); commit(); }
    };
    document.addEventListener("mousemove", mover);
    document.addEventListener("mouseup", soltar);
  }

  /* ---------- Ligar arrastando ---------- */
  function paraQuadro(e) {
    const q = quadro.getBoundingClientRect();
    return { x: (e.clientX - q.left) / escala, y: (e.clientY - q.top) / escala };
  }

  const noSobMouse = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); return el ? el.closest(".no") : null; };

  function itensDeNovoBloco(aoEscolher) {
    return [{ titulo: "Adicionar bloco" }, ...GRUPOS_PALETA.flatMap(([, tipos]) => tipos).map((t) => ({
      rotulo: TIPOS[t].titulo, icone: TIPOS[t].icone, cor: TIPOS[t].cor, acao: () => aoEscolher(t),
    }))];
  }

  function iniciarLigacao(ev, deId, porta, elPorta) {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    UI.fecharMenu();
    const origem = centro(elPorta);
    const temporaria = noSvg("path", { class: "temporaria" });
    svg.append(temporaria);
    quadro.classList.add("ligando");
    elPorta.classList.add("ativa");
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    let alvoAtual = null;
    const mover = (e) => {
      temporaria.setAttribute("d", curva(origem, paraQuadro(e)));
      const n = noSobMouse(e);
      const valido = n && n.dataset.id !== deId && n.dataset.type !== "inicio" ? n : null;
      if (valido !== alvoAtual) {
        if (alvoAtual) alvoAtual.classList.remove("alvo");
        if (valido) valido.classList.add("alvo");
        alvoAtual = valido;
      }
    };
    const terminar = () => {
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseup", soltar);
      document.removeEventListener("keydown", cancelar);
      temporaria.remove();
      quadro.classList.remove("ligando");
      elPorta.classList.remove("ativa");
      if (alvoAtual) alvoAtual.classList.remove("alvo");
    };
    const soltar = (e) => {
      terminar();
      const n = noSobMouse(e);
      if (n && n.dataset.id !== deId && n.dataset.type !== "inicio") { conectar(deId, porta, n.dataset.id); return; }
      if (!n && Math.hypot(e.clientX - x0, e.clientY - y0) > 12) {
        const p = paraQuadro(e);
        UI.menu(e.clientX, e.clientY, itensDeNovoBloco((t) => adicionar(t, p.x + 24, p.y - 24, { id: deId, porta })));
      }
    };
    const cancelar = (e) => { if (e.key === "Escape") terminar(); };
    document.addEventListener("mousemove", mover);
    document.addEventListener("mouseup", soltar);
    document.addEventListener("keydown", cancelar);
  }

  /* ---------- Mover a tela, selecionar com retângulo, zoom ---------- */
  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || e.target.closest(".no, .controles-zoom, .dica-atalhos, .remover")) return;
    UI.fecharMenu();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (e.shiftKey) iniciarRetangulo(e); else iniciarPan(e);
  });

  function iniciarPan(ev) {
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    const sl = canvas.scrollLeft;
    const st = canvas.scrollTop;
    let moveu = false;
    const mover = (e) => {
      if (!moveu && Math.hypot(e.clientX - x0, e.clientY - y0) < 3) return;
      moveu = true;
      canvas.classList.add("arrastando");
      canvas.scrollLeft = sl - (e.clientX - x0);
      canvas.scrollTop = st - (e.clientY - y0);
    };
    const soltar = () => {
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseup", soltar);
      canvas.classList.remove("arrastando");
      if (!moveu) limparSelecao();
    };
    document.addEventListener("mousemove", mover);
    document.addEventListener("mouseup", soltar);
  }

  function iniciarRetangulo(ev) {
    const caixa = UI.el("div", "retangulo-selecao");
    document.body.append(caixa);
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    const mover = (e) => {
      const l = Math.min(x0, e.clientX);
      const t = Math.min(y0, e.clientY);
      Object.assign(caixa.style, { left: l + "px", top: t + "px", width: Math.abs(e.clientX - x0) + "px", height: Math.abs(e.clientY - y0) + "px" });
    };
    const soltar = (e) => {
      document.removeEventListener("mousemove", mover);
      document.removeEventListener("mouseup", soltar);
      const r = { l: Math.min(x0, e.clientX), t: Math.min(y0, e.clientY), r: Math.max(x0, e.clientX), b: Math.max(y0, e.clientY) };
      caixa.remove();
      selecionados.clear();
      quadro.querySelectorAll(".no").forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.left < r.r && b.right > r.l && b.top < r.b && b.bottom > r.t) selecionados.add(el.dataset.id);
      });
      atualizarSelecao();
    };
    document.addEventListener("mousemove", mover);
    document.addEventListener("mouseup", soltar);
  }

  function zoomEm(fator, cx, cy) {
    const r = canvas.getBoundingClientRect();
    const px = cx === undefined ? r.width / 2 : cx - r.left;
    const py = cy === undefined ? r.height / 2 : cy - r.top;
    const bx = (canvas.scrollLeft + px) / escala;
    const by = (canvas.scrollTop + py) / escala;
    definirEscala(escala * fator);
    canvas.scrollLeft = bx * escala - px;
    canvas.scrollTop = by * escala - py;
  }

  canvas.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoomEm(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
  }, { passive: false });

  function alturaDoNo(n) {
    const el = quadro.querySelector(`.no[data-id="${n.id}"]`);
    return el ? el.offsetHeight : 160;
  }

  function ajustarVista() {
    if (!fluxo.nodes.length) return;
    const minX = Math.min(...fluxo.nodes.map((n) => n.x));
    const minY = Math.min(...fluxo.nodes.map((n) => n.y));
    const maxX = Math.max(...fluxo.nodes.map((n) => n.x + LARGURA_NO));
    const maxY = Math.max(...fluxo.nodes.map((n) => n.y + alturaDoNo(n)));
    const margem = 60;
    const e = Math.min(1, (canvas.clientWidth - margem * 2) / (maxX - minX), (canvas.clientHeight - margem * 2) / (maxY - minY));
    definirEscala(e);
    canvas.scrollLeft = Math.max(0, minX * escala - margem);
    canvas.scrollTop = Math.max(0, minY * escala - margem);
  }

  /* Arruma os blocos em colunas, seguindo a ordem da conversa */
  function organizar() {
    const inicio = fluxo.nodes.find((n) => n.type === "inicio");
    const nivel = new Map();
    const fila = inicio ? [inicio.id] : [];
    if (inicio) nivel.set(inicio.id, 0);
    while (fila.length) {
      const id = fila.shift();
      fluxo.edges.filter((e) => e.from === id).forEach((e) => {
        if (!nivel.has(e.to)) { nivel.set(e.to, nivel.get(id) + 1); fila.push(e.to); }
      });
    }
    const ultimo = Math.max(0, ...nivel.values());
    fluxo.nodes.forEach((n) => { if (!nivel.has(n.id)) nivel.set(n.id, ultimo + 1); });
    const colunas = new Map();
    fluxo.nodes.forEach((n) => {
      const c = nivel.get(n.id);
      colunas.set(c, [...(colunas.get(c) || []), n]);
    });
    const alturas = new Map(fluxo.nodes.map((n) => [n.id, alturaDoNo(n)]));
    const novos = new Map();
    colunas.forEach((lista, c) => {
      let y = 60;
      lista.forEach((n) => { novos.set(n.id, { x: 60 + c * (LARGURA_NO + 70), y }); y += alturas.get(n.id) + 40; });
    });
    fluxo = { ...fluxo, nodes: fluxo.nodes.map((n) => ({ ...n, ...novos.get(n.id) })) };
    commit();
    redesenhar();
    ajustarVista();
    UI.toast("Blocos organizados. Ctrl+Z desfaz.");
  }

  /* ---------- Menus de clique direito e arrastar da paleta ---------- */
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const noEl = e.target.closest(".no");
    if (noEl) {
      const id = noEl.dataset.id;
      if (!selecionados.has(id)) { selecionados.clear(); selecionados.add(id); atualizarSelecao(); }
      if (noEl.dataset.type === "inicio") return;
      UI.menu(e.clientX, e.clientY, [
        { rotulo: "Duplicar", icone: "copiar", atalho: "Ctrl+D", acao: () => duplicar([...selecionados]) },
        { rotulo: "Excluir", icone: "lixeira", atalho: "Del", perigo: true, acao: () => excluirIds([...selecionados]) },
      ]);
      return;
    }
    const p = paraQuadro(e);
    UI.menu(e.clientX, e.clientY, itensDeNovoBloco((t) => adicionar(t, p.x, p.y)));
  });

  canvas.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
  canvas.addEventListener("drop", (e) => {
    e.preventDefault();
    const texto = e.dataTransfer.getData("text/plain") || "";
    if (!texto.startsWith("fluxobot:")) return;
    const p = paraQuadro(e);
    adicionar(texto.slice(9), p.x - LARGURA_NO / 2, p.y - 20);
  });

  function montarPaleta() {
    const p = $("paleta");
    p.innerHTML = "";
    p.append(UI.el("div", "paleta-titulo", "Blocos"));
    p.append(UI.el("p", "paleta-dica", "Clique ou arraste para a tela"));
    GRUPOS_PALETA.forEach(([titulo, tipos]) => {
      p.append(UI.el("h3", "paleta-grupo", titulo));
      tipos.forEach((t) => {
        const info = TIPOS[t];
        const b = UI.el("button", "bloco-item");
        b.type = "button";
        b.draggable = true;
        b.style.setProperty("--cor-no", info.cor);
        b.innerHTML = `<span class="chip">${UI.icone(info.icone, 16)}</span><span class="bloco-texto"><strong></strong><small></small></span>`;
        b.querySelector("strong").textContent = info.titulo;
        b.querySelector("small").textContent = info.descricao;
        b.onclick = () => adicionar(t);
        b.ondragstart = (e) => { e.dataTransfer.setData("text/plain", "fluxobot:" + t); e.dataTransfer.effectAllowed = "copy"; };
        p.append(b);
      });
    });
  }

  /* ---------- Teste, arquivos ---------- */
  const resolverUrl = (u) => (window.FluxoMidiaLocal || {})[u];

  function iniciarTeste() {
    $("teste").classList.add("aberto");
    window.FluxoChat.executar(fluxo, $("conversa"), { semRedirecionar: true, semRegistro: true, resolverUrl });
  }

  function baixar() {
    const blob = new Blob([JSON.stringify(fluxo, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (fluxo.nome || "fluxo").replace(/[^\w-]+/g, "-") + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importarArquivo(ev) {
    const arquivo = ev.target.files[0];
    ev.target.value = "";
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        const lido = JSON.parse(leitor.result);
        let novo = lido;
        let aviso = "";
        if (window.ImportarTypebot && window.ImportarTypebot.ehTypebot(lido)) {
          const { fluxo: convertido, relatorio } = window.ImportarTypebot.converter(lido);
          novo = convertido;
          aviso = `Importado do Typebot: ${relatorio.blocosCriados} blocos, ${relatorio.midias.length} mídias.`;
          if (relatorio.tema) aviso += relatorio.barraDeContato ? " Aparência importada (inclui a barra de contato)." : " Aparência importada.";
          const ign = Object.entries(relatorio.ignorados).map(([t, q]) => `${t} (${q})`).join(", ");
          if (ign) aviso += ` Ignorados (não suportados): ${ign}.`;
        } else if (!Array.isArray(lido.nodes) || !Array.isArray(lido.edges)) {
          throw new Error("formato");
        }
        window.FluxoBots.criarBot(novo.nome, novo, aviso);
      } catch (e) {
        UI.toast("Esse arquivo não parece ser um fluxo válido (FluxoBot ou Typebot).", "erro");
      }
    };
    leitor.readAsText(arquivo);
  }

  /* ---------- Ponte para os outros módulos ---------- */
  const ctx = {
    aoMudar: () => { salvarLocal(); agendarCommit(); },
    redesenhar,
    iniciarLigacao,
    iniciarArraste,
    duplicar: (id) => duplicar(selecionados.has(id) ? [...selecionados] : [id]),
    excluir: (id) => excluirIds(selecionados.has(id) ? [...selecionados] : [id]),
    selecionar,
    enviarArquivo: (tipo) => (window.FluxoBots ? window.FluxoBots.escolherEEnviar(tipo) : Promise.resolve(null)),
    resolverUrl: (u) => resolverUrl(u) || u,
    variaveis,
    removerOpcao,
    adicionarOpcao,
  };

  window.FluxoEditor = {
    obter: () => fluxo,
    definir: (novo, opcoes) => {
      fluxo = migrar(novo);
      selecionados.clear();
      pilha = [JSON.stringify(fluxo)];
      indice = 0;
      $("nome").value = fluxo.nome || "";
      salvarLocal();
      redesenhar();
      ajustarVista();
      atualizarEstadoDoHistorico();
      if (opcoes && opcoes.sujo) marcarSujo(); else { $("estado").textContent = ""; $("estado").className = "estado"; }
      if ($("teste").classList.contains("aberto")) iniciarTeste(); // mantém o teste igual ao bot aberto
      if (window.FluxoTema) window.FluxoTema.recarregar();
    },
    obterTema: () => fluxo.tema || {},
    atualizarTema: (tema) => { fluxo = { ...fluxo, tema }; salvarLocal(); agendarCommit(); },
    iniciarTeste,
    marcarSalvo,
    baixar,
    organizar,
    ajustarVista,
    escolherArquivoParaImportar: () => $("arquivo").click(),
  };

  /* ---------- Ligações dos botões e atalhos ---------- */
  $("btn-testar").onclick = iniciarTeste;
  $("btn-reiniciar").onclick = iniciarTeste;
  $("btn-fechar").onclick = () => $("teste").classList.remove("aberto");
  $("btn-desfazer").onclick = () => irParaHistorico(indice - 1);
  $("btn-refazer").onclick = () => irParaHistorico(indice + 1);
  $("arquivo").onchange = importarArquivo;
  $("zoom-mais").onclick = () => zoomEm(1.15);
  $("zoom-menos").onclick = () => zoomEm(1 / 1.15);
  $("zoom-ajustar").onclick = ajustarVista;
  $("btn-organizar").onclick = organizar;
  $("nome").oninput = () => { fluxo = { ...fluxo, nome: $("nome").value }; salvarLocal(); agendarCommit(); };

  document.addEventListener("keydown", (e) => {
    const emCampo = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ""));
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); if (window.FluxoBots) window.FluxoBots.salvar(); return; }
    if (emCampo || document.querySelector("dialog[open]")) return;
    const k = e.key.toLowerCase();
    if (mod && k === "z") { e.preventDefault(); irParaHistorico(e.shiftKey ? indice + 1 : indice - 1); }
    else if (mod && k === "y") { e.preventDefault(); irParaHistorico(indice + 1); }
    else if (mod && k === "d") { e.preventDefault(); duplicar([...selecionados]); }
    else if (mod && k === "a") { e.preventDefault(); fluxo.nodes.forEach((n) => selecionados.add(n.id)); atualizarSelecao(); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); excluirIds([...selecionados]); }
    else if (e.key === "Escape") limparSelecao();
  });

  window.addEventListener("beforeunload", (e) => {
    if ($("estado").classList.contains("sujo")) { e.preventDefault(); e.returnValue = ""; }
  });

  $("nome").value = fluxo.nome || "";
  montarPaleta();
  definirEscala(1);
  redesenhar();
  atualizarEstadoDoHistorico();
  requestAnimationFrame(ajustarVista);
})();
