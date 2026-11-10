/* Motor do chat: lê um fluxo (JSON) e conversa com o visitante.
   Uso: FluxoChat.executar(fluxo, elementoHTML, opcoes)
   opcoes.resolverUrl(url)  -> troca um link (usado no editor para prévia local)
   opcoes.semRedirecionar   -> não abre links sozinho (usado no editor) */
(function (global) {
  const ESPERA_PADRAO_MS = 500;
  const ESPERA_MAXIMA_MS = 60000;
  const MAX_PASSOS = 500;

  function interpolar(texto, vars) {
    return (texto || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] ?? ""));
  }

  function proximoNo(fluxo, deId, porta) {
    const aresta = fluxo.edges.find((e) => e.from === deId && String(e.port) === String(porta));
    return aresta ? fluxo.nodes.find((n) => n.id === aresta.to) : null;
  }

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const ROTULO_UNICA = { imagem: "Foto", audio: "Mensagem de voz", video: "Vídeo" };
  const ICONE_UNICA = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/><text x="12" y="16.3" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">1</text></svg>';

  function numero(valor) {
    if (valor === undefined || valor === null || valor === "") return null;
    const n = Number(String(valor).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  /* Só aceita links http(s) (ou blob da prévia do editor). Bloqueia javascript: etc. */
  function urlSegura(url, resolver) {
    const bruta = String(url || "").trim();
    if (!bruta) return null;
    const final = (resolver && resolver(bruta)) || bruta;
    try {
      const u = new URL(final, location.href);
      return ["http:", "https:", "blob:"].includes(u.protocol) ? u.href : null;
    } catch (e) {
      return null;
    }
  }

  function embedDeVideo(link) {
    try {
      const u = new URL(link);
      const host = u.hostname.replace(/^www\./, "");
      let id = null;
      if (host === "youtu.be") id = u.pathname.slice(1);
      else if (host.endsWith("youtube.com")) {
        id = u.searchParams.get("v") || ((u.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/) || [])[1]);
      }
      if (id && /^[\w-]{6,}$/.test(id)) return "https://www.youtube.com/embed/" + id;
      if (host === "vimeo.com") {
        const m = u.pathname.match(/^\/(\d+)/);
        if (m) return "https://player.vimeo.com/video/" + m[1];
      }
    } catch (e) { /* link inválido */ }
    return null;
  }

  /* Formatação estilo WhatsApp: *negrito*  _itálico_  ~riscado~  (sem innerHTML: seguro) */
  const FORMATOS = [
    [/(?<![\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/, "strong"],
    [/(?<![\w_])_(?=\S)([^_\n]*?\S)_(?![\w_])/, "em"],
    [/(?<![\w~])~(?=\S)([^~\n]*?\S)~(?![\w~])/, "s"],
  ];

  function formatar(texto) {
    const frag = document.createDocumentFragment();
    let melhor = null;
    for (const [regex, tag] of FORMATOS) {
      const m = regex.exec(texto);
      if (m && (!melhor || m.index < melhor.m.index)) melhor = { m, tag };
    }
    if (!melhor) { frag.append(texto); return frag; }
    const { m, tag } = melhor;
    frag.append(texto.slice(0, m.index));
    const el = document.createElement(tag);
    el.append(formatar(m[1]));
    frag.append(el);
    frag.append(formatar(texto.slice(m.index + m[0].length)));
    return frag;
  }

  const VALIDADORES = {
    texto: (v) => v.trim().length > 0,
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
    numero: (v) => v.trim() !== "" && !Number.isNaN(Number(v.replace(",", "."))),
    telefone: (v) => v.replace(/\D/g, "").length >= 10,
  };
  const MSG_ERRO = {
    texto: "Por favor, escreva algo.",
    email: "Esse e-mail não parece válido. Tente de novo.",
    numero: "Digite apenas um número.",
    telefone: "Digite um telefone com DDD.",
  };

  /* Compatibilidade: bots antigos com o bloco "Enviar dados" continuam gravando enquanto o
     registro automático (config.json > rastreio) estiver desligado. */
  async function enviarWebhookLegado(url, fluxo, respostas) {
    try {
      await fetch(url, {
        method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ fluxo: fluxo.nome || "fluxo", respostas, data: new Date().toISOString() }),
      });
    } catch (e) { /* sem internet: ignora */ }
  }

  /* Registro automático na planilha: cada visitante vira uma linha (mesmo que não responda nada).
     Eventos: "inicio" (conta um acesso), "atualizar" (a cada resposta/escolha) e "fim" (concluiu).
     Só funciona fora do editor e quando config.registroUrl está definido. */
  function criarRegistrador(fluxo, config) {
    const url = config.registroUrl;
    if (!url || config.semRegistro) return { inicio() {}, passo() {}, atualizar() {}, fim() {} };
    const sessao = (global.crypto && global.crypto.randomUUID)
      ? global.crypto.randomUUID()
      : "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    const caminho = [];
    let origem = "direto";
    try {
      const q = new URLSearchParams(location.search);
      origem = q.get("utm_source") || (document.referrer ? new URL(document.referrer).hostname : "direto");
    } catch (e) { /* mantém "direto" */ }
    // Cada envio sai na hora (keepalive): se o visitante fechar a página logo depois, nada se perde.
    // A planilha aceita eventos fora de ordem (cada um traz tudo que foi feito até ali).
    const enviar = (evento, respostas) => {
      const corpo = JSON.stringify({
        evento, sessao, fluxo: fluxo.nome || "bot", data: new Date().toISOString(),
        origem, caminho: caminho.join(" > "), respostas: { ...respostas },
      });
      // text/plain + no-cors evita bloqueio (CORS) no Google Apps Script
      fetch(url, {
        method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain" }, body: corpo,
      }).catch(() => { /* sem internet: ignora */ });
    };
    return {
      inicio: () => enviar("inicio", {}),
      passo: (texto) => { caminho.push(texto); },
      atualizar: (respostas) => enviar("atualizar", respostas),
      fim: (respostas) => enviar("fim", respostas),
    };
  }

  /* ---------- Tema (aparência) ---------- */
  const MAPA_CORES = {
    corBarra: "--fc-barra", corFundo: "--fc-fundo",
    corBalaoBot: "--fc-bot-bg", corTextoBot: "--fc-bot-cor",
    corBalaoUsuario: "--fc-user-bg", corTextoUsuario: "--fc-user-cor",
    corBotao: "--fc-btn-bg", corTextoBotao: "--fc-btn-cor",
  };
  const COR_VALIDA = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  const SVG = (caminho) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="${caminho}"/></svg>`;
  const ICONES = {
    voltar: SVG("M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"),
    video: SVG("M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"),
    telefone: SVG("M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z"),
    mais: SVG("M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"),
  };

  /* Modelos prontos. Cores ausentes = visual padrão do FluxoBot. */
  const TEMAS = {
    padrao: { mostrarBarra: false },
    whatsapp: {
      mostrarBarra: true, corBarra: "#005e54", corFundo: "#ece5dd",
      corBalaoBot: "#ffffff", corTextoBot: "#111b21",
      corBalaoUsuario: "#dcf8c6", corTextoUsuario: "#111b21",
      corBotao: "#00a884", corTextoBotao: "#ffffff",
    },
    messenger: {
      mostrarBarra: true, corBarra: "#0084ff", corFundo: "#ffffff",
      corBalaoBot: "#e4e6eb", corTextoBot: "#050505",
      corBalaoUsuario: "#0084ff", corTextoUsuario: "#ffffff",
      corBotao: "#0084ff", corTextoBotao: "#ffffff",
    },
    instagram: {
      mostrarBarra: true, corBarra: "#c13584", corFundo: "#ffffff",
      corBalaoBot: "#efefef", corTextoBot: "#262626",
      corBalaoUsuario: "#8a3ab9", corTextoUsuario: "#ffffff",
      corBotao: "#8a3ab9", corTextoBotao: "#ffffff",
    },
  };

  function criarBarra(tema, config) {
    const barra = document.createElement("div");
    barra.className = "fc-barra";
    barra.insertAdjacentHTML("beforeend", ICONES.voltar); // ícones fixos do programa
    const foto = tema.foto ? urlSegura(tema.foto, config && config.resolverUrl) : null;
    if (foto) {
      const img = document.createElement("img");
      img.className = "fc-avatar";
      img.alt = "";
      img.src = foto;
      barra.append(img);
    }
    const info = document.createElement("div");
    info.className = "fc-info";
    const nome = document.createElement("span");
    nome.className = "fc-nome";
    nome.textContent = tema.nome === undefined ? "Contato" : tema.nome;
    const status = document.createElement("span");
    status.className = "fc-status";
    status.textContent = tema.status === undefined ? "online" : tema.status;
    info.append(nome, status);
    const acoes = document.createElement("div");
    acoes.className = "fc-acoes";
    acoes.insertAdjacentHTML("beforeend", ICONES.video + ICONES.telefone + ICONES.mais);
    barra.append(info, acoes);
    return barra;
  }

  /* Aplica (ou reaplica) o tema numa conversa já criada. Só aceita cores em hexadecimal. */
  function aplicarTema(raiz, tema, config) {
    const t = tema || {};
    Object.entries(MAPA_CORES).forEach(([chave, variavel]) => {
      if (COR_VALIDA.test(t[chave] || "")) raiz.style.setProperty(variavel, t[chave]);
      else raiz.style.removeProperty(variavel);
    });
    // Botão colorido sem cor de texto definida: usa branco para ficar legível
    if (COR_VALIDA.test(t.corBotao || "") && !COR_VALIDA.test(t.corTextoBotao || "")) raiz.style.setProperty("--fc-btn-cor", "#ffffff");
    const msgs = raiz.querySelector(".fc-msgs");
    if (msgs) {
      const img = t.fundoImagem ? urlSegura(t.fundoImagem, config && config.resolverUrl) : null;
      msgs.style.backgroundImage = img ? `url("${img}")` : "";
    }
    const antiga = raiz.querySelector(":scope > .fc-barra");
    if (antiga) antiga.remove();
    if (t.mostrarBarra) raiz.prepend(criarBarra(t, config));
  }

  function executar(fluxo, raiz, opcoes) {
    const config = opcoes || {};
    const idExecucao = String(Math.random());
    raiz.dataset.exec = idExecucao;
    raiz.innerHTML = "";
    raiz.classList.add("fc-chat");
    const mensagens = document.createElement("div");
    mensagens.className = "fc-msgs";
    const entrada = document.createElement("div");
    entrada.className = "fc-entrada";
    raiz.append(mensagens, entrada);
    aplicarTema(raiz, fluxo.tema, config);

    const ativo = () => raiz.dataset.exec === idExecucao;
    const rolar = () => { mensagens.scrollTop = mensagens.scrollHeight; };

    function balao(quem, classeExtra) {
      const d = document.createElement("div");
      d.className = "fc-msg fc-" + quem + (classeExtra ? " " + classeExtra : "");
      mensagens.append(d);
      rolar();
      return d;
    }

    function adicionar(texto, quem) {
      const d = balao(quem);
      d.append(formatar(texto));
    }

    const VELOCIDADES_AUDIO = [[1.5, "1,5x"], [2, "2x"]];

    // Botões de velocidade do áudio; 1,5x vem ativado por padrão.
    function criarBotoesVelocidade(audio) {
      const caixa = document.createElement("div");
      caixa.className = "fc-vel";
      let atual = VELOCIDADES_AUDIO[0][0];
      const botoes = VELOCIDADES_AUDIO.map(([valor, rotulo]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = rotulo;
        b.onclick = () => { atual = valor; aplicar(); };
        caixa.append(b);
        return { b, valor };
      });
      function aplicar() {
        audio.playbackRate = atual;
        botoes.forEach(({ b, valor }) => b.classList.toggle("fc-vel-ativa", valor === atual));
      }
      audio.addEventListener("loadedmetadata", aplicar);
      audio.addEventListener("play", aplicar);
      aplicar();
      return caixa;
    }

    function criarElementoMidia(tipo, link) {
      let el;
      if (tipo === "imagem") {
        el = document.createElement("img");
        el.loading = "lazy";
        el.alt = "";
        el.onload = rolar;
        el.src = link;
      } else if (tipo === "audio") {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.preload = "metadata";
        audio.src = link;
        el = document.createElement("div");
        el.className = "fc-audio";
        el.append(audio, criarBotoesVelocidade(audio));
      } else {
        const embed = embedDeVideo(link);
        if (embed) {
          el = document.createElement("iframe");
          el.className = "fc-embed";
          el.allowFullscreen = true;
          el.src = embed;
        } else {
          el = document.createElement("video");
          el.controls = true;
          el.playsInline = true;
          el.preload = "metadata";
          el.onloadedmetadata = rolar;
          el.src = link;
        }
      }
      return el;
    }

    // Visualização única (imita o WhatsApp): só dá para abrir uma vez, depois vira "Aberta".
    function adicionarMidiaUnica(tipo, link) {
      const d = balao("bot", "fc-midia fc-unica");
      const rotulo = ROTULO_UNICA[tipo];
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "fc-unica-btn";
      botao.innerHTML = ICONE_UNICA;
      botao.append(rotulo);
      d.append(botao);
      rolar();

      function marcarAberta() {
        d.classList.add("fc-aberta");
        d.innerHTML = ICONE_UNICA;
        d.append("Aberta");
        rolar();
      }

      botao.onclick = () => {
        if (tipo === "audio") {
          const el = criarElementoMidia("audio", link);
          const audio = el.querySelector("audio");
          audio.autoplay = true;
          audio.controlsList = "nodownload noplaybackrate";
          audio.onended = marcarAberta;
          d.innerHTML = "";
          d.append(el);
          rolar();
          return;
        }
        const visor = document.createElement("div");
        visor.className = "fc-visor";
        const fechar = document.createElement("button");
        fechar.type = "button";
        fechar.className = "fc-visor-fechar";
        fechar.setAttribute("aria-label", "Fechar");
        fechar.textContent = "✕";
        const fim = () => {
          document.removeEventListener("keydown", aoTecla);
          visor.remove();
          marcarAberta();
        };
        const aoTecla = (e) => { if (e.key === "Escape") fim(); };
        fechar.onclick = fim;
        visor.onclick = (e) => { if (e.target === visor) fim(); };
        document.addEventListener("keydown", aoTecla);
        visor.append(fechar, criarElementoMidia(tipo, link));
        raiz.append(visor);
      };
    }

    function adicionarMidia(tipo, link, unica) {
      if (unica) { adicionarMidiaUnica(tipo, link); return; }
      const d = balao("bot", "fc-midia");
      d.append(criarElementoMidia(tipo, link));
      rolar();
    }

    // Depois de um clique em botão: abre o link na hora, sem balão "Abrir link".
    // Devolve false se o navegador bloqueou (aí o balão com o link aparece como reserva).
    function abrirDireto(link, novaAba) {
      if (novaAba) {
        const w = global.open(link, "_blank");
        if (!w) return false;
        w.opener = null;
        return true;
      }
      global.location.href = link;
      return true;
    }

    function abrirLink(link, novaAba, texto, aposBotao) {
      if (aposBotao && abrirDireto(link, novaAba)) return;
      // Sem botão antes: balão com o link em texto cru (ou o texto que o usuário escolheu)
      const d = balao("bot");
      const a = document.createElement("a");
      a.href = link;
      a.target = novaAba ? "_blank" : "_top";
      a.rel = "noopener noreferrer";
      a.textContent = texto || link;
      d.append(a);
      rolar();
      if (aposBotao) return;
      // Dentro de um iframe o navegador só deixa abrir com clique do visitante: fica o botão.
      const emIframe = global.self !== global.top;
      if (config.semRedirecionar || emIframe) return;
      if (novaAba) global.open(link, "_blank", "noopener");
      else global.location.href = link;
    }

    async function aguardar(dados) {
      const s = numero(dados.espera);
      const ms = s === null ? ESPERA_PADRAO_MS : Math.min(Math.max(0, s * 1000), ESPERA_MAXIMA_MS);
      if (ms === 0) return;
      const ind = balao("bot", "fc-digitando");
      ind.innerHTML = "<span></span><span></span><span></span>";
      await esperar(ms);
      ind.remove();
    }

    function pedirTexto(tipo) {
      return new Promise((resolve) => {
        entrada.innerHTML = "";
        const form = document.createElement("form");
        const campo = document.createElement("input");
        campo.type = tipo === "email" ? "email" : "text";
        campo.placeholder = "Digite aqui...";
        campo.autocomplete = "off";
        const botao = document.createElement("button");
        botao.textContent = "Enviar";
        form.append(campo, botao);
        entrada.append(form);
        campo.focus();
        form.onsubmit = (ev) => {
          ev.preventDefault();
          const valor = campo.value;
          const valida = VALIDADORES[tipo] || VALIDADORES.texto;
          if (!valida(valor)) {
            adicionar(MSG_ERRO[tipo] || MSG_ERRO.texto, "bot");
            return;
          }
          entrada.innerHTML = "";
          adicionar(valor, "user");
          resolve(valor.trim());
        };
      });
    }

    function pedirBotao(opcoesBotao) {
      return new Promise((resolve) => {
        entrada.innerHTML = "";
        // Os botões ficam logo abaixo da mensagem (dentro da conversa), sempre à vista no celular
        const caixa = document.createElement("div");
        caixa.className = "fc-botoes";
        opcoesBotao.forEach((rotulo, i) => {
          const b = document.createElement("button");
          b.textContent = rotulo;
          b.onclick = () => {
            caixa.remove();
            adicionar(rotulo, "user");
            resolve(i);
          };
          caixa.append(b);
        });
        mensagens.append(caixa);
        rolar();
      });
    }

    async function rodar() {
      const respostas = {};
      const registro = criarRegistrador(fluxo, config);
      let no = fluxo.nodes.find((n) => n.type === "inicio");
      no = no ? proximoNo(fluxo, no.id, "out") : null;
      if (!no) { adicionar("Este fluxo ainda está vazio.", "bot"); return; }
      registro.inicio();

      let passos = 0;
      let veioDeBotao = false;
      while (no && ativo() && passos++ < MAX_PASSOS) {
        const d = no.data || {};
        let porta = "out";
        const anteriorEraBotao = veioDeBotao;
        veioDeBotao = no.type === "botoes";

        if (no.type === "mensagem") {
          await aguardar(d);
          if (!ativo()) return;
          adicionar(interpolar(d.texto, respostas), "bot");
        } else if (no.type === "imagem" || no.type === "audio" || no.type === "video") {
          await aguardar(d);
          if (!ativo()) return;
          const link = urlSegura(d.url, config.resolverUrl);
          if (link) adicionarMidia(no.type, link, d.visualizacaoUnica === true);
          else adicionar("[arquivo indisponível]", "bot");
        } else if (no.type === "pergunta") {
          await aguardar(d);
          if (!ativo()) return;
          if (d.texto) adicionar(interpolar(d.texto, respostas), "bot");
          const valor = await pedirTexto(d.tipo || "texto");
          if (!ativo()) return;
          respostas[d.variavel || "pergunta_" + no.id] = valor;
          registro.atualizar(respostas);
        } else if (no.type === "botoes") {
          await aguardar(d);
          if (!ativo()) return;
          if (d.texto) adicionar(interpolar(d.texto, respostas), "bot");
          const lista = d.opcoes || [];
          if (lista.length > 0) {
            const i = await pedirBotao(lista);
            if (!ativo()) return;
            if (d.variavel) respostas[d.variavel] = lista[i];
            registro.passo(lista[i]);
            registro.atualizar(respostas);
            porta = i;
          }
        } else if (no.type === "espera") {
          await esperar(Math.min((numero(d.segundos) || 0) * 1000, ESPERA_MAXIMA_MS));
        } else if (no.type === "redirecionar") {
          const link = urlSegura(d.url, config.resolverUrl);
          if (link) {
            abrirLink(link, !!d.novaAba, d.texto, anteriorEraBotao);
            registro.passo("link: " + new URL(link).hostname);
            registro.atualizar(respostas);
          }
          if (!d.novaAba) break;
        } else if (no.type === "webhook") {
          // bloco antigo "Enviar dados": com o registro automático ligado ele só segue em frente
          if (!config.registroUrl && !config.semRegistro && d.url) await enviarWebhookLegado(d.url, fluxo, respostas);
        } else if (no.type === "fim") {
          break;
        }
        no = proximoNo(fluxo, no.id, porta);
      }
      if (ativo()) {
        entrada.innerHTML = "";
        registro.fim(respostas);
      }
    }

    rodar();
  }

  global.FluxoChat = { executar, aplicarTema, TEMAS };
})(window);
