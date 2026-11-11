// FluxoBot - registro automático e análises na planilha (versão 3)
//
// COMO INSTALAR (ou atualizar):
//   1. Abra a sua planilha > Extensões > Apps Script.
//   2. Apague o código antigo, cole este e clique em Salvar.
//   3. Implantar > Gerenciar implantações > lápis (editar) > Versão: "Nova versão" > Implantar.
//      (Na primeira vez: Implantar > Nova implantação > App da Web,
//       Executar como: Eu | Quem pode acessar: Qualquer pessoa.)
//
// O QUE ELE FAZ:
//   - Cada bot ganha uma aba (com o nome do bot) e cada visitante vira UMA linha,
//     mesmo que não responda nada. A linha é atualizada a cada resposta/escolha.
//   - Colunas: data, sessao, origem, caminho (botões clicados), concluiu, atualizado,
//     ultimo_passo, trilha (blocos vistos, usada na análise) e uma por variável.
//   - A aba "📊 Resumo" conta os acessos e as conversas concluídas de cada bot.
//   - O editor pede a análise por bloco (funil), por origem, por dia e de tempo.

var VERSAO = 3;
var ABA_RESUMO = "📊 Resumo";
var COLUNAS_FIXAS = ["data", "sessao", "origem", "caminho", "concluiu", "atualizado"];
var FUSO = "America/Sao_Paulo";

function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  if (d.evento === "teste") return resposta("ok");
  if (!d.sessao) d.sessao = Utilities.getUuid(); // formato antigo (versão 1)
  var evento = d.evento || "completo";

  var trava = LockService.getScriptLock();
  trava.waitLock(30000); // evita bagunça quando várias pessoas entram juntas
  try {
    var aba = obterAba(nomeDaAba(d.fluxo));
    var cabecalho = obterCabecalho(aba);
    garantirColunas(aba, cabecalho, COLUNAS_FIXAS.concat(Object.keys(d.respostas || {})));

    var linha = acharLinha(aba, cabecalho, d.sessao);
    var jaConcluiu = linha ? lerCelula(aba, cabecalho, linha, "concluiu") === "sim" : false;

    if (evento === "inicio") {
      if (!linha) { gravar(aba, cabecalho, 0, d, false); contar(d.fluxo, 2); }
    } else {
      var concluiu = evento === "fim" || evento === "completo";
      gravar(aba, cabecalho, linha, d, concluiu);
      if (!linha) contar(d.fluxo, 2); // chegou sem "inicio": conta o acesso
      if (concluiu && !jaConcluiu) contar(d.fluxo, 3);
    }
  } finally {
    trava.releaseLock();
  }
  return resposta("ok");
}

// Leitura pública (usada pelo editor): só números agregados, nunca respostas de pessoas
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.acao === "versao") return json({ versao: VERSAO });
  if (p.acao === "estatisticas") return json({ versao: VERSAO, bots: lerResumo() });
  if (p.acao === "funil") return json(funil(p.bot));
  return resposta("FluxoBot ativo (versão " + VERSAO + ")");
}

/* ---------- Abas e colunas ---------- */
function nomeDaAba(nome) {
  var limpo = String(nome || "sem-nome").replace(/[\[\]\*\?:\/\\]/g, " ").trim().slice(0, 90);
  return limpo || "sem-nome";
}

function obterAba(nome) {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  return planilha.getSheetByName(nome) || planilha.insertSheet(nome);
}

function obterCabecalho(aba) {
  if (aba.getLastRow() === 0 || aba.getLastColumn() === 0) aba.appendRow(COLUNAS_FIXAS);
  return aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0].map(String);
}

function garantirColunas(aba, cabecalho, colunas) {
  colunas.forEach(function (c) {
    if (cabecalho.indexOf(c) === -1) {
      aba.getRange(1, cabecalho.length + 1).setValue(c);
      cabecalho.push(c);
    }
  });
}

