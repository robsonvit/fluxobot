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

  async function enviarWebhook(url, fluxo, respostas) {
    if (!url) return;
    try {
      // text/plain + no-cors evita bloqueio (CORS) no Google Apps Script
      await fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ fluxo: fluxo.nome || "fluxo", respostas, data: new Date().toISOString() }),
      });
    } catch (e) {
      console.error("Falha ao enviar webhook:", e);
    }
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

    function adicionarMidia(tipo, link) {
      const d = balao("bot", "fc-midia");
      let el;
      if (tipo === "imagem") {
        el = document.createElement("img");
        el.loading = "lazy";
        el.alt = "";
        el.onload = rolar;
        el.src = link;
      } else if (tipo === "audio") {
        el = document.createElement("audio");
        el.controls = true;
        el.preload = "metadata";
        el.src = link;
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
      d.append(el);
      rolar();
    }

    function abrirLink(link, novaAba) {
      const d = balao("bot", "fc-midia");
      const a = document.createElement("a");
      a.className = "fc-link";
      a.href = link;
      a.target = novaAba ? "_blank" : "_top";
      a.rel = "noopener noreferrer";
      a.textContent = "👉 Abrir link";
      d.append(a);
      rolar();
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
        const caixa = document.createElement("div");
        caixa.className = "fc-botoes";
        opcoesBotao.forEach((rotulo, i) => {
          const b = document.createElement("button");
          b.textContent = rotulo;
          b.onclick = () => {
            entrada.innerHTML = "";
            adicionar(rotulo, "user");
            resolve(i);
          };
          caixa.append(b);
        });
        entrada.append(caixa);
      });
    }

    async function rodar() {
      const respostas = {};
      let no = fluxo.nodes.find((n) => n.type === "inicio");
      no = no ? proximoNo(fluxo, no.id, "out") : null;
      if (!no) { adicionar("Este fluxo ainda está vazio.", "bot"); return; }

      let passos = 0;
      while (no && ativo() && passos++ < MAX_PASSOS) {
        const d = no.data || {};
        let porta = "out";

        if (no.type === "mensagem") {
          await aguardar(d);
          if (!ativo()) return;
          adicionar(interpolar(d.texto, respostas), "bot");
        } else if (no.type === "imagem" || no.type === "audio" || no.type === "video") {
          await aguardar(d);
          if (!ativo()) return;
          const link = urlSegura(d.url, config.resolverUrl);
          if (link) adicionarMidia(no.type, link);
          else adicionar("[arquivo indisponível]", "bot");
        } else if (no.type === "pergunta") {
          await aguardar(d);
          if (!ativo()) return;
          if (d.texto) adicionar(interpolar(d.texto, respostas), "bot");
          const valor = await pedirTexto(d.tipo || "texto");
          if (!ativo()) return;
          if (d.variavel) respostas[d.variavel] = valor;
        } else if (no.type === "botoes") {
          await aguardar(d);
          if (!ativo()) return;
          if (d.texto) adicionar(interpolar(d.texto, respostas), "bot");
          const lista = d.opcoes || [];
          if (lista.length > 0) {
            const i = await pedirBotao(lista);
            if (!ativo()) return;
            if (d.variavel) respostas[d.variavel] = lista[i];
            porta = i;
          }
        } else if (no.type === "espera") {
          await esperar(Math.min((numero(d.segundos) || 0) * 1000, ESPERA_MAXIMA_MS));
        } else if (no.type === "redirecionar") {
          const link = urlSegura(d.url, config.resolverUrl);
          if (link) abrirLink(link, !!d.novaAba);
          if (!d.novaAba) break;
        } else if (no.type === "webhook") {
          await enviarWebhook(d.url, fluxo, respostas);
        } else if (no.type === "fim") {
          break;
        }
        no = proximoNo(fluxo, no.id, porta);
      }
      if (ativo()) entrada.innerHTML = "";
    }

    rodar();
  }

  global.FluxoChat = { executar };
})(window);
