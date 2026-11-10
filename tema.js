/* Painel "🎨 Aparência": muda cores, foto, nome e fundo do chat, com prévia ao vivo. */
(function () {
  const painel = document.getElementById("tema");
  const botao = document.getElementById("btn-tema");

  const COR_PADRAO = {
    corBarra: "#005e54", corFundo: "#ffffff",
    corBalaoBot: "#eceefc", corTextoBot: "#1d2030",
    corBalaoUsuario: "#6d4aff", corTextoUsuario: "#ffffff",
    corBotao: "#6d4aff", corTextoBotao: "#ffffff",
  };
  const GRUPOS_DE_COR = [
    ["Barra e fundo", [["corBarra", "Barra do topo"], ["corFundo", "Fundo da conversa"]]],
    ["Mensagens do bot", [["corBalaoBot", "Balão"], ["corTextoBot", "Texto"]]],
    ["Mensagens do visitante", [["corBalaoUsuario", "Balão"], ["corTextoUsuario", "Texto"]]],
    ["Botões de opção", [["corBotao", "Botão"], ["corTextoBotao", "Texto"]]],
  ];
  const CHAVES_DE_COR = Object.keys(COR_PADRAO);

  const atual = () => window.FluxoEditor.obterTema();

  function conversa() { return document.getElementById("conversa"); }

  function aplicarPrevia(tema) {
    const raiz = conversa();
    if (raiz && raiz.classList.contains("fc-chat")) {
      window.FluxoChat.aplicarTema(raiz, tema, { resolverUrl: (u) => (window.FluxoMidiaLocal || {})[u] });
    }
  }

  function mudar(mudancas) {
    const novo = { ...atual(), ...mudancas };
    Object.keys(novo).forEach((k) => { if (novo[k] === "" || novo[k] === undefined) delete novo[k]; });
    window.FluxoEditor.atualizarTema(novo);
    aplicarPrevia(novo);
  }

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function secao(titulo) {
    const s = el("div", "secao");
    if (titulo) s.append(el("h3", "", titulo));
    return s;
  }

  function campoTexto(rotulo, chave, padrao, dica) {
    const caixa = el("div");
    caixa.append(el("label", "", rotulo));
    const i = el("input");
    i.type = "text";
    i.value = atual()[chave] ?? "";
    i.placeholder = dica || padrao || "";
    i.oninput = () => mudar({ [chave]: i.value.trim() === "" && padrao === undefined ? "" : i.value });
    caixa.append(i);
    return caixa;
  }

  function campoArquivo(rotulo, chave, tipoDeArquivo) {
    const caixa = el("div");
    caixa.append(el("label", "", rotulo));
    const linha = el("div", "linha");
    const i = el("input");
    i.type = "text";
    i.placeholder = "Link https://... ou envie do PC";
    i.value = atual()[chave] ?? "";
    i.oninput = () => mudar({ [chave]: i.value.trim() });
    const enviar = el("button", "mini", "📎 Enviar");
    enviar.onclick = async () => {
      if (!window.FluxoBots) return;
      const caminho = await window.FluxoBots.escolherEEnviar(tipoDeArquivo);
      if (caminho) { i.value = caminho; mudar({ [chave]: caminho }); }
    };
    linha.append(i, enviar);
    caixa.append(linha);
    if (chave === "fundoImagem") {
      const limpar = el("button", "mini", "Remover imagem de fundo");
      limpar.style.marginTop = "6px";
      limpar.onclick = () => { i.value = ""; mudar({ fundoImagem: "" }); };
      caixa.append(limpar);
    }
    return caixa;
  }

  function escolherModelo(nome) {
    const modelo = window.FluxoChat.TEMAS[nome];
    const base = { ...atual() };
    CHAVES_DE_COR.forEach((k) => delete base[k]);
    delete base.mostrarBarra;
    delete base.fundoImagem;
    const novo = { ...base, ...modelo };
    window.FluxoEditor.atualizarTema(novo);
    aplicarPrevia(novo);
    desenhar();
  }

  function desenhar() {
    painel.innerHTML = "";
    const tema = atual();

    const topo = el("div", "topo");
    topo.append(el("span", "", "🎨 Aparência do chat"));
    const fechar = el("button", "", "✕");
    fechar.onclick = () => painel.classList.remove("aberto");
    topo.append(fechar);
    painel.append(topo);

    const modelos = secao("Comece por um modelo");
    const linhaModelos = el("div", "modelos");
    [["padrao", "Padrão"], ["whatsapp", "💬 WhatsApp"]].forEach(([id, texto]) => {
      const b = el("button", "", texto);
      b.onclick = () => escolherModelo(id);
      linhaModelos.append(b);
    });
    modelos.append(linhaModelos);
    painel.append(modelos);

    const contato = secao("Barra de contato (topo)");
    const interruptor = el("label", "interruptor");
    const marca = el("input");
    marca.type = "checkbox";
    marca.checked = !!tema.mostrarBarra;
    marca.onchange = () => mudar({ mostrarBarra: marca.checked });
    interruptor.append(marca, el("span", "", "Mostrar foto, nome e \"online\""));
    contato.append(
      interruptor,
      campoTexto("Nome", "nome", undefined, "Ex.: Tati Silva ✅"),
      campoTexto("Status", "status", "online", "online"),
      campoArquivo("Foto de perfil", "foto", "imagem"),
    );
    painel.append(contato);

    const cores = secao("Cores");
    GRUPOS_DE_COR.forEach(([titulo, itens]) => {
      cores.append(el("label", "", titulo));
      const grade = el("div", "cores");
      itens.forEach(([chave, rotulo]) => {
        const c = el("div", "cor");
        const seletor = el("input");
        seletor.type = "color";
        seletor.value = /^#[0-9a-fA-F]{6}$/.test(tema[chave] || "") ? tema[chave] : COR_PADRAO[chave];
        seletor.oninput = () => mudar({ [chave]: seletor.value });
        c.append(seletor, el("span", "", rotulo));
        grade.append(c);
      });
      cores.append(grade);
    });
    painel.append(cores);

    const fundo = secao("Imagem de fundo (opcional)");
    fundo.append(campoArquivo("Papel de parede da conversa", "fundoImagem", "imagem"));
    painel.append(fundo);
  }

  function abrir() {
    window.FluxoEditor.iniciarTeste(); // a prévia sempre reflete o bot atual
    desenhar();
    painel.classList.add("aberto");
  }

  botao.onclick = () => (painel.classList.contains("aberto") ? painel.classList.remove("aberto") : abrir());

  window.FluxoTema = { recarregar: () => { if (painel.classList.contains("aberto")) { desenhar(); aplicarPrevia(atual()); } } };
})();