/* ---------- Linhas por visitante ---------- */
function acharLinha(aba, cabecalho, sessao) {
  var coluna = cabecalho.indexOf("sessao") + 1;
  if (aba.getLastRow() < 2 || coluna < 1) return 0;
  var achado = aba.getRange(2, coluna, aba.getLastRow() - 1, 1).createTextFinder(String(sessao)).matchEntireCell(true).findNext();
  return achado ? achado.getRow() : 0;
}

function lerCelula(aba, cabecalho, linha, coluna) {
  var i = cabecalho.indexOf(coluna);
  return i === -1 ? "" : String(aba.getRange(linha, i + 1).getValue());
}

function gravar(aba, cabecalho, linha, d, concluiu) {
  var antigo = linha ? aba.getRange(linha, 1, 1, cabecalho.length).getValues()[0] : [];
  var respostas = d.respostas || {};
  // Eventos podem chegar fora de ordem: vale sempre o que tem a trilha mais completa (a mais longa)
  var iTrilha = cabecalho.indexOf("trilha");
  var trilhaAntiga = linha && iTrilha > -1 ? String(antigo[iTrilha] || "") : "";
  var trilhaNova = String(respostas.trilha || "");
  var novoVence = trilhaNova.length >= trilhaAntiga.length;

  var valores = cabecalho.map(function (coluna, i) {
    var anterior = linha ? antigo[i] : "";
    if (coluna === "data") return linha ? anterior : d.data;
    if (coluna === "sessao") return d.sessao;
    if (coluna === "origem") return linha ? anterior : (d.origem || "");
    if (coluna === "caminho") return d.caminho && String(d.caminho).length >= String(anterior || "").length ? d.caminho : anterior;
    if (coluna === "concluiu") return concluiu ? "sim" : (anterior || "não");
    if (coluna === "atualizado") {
      var antes = anterior ? paraData(anterior).getTime() : 0;
      return antes > paraData(d.data).getTime() ? anterior : d.data; // fica sempre o horário mais recente
    }
    if (coluna === "trilha" || coluna === "ultimo_passo") {
      return novoVence && respostas[coluna] !== undefined ? respostas[coluna] : anterior;
    }
    return respostas[coluna] !== undefined ? protegerTexto(respostas[coluna]) : anterior;
  });
  if (linha) aba.getRange(linha, 1, 1, cabecalho.length).setValues([valores]);
  else aba.appendRow(valores);
}

// Impede que uma resposta começando com = + - @ vire fórmula na planilha
function protegerTexto(valor) {
  var texto = String(valor);
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}

/* ---------- Resumo / contador ---------- */
function abaResumo() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba = planilha.getSheetByName(ABA_RESUMO);
  if (!aba) {
    aba = planilha.insertSheet(ABA_RESUMO, 0);
    aba.appendRow(["bot", "acessos", "concluidos", "ultimo_acesso"]);
    aba.setFrozenRows(1);
  }
  return aba;
}

// coluna: 2 = acessos, 3 = concluídos
function contar(bot, coluna) {
  var aba = abaResumo();
  var nome = nomeDaAba(bot);
  var achado = aba.getLastRow() > 1
    ? aba.getRange(2, 1, aba.getLastRow() - 1, 1).createTextFinder(nome).matchEntireCell(true).findNext()
    : null;
  var linha = achado ? achado.getRow() : 0;
  if (!linha) { aba.appendRow([nome, 0, 0, ""]); linha = aba.getLastRow(); }
  var celula = aba.getRange(linha, coluna);
  celula.setValue((Number(celula.getValue()) || 0) + 1);
  if (coluna === 2) aba.getRange(linha, 4).setValue(new Date());
}

function lerResumo() {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_RESUMO);
  var bots = {};
  if (!aba || aba.getLastRow() < 2) return bots;
  aba.getRange(2, 1, aba.getLastRow() - 1, 4).getValues().forEach(function (l) {
    bots[l[0]] = { acessos: Number(l[1]) || 0, concluidos: Number(l[2]) || 0, ultimo: l[3] ? new Date(l[3]).toISOString() : "" };
  });
  return bots;
}

