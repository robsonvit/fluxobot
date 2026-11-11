/* Painel "Análise": onde as pessoas saem da conversa, bloco a bloco, e o que melhorar.
   Os números vêm da planilha (script v3, ação "funil"). */
(function () {
  const UI = window.UI;
  const $ = (id) => document.getElementById(id);
  const painel = $("analise");
  const botao = $("btn-analise");
  const TIPOS = window.EditorNos.TIPOS;

  const PESO_PESADO = 600 * 1024;       // acima disso a mídia demora no celular
  const OFERTA_DEMORADA_SEG = 120;      // primeiro link de venda depois disso é tarde
  const MIN_VISITANTES = 30;            // abaixo disso as porcentagens oscilam muito
  const SAIDA_ALTA = 15;                // % dos que chegaram e saíram neste bloco
  const SAIDA_MEDIA = 7;

  let dados = null;
  let erro = "";
  let carregando = false;
  let mostrarSelos = true;
  const pesos = {};

  /* ---------- Cálculos sobre o fluxo ---------- */
  const num = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const fluxo = () => window.FluxoEditor.obter();
  const achar = (id) => fluxo().nodes.find((n) => n.id === id);
  const fmtSeg = (s) => (s >= 60 ? Math.floor(s / 60) + " min " + Math.round(s % 60) + " s" : Math.round(s) + " s");
  const fmtMB = (b) => (b / 1048576).toFixed(1).replace(".", ",") + " MB";

  function rotulo(no) {
    const d = no.data || {};
    let t = String(d.texto || d.url || (d.segundos != null ? d.segundos + " s" : "") || "").replace(/\s+/g, " ").trim();
    if (["imagem", "audio", "video"].includes(no.type)) t = t.split("/").pop().split("?")[0];
    return ((TIPOS[no.type] || { titulo: no.type }).titulo) + (t ? ": " + t.slice(0, 34) : "");
  }

  /* Blocos na ordem em que a conversa os mostra (a partir do início) */
  function ordenar() {
    const f = fluxo();
    const inicio = f.nodes.find((n) => n.type === "inicio");
    if (!inicio) return [];
    const vistos = new Set([inicio.id]);
    const fila = [inicio.id];
    const ordem = [];
    while (fila.length) {
      const id = fila.shift();
      f.edges.filter((e) => e.from === id).sort((a, b) => (Number(a.port) || 0) - (Number(b.port) || 0)).forEach((e) => {
        if (vistos.has(e.to)) return;
        vistos.add(e.to);
        fila.push(e.to);
        const n = achar(e.to);
        if (n) ordem.push(n);
      });
    }
    return ordem;
  }

  function pesoDoNo(no) {
    const d = no.data || {};
    if (no.type === "espera") return num(d.segundos) || 0;
    if (["mensagem", "imagem", "audio", "video", "pergunta", "botoes"].includes(no.type)) {
      const e = num(d.espera);
      return e === null ? 0.5 : e;
    }
    return 0;
  }

  /* Menor tempo de espera (em segundos) até cada bloco aparecer */
  function esperaAcumulada() {
    const f = fluxo();
    const inicio = f.nodes.find((n) => n.type === "inicio");
    const dist = new Map();
    if (!inicio) return dist;
    dist.set(inicio.id, 0);
    for (let i = 0; i < f.nodes.length; i++) {
      let mudou = false;
      f.edges.forEach((e) => {
        if (!dist.has(e.from)) return;
        const no = achar(e.to);
        if (!no) return;
        const d = dist.get(e.from) + pesoDoNo(no);
        if (!dist.has(e.to) || d < dist.get(e.to)) { dist.set(e.to, d); mudou = true; }
      });
      if (!mudou) break;
    }
    return dist;
  }

  async function medirMidias() {
    const alvos = fluxo().nodes.filter((n) => ["imagem", "audio", "video"].includes(n.type) && n.data.url && !(n.data.url in pesos));
    await Promise.all(alvos.map(async (n) => {
      try {
        const r = await fetch(n.data.url, { method: "HEAD" });
        const tam = Number(r.headers.get("content-length"));
        pesos[n.data.url] = r.ok && tam > 0 ? tam : 0;
      } catch (e) {
        pesos[n.data.url] = 0; // link de outro site: o navegador não deixa medir
      }
    }));
  }

  /* ---------- Busca na planilha ---------- */
  async function buscar() {
    const cfg = window.FluxoBots.config();
    if (!cfg.planilha || !cfg.rastreio) throw new Error("O registro automático está desligado. Configure em ⋯ > Planilha e acessos.");
    const bot = window.FluxoBots.nomeDaAba(fluxo().nome);
    let j;
    try {
      const r = await fetch(`${cfg.planilha}?acao=funil&bot=${encodeURIComponent(bot)}`);
      j = await r.json();
    } catch (e) {
      throw new Error("O script da planilha ainda é uma versão antiga. Cole o novo código (apps-script.gs) e implante uma nova versão.");
    }
    if (!j || !j.ok) throw new Error("A planilha não devolveu a análise. Atualize o script (apps-script.gs).");
    return j;
  }

  async function atualizar() {
    if (carregando) return;
    carregando = true;
    erro = "";
    desenhar();
    try {
      [dados] = await Promise.all([buscar(), medirMidias()]);
    } catch (e) {
      dados = null;
      erro = e.message;
    }
    carregando = false;
    desenhar();
    aplicar();
  }

  /* ---------- Sugestões automáticas ---------- */
  function sugestoes(base, espAc) {
    const f = fluxo();
    const lista = [];
    const add = (tipo, texto) => lista.push({ tipo, texto });

    if (base < MIN_VISITANTES) add("info", `Só ${base} visitante(s) com dados por bloco até agora. Com menos de ${MIN_VISITANTES} as porcentagens oscilam muito: use como pista, não como regra.`);

    const saidas = Object.entries(dados.exits).map(([id, n]) => ({ no: achar(id), n })).filter((x) => x.no).sort((a, b) => b.n - a.n).slice(0, 3);
    saidas.forEach(({ no, n }) => {
      const p = pct(n, base);
      if (p < 5) return;
      const d = no.data || {};
      const espera = espAc.get(no.id);
      let dica = "";
      if (no.type === "pergunta") dica = "Perguntas digitadas custam caro. Troque por botões ou deixe a pergunta para depois de entregar algo.";
      else if (no.type === "imagem" || no.type === "video") dica = (pesos[d.url] || 0) > PESO_PESADO ? `A mídia pesa ${fmtMB(pesos[d.url])}: comprima para ~200 KB.` : "Tente antecipar esse conteúdo ou reduzir a espera antes dele.";
      else if (no.type === "audio") dica = "Teste um áudio mais curto (até uns 15 s) ou reduza a espera antes dele.";
      else if (no.type === "mensagem") dica = (num(d.espera) || 0) >= 6 ? `Há ${num(d.espera)} s de espera antes dela: reduza para 2 a 3 s.` : "Mensagem longa? Divida em duas mais curtas.";
      else if (no.type === "botoes") dica = "Deixe a opção principal mais clara e chamativa. Um botão só costuma levar mais gente adiante.";
      else if (no.type === "redirecionar") dica = "Se saem no link, olhe a página de destino (lentidão, preço, confiança).";
      add(p >= 12 ? "alerta" : "dica", `${rotulo(no)}: ${p}% de todos os visitantes saem aqui${espera != null ? ` (depois de ~${fmtSeg(espera)} de espera)` : ""}. ${dica}`);
    });

    const antes = pct(dados.saiuAntesDoPrimeiro, base + dados.saiuAntesDoPrimeiro);
    if (antes >= 10) add("alerta", `${antes}% saem antes de ver a primeira mensagem. Costuma ser página lenta (mídias pesadas) ou clique acidental.`);

    const oferta = f.nodes.filter((n) => n.type === "redirecionar").map((n) => espAc.get(n.id)).filter((v) => v != null).sort((a, b) => a - b)[0];
    if (oferta != null && oferta > OFERTA_DEMORADA_SEG) add("alerta", `O primeiro link de venda só aparece depois de ~${fmtSeg(oferta)} de espera. Tente levar a oferta para perto de 1 a 2 minutos (ou antecipe uma prévia da oferta).`);

    if (dados.duracao.medianaSaidaSeg && dados.duracao.medianaSaidaSeg < 30) add("dica", `Metade de quem sai vai embora em menos de ${fmtSeg(Math.max(10, dados.duracao.medianaSaidaSeg))}. O começo precisa prender: primeira mensagem curta e a primeira mídia mais cedo.`);

    const pesadas = f.nodes.filter((n) => ["imagem", "video", "audio"].includes(n.type) && (pesos[n.data.url] || 0) > PESO_PESADO);
    if (pesadas.length) add("dica", `${pesadas.length} mídia(s) pesada(s): ${pesadas.slice(0, 3).map((n) => `${rotulo(n)} (${fmtMB(pesos[n.data.url])})`).join("; ")}. No celular com dados móveis elas demoram. O envio pelo editor já reduz imagens sozinho.`);

    const origens = dados.origens.filter((o) => o.total >= 10);
    if (origens.length >= 2) {
      const ordenadas = [...origens].sort((a, b) => pct(b.concluidos, b.total) - pct(a.concluidos, a.total));
      const melhor = ordenadas[0];
      const pior = ordenadas[ordenadas.length - 1];
      add("info", `A origem "${melhor.origem}" converte ${pct(melhor.concluidos, melhor.total)}% e "${pior.origem}" só ${pct(pior.concluidos, pior.total)}%. Invista mais onde converte melhor.`);
    }

    f.nodes.forEach((n) => {
      if (n.type !== "botoes") return;
      (n.data.opcoes || []).forEach((o, i) => {
        if (!f.edges.some((e) => e.from === n.id && String(e.port) === String(i))) add("alerta", `O botão "${o}" não leva a lugar nenhum: a conversa para nele.`);
      });
    });

    const taxa = pct(dados.concluidos, dados.total);
    if (dados.total >= MIN_VISITANTES && taxa < 10) add("info", `Conclusão geral de ${taxa}%. Como referência aproximada, funis de chat costumam ficar entre 10% e 30%: ataque primeiro os maiores vazamentos acima.`);
    return lista;
  }

  /* ---------- Selos nos blocos ---------- */
  function nivel(saiu, chegou) {
    const p = pct(saiu, chegou);
    return p >= SAIDA_ALTA ? "alto" : p >= SAIDA_MEDIA ? "medio" : "baixo";
  }

  function aplicar() {
    document.querySelectorAll("#quadro .metrica").forEach((m) => m.remove());
    if (!dados || !painel.classList.contains("aberto") || !mostrarSelos) return;
    const base = dados.total - dados.semTrilha;
    if (base <= 0) return;
    document.querySelectorAll("#quadro .no").forEach((el) => {
      const id = el.dataset.id;
      const tipo = el.dataset.type;
      const chegou = tipo === "inicio" ? base : (dados.reached[id] || 0);
      const saiu = dados.exits[id] || 0;
      const m = UI.el("div", "metrica " + (tipo === "inicio" ? "baixo" : chegou ? nivel(saiu, chegou) : "vazio"));
      m.title = "Chegaram: quantos viram este bloco. Saíram aqui: dos que chegaram, quantos pararam neste bloco.";
      if (tipo === "inicio") m.textContent = `${base} visitantes`;
      else if (!chegou) m.textContent = "ninguém chegou aqui";
      else m.textContent = `${pct(chegou, base)}% chegaram · ${pct(saiu, chegou)}% saíram aqui`;
      el.append(m);
    });
  }

  /* ---------- Desenho do painel ---------- */
  const el = UI.el;

  function secao(titulo) {
    const s = el("div", "secao");
    s.append(el("h3", "", titulo));
    return s;
  }

  function cartao(valor, rotuloCartao, detalhe) {
    const c = el("div", "cartao");
    c.append(el("strong", "", valor), el("span", "", rotuloCartao));
    if (detalhe) c.append(el("small", "", detalhe));
    return c;
  }

  function linhaFunil(no, indice, base, espAc) {
    const chegou = dados.reached[no.id] || 0;
    const saiu = dados.exits[no.id] || 0;
    const b = el("button", "fn-linha");
    b.type = "button";
    b.onclick = () => window.FluxoEditor.focarNo(no.id);
    const topo = el("div", "fn-topo");
    topo.append(el("span", "fn-idx", String(indice)), el("span", "fn-texto", rotulo(no)));
    topo.append(el("span", "fn-num", pct(chegou, base) + "%"));
    const sai = el("span", "fn-saida " + (chegou ? nivel(saiu, chegou) : "vazio"), chegou ? "−" + pct(saiu, chegou) + "%" : "–");
    topo.append(sai);
    const barra = el("div", "fn-barra");
    const preenchido = el("i");
    preenchido.style.width = pct(chegou, base) + "%";
    barra.append(preenchido);
    b.append(topo, barra);
    const t = espAc.get(no.id);
    b.title = `${chegou} chegaram, ${saiu} saíram aqui` + (t != null ? ` · aparece após ~${fmtSeg(t)} de espera` : "");
    return b;
  }

  function desenhar() {
    painel.innerHTML = "";
    const topo = el("div", "topo");
    topo.append(el("span", "", "Análise do bot"));
    const acoes = el("span", "acoes-painel");
    const atu = el("button", "", "");
    atu.type = "button";
    atu.title = "Atualizar os números";
    atu.innerHTML = UI.icone("reiniciar", 16);
    atu.onclick = atualizar;
    const fechar = el("button", "", "");
    fechar.type = "button";
    fechar.innerHTML = UI.icone("x", 16);
    fechar.onclick = () => { painel.classList.remove("aberto"); aplicar(); };
    acoes.append(atu, fechar);
    topo.append(acoes);
    painel.append(topo);

    if (carregando) { painel.append(el("p", "analise-msg", "Buscando os números na planilha...")); return; }
    if (erro) { painel.append(el("p", "analise-msg erro", erro)); return; }
    if (!dados) { painel.append(el("p", "analise-msg", "Clique em atualizar para buscar os números.")); return; }

    const base = dados.total - dados.semTrilha;
    const espAc = esperaAcumulada();

    const resumo = secao("Resumo");
    const grade = el("div", "cartoes");
    grade.append(
      cartao(String(dados.total), "acessos"),
      cartao(pct(dados.concluidos, dados.total) + "%", "concluíram", `${dados.concluidos} pessoas`),
      cartao(dados.duracao.mediaConclusaoSeg ? fmtSeg(dados.duracao.mediaConclusaoSeg) : "–", "tempo até concluir", "média"),
      cartao(pct(dados.saiuAntesDoPrimeiro, dados.total) + "%", "saem sem ver nada", `${dados.saiuAntesDoPrimeiro} pessoas`),
    );
    resumo.append(grade);
    if (dados.semTrilha > 0) resumo.append(el("p", "nota", `Os números por bloco usam ${base} visitante(s). Os ${dados.semTrilha} anteriores à análise entram só nos totais.`));
    painel.append(resumo);

    if (base <= 0) {
      painel.append(el("p", "analise-msg", "Ainda não há visitantes com dados por bloco. Assim que alguém abrir o chat publicado, os números começam a aparecer aqui."));
      return;
    }

    const interruptor = el("label", "interruptor selos");
    const marca = el("input");
    marca.type = "checkbox";
    marca.checked = mostrarSelos;
    marca.onchange = () => { mostrarSelos = marca.checked; aplicar(); };
    interruptor.append(marca, el("span", "", "Mostrar números em cada bloco do fluxo"));
    const ctl = el("div", "secao");
    ctl.append(interruptor);
    painel.append(ctl);

    const dicas = sugestoes(base, espAc);
    if (dicas.length) {
      const s = secao("O que melhorar");
      dicas.forEach((d) => s.append(el("div", "dica-analise " + d.tipo, d.texto)));
      painel.append(s);
    }

    const ordem = ordenar();
    const piores = Object.entries(dados.exits).map(([id, n]) => ({ no: achar(id), n })).filter((x) => x.no).sort((a, b) => b.n - a.n).slice(0, 5);
    if (piores.length) {
      const s = secao("Onde mais saem");
      piores.forEach(({ no, n }) => {
        const l = el("button", "fn-linha");
        l.type = "button";
        l.onclick = () => window.FluxoEditor.focarNo(no.id);
        const t = el("div", "fn-topo");
        t.append(el("span", "fn-texto", rotulo(no)), el("span", "fn-saida " + nivel(n, dados.reached[no.id] || n), pct(n, base) + "% de todos"));
        l.append(t);
        s.append(l);
      });
      painel.append(s);
    }

    const funilSec = secao("Funil bloco a bloco");
    funilSec.append(el("p", "nota", "Barra = % de quem chegou. Vermelho/laranja = muita gente sai neste bloco. Clique para ir até ele."));
    ordem.forEach((no, i) => funilSec.append(linhaFunil(no, i + 1, base, espAc)));
    painel.append(funilSec);

    const botoes = fluxo().nodes.filter((n) => n.type === "botoes" && dados.opcoes[n.id]);
    if (botoes.length) {
      const s = secao("Botões mais clicados");
      botoes.forEach((n) => {
        const cont = dados.opcoes[n.id];
        const total = Object.values(cont).reduce((a, b) => a + b, 0);
        s.append(el("div", "rotulo-botao", rotulo(n) || "Botões"));
        (n.data.opcoes || []).forEach((o, i) => {
          const c = cont[String(i)] || 0;
          const l = el("div", "op-linha");
          l.append(el("span", "", o), el("b", "", pct(c, total) + "%"));
          const barra = el("div", "fn-barra");
          const p = el("i");
          p.style.width = pct(c, total) + "%";
          barra.append(p);
          s.append(l, barra);
        });
      });
      painel.append(s);
    }

    if (dados.origens.length) {
      const s = secao("De onde vêm (origem)");
      const tab = el("div", "tabela");
      dados.origens.slice(0, 6).forEach((o) => {
        const l = el("div", "tab-linha");
        l.append(el("span", "", o.origem), el("span", "", o.total + " acessos"), el("b", "", pct(o.concluidos, o.total) + "% concluem"));
        tab.append(l);
      });
      s.append(tab, el("p", "nota", "Divulgue o link com ?utm_source=nome para separar as origens. Ex.: chat.html?f=bot&utm_source=instagram"));
      painel.append(s);
    }

    if (dados.porDia.length) {
      const s = secao("Acessos por dia");
      const maximo = Math.max(...dados.porDia.map((d) => d.total), 1);
      const grafico = el("div", "dias");
      dados.porDia.forEach((d) => {
        const col = el("div", "dia");
        col.title = `${d.dia.split("-").reverse().slice(0, 2).join("/")}: ${d.total} acessos, ${d.concluidos} concluíram`;
        const barra = el("i");
        barra.style.height = Math.max(4, (d.total / maximo) * 70) + "px";
        col.append(barra, el("span", "", d.dia.slice(8)));
        grafico.append(col);
      });
      s.append(grafico);
      painel.append(s);
    }
  }

  /* ---------- Abrir / fechar ---------- */
  botao.onclick = () => {
    if (painel.classList.contains("aberto")) { painel.classList.remove("aberto"); aplicar(); return; }
    $("tema").classList.remove("aberto");
    painel.classList.add("aberto");
    desenhar();
    atualizar();
  };

  window.FluxoAnalise = {
    aplicar,
    recarregar: () => { dados = null; erro = ""; if (painel.classList.contains("aberto")) atualizar(); else aplicar(); },
  };
})();
