/* Motor do chat: lê um fluxo (JSON) e conversa com o visitante.
   Uso: FluxoChat.executar(fluxo, elementoHTML) */
(function (global) {
  const ESPERA_MS = 500;

  function interpolar(texto, vars) {
    return (texto || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] ?? ""));
  }

  function proximoNo(fluxo, deId, porta) {
    const aresta = fluxo.edges.find((e) => e.from === deId && String(e.port) === String(porta));
    return aresta ? fluxo.nodes.find((n) => n.id === aresta.to) : null;
  }

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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

  function executar(fluxo, raiz) {
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

    function adicionar(texto, quem) {
      const d = document.createElement("div");
      d.className = "fc-msg fc-" + quem;
      d.textContent = texto; // textContent evita injeção de HTML
      mensagens.append(d);
      rolar();
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

    function pedirBotao(opcoes) {
      return new Promise((resolve) => {
        entrada.innerHTML = "";
        const caixa = document.createElement("div");
        caixa.className = "fc-botoes";
        opcoes.forEach((rotulo, i) => {
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
      while (no && ativo() && passos++ < 500) {
        const d = no.data || {};
        let porta = "out";
        if (no.type === "mensagem") {
          await esperar(ESPERA_MS);
          if (!ativo()) return;
          adicionar(interpolar(d.texto, respostas), "bot");
        } else if (no.type === "pergunta") {
          await esperar(ESPERA_MS);
          if (!ativo()) return;
          adicionar(interpolar(d.texto, respostas), "bot");
          const valor = await pedirTexto(d.tipo || "texto");
          if (!ativo()) return;
          if (d.variavel) respostas[d.variavel] = valor;
        } else if (no.type === "botoes") {
          await esperar(ESPERA_MS);
          if (!ativo()) return;
          adicionar(interpolar(d.texto, respostas), "bot");
          const opcoes = d.opcoes || [];
          const i = await pedirBotao(opcoes);
          if (!ativo()) return;
          if (d.variavel) respostas[d.variavel] = opcoes[i];
          porta = i;
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