/* ---------- Análise (funil por bloco, origem, dia e tempo) ---------- */
function paraData(v) { return v instanceof Date ? v : new Date(String(v)); }

function mediana(lista) {
  if (!lista.length) return 0;
  var o = lista.slice().sort(function (a, b) { return a - b; });
  var m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

function funil(bot) {
  var vazio = { versao: VERSAO, ok: true, bot: bot || "", total: 0, concluidos: 0, semTrilha: 0, saiuAntesDoPrimeiro: 0,
    reached: {}, exits: {}, opcoes: {}, origens: [], porDia: [], duracao: { mediaConclusaoSeg: 0, medianaSaidaSeg: 0 } };
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomeDaAba(bot));
  if (!aba || aba.getLastRow() < 2) return vazio;

  var cab = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0].map(String);
  var linhas = aba.getRange(2, 1, aba.getLastRow() - 1, cab.length).getValues();
  var col = function (n) { return cab.indexOf(n); };
  var iConc = col("concluiu"), iOrig = col("origem"), iTri = col("trilha"), iAtu = col("atualizado"), iData = col("data");

  var r = vazio;
  var porOrigem = {}, porDia = {}, duracoesConc = [], duracoesSaida = [];

  linhas.forEach(function (l) {
    r.total++;
    var conc = iConc > -1 && String(l[iConc]) === "sim";
    if (conc) r.concluidos++;

    var origem = String((iOrig > -1 && l[iOrig]) || "direto");
    var o = porOrigem[origem] || (porOrigem[origem] = { origem: origem, total: 0, concluidos: 0 });
    o.total++;
    if (conc) o.concluidos++;

    var dt = iData > -1 && l[iData] ? paraData(l[iData]) : null;
    if (dt && !isNaN(dt.getTime())) {
      var dia = Utilities.formatDate(dt, FUSO, "yyyy-MM-dd");
      var x = porDia[dia] || (porDia[dia] = { dia: dia, total: 0, concluidos: 0 });
      x.total++;
      if (conc) x.concluidos++;
      if (iAtu > -1 && l[iAtu]) {
        var seg = (paraData(l[iAtu]).getTime() - dt.getTime()) / 1000;
        if (seg >= 0 && seg < 6 * 3600) (conc ? duracoesConc : duracoesSaida).push(seg);
      }
    }

    // Linhas antigas (sem "atualizado") não têm trilha: ficam fora do funil
    if (iAtu === -1 || !l[iAtu]) { r.semTrilha++; return; }
    var trilha = iTri > -1 ? String(l[iTri] || "") : "";
    if (!trilha) { r.saiuAntesDoPrimeiro++; return; }

    var vistos = {};
    var ultimo = "";
    trilha.split(">").forEach(function (t) {
      if (!t) return;
      if (t.indexOf("=") > -1) {
        var p = t.split("=");
        var m = r.opcoes[p[0]] || (r.opcoes[p[0]] = {});
        m[p[1]] = (m[p[1]] || 0) + 1;
        return;
      }
      ultimo = t;
      if (!vistos[t]) { vistos[t] = 1; r.reached[t] = (r.reached[t] || 0) + 1; }
    });
    if (!conc && ultimo) r.exits[ultimo] = (r.exits[ultimo] || 0) + 1;
  });

  r.origens = Object.keys(porOrigem).map(function (k) { return porOrigem[k]; }).sort(function (a, b) { return b.total - a.total; });
  r.porDia = Object.keys(porDia).sort().slice(-14).map(function (k) { return porDia[k]; });
  r.duracao.mediaConclusaoSeg = duracoesConc.length ? Math.round(duracoesConc.reduce(function (a, b) { return a + b; }, 0) / duracoesConc.length) : 0;
  r.duracao.medianaSaidaSeg = Math.round(mediana(duracoesSaida));
  return r;
}

/* ---------- Respostas ---------- */
function resposta(texto) {
  return ContentService.createTextOutput(texto);
}

function json(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}
